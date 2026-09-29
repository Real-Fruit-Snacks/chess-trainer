import type { Fen, Uci } from '@/chess/types';
import { type BestMove, parseBestMove, parseInfo, type SearchInfo } from './uci';

export interface SearchParams {
  fen: Fen;
  /** Moves played after `fen`, in UCI. Lets the engine keep repetition history. */
  moves?: Uci[];
  depth?: number;
  /** Milliseconds. */
  movetime?: number;
  nodes?: number;
  multipv?: number;
  /** Restrict the search to these root moves. */
  searchmoves?: Uci[];
  /** Search until `stop()` is called. */
  infinite?: boolean;
}

export interface SearchResult {
  bestmove: BestMove;
  /** Latest info line per MultiPV index (1-based). */
  lines: Map<number, SearchInfo>;
  /** True if the search ended because `stop()` was called. */
  stopped: boolean;
}

export interface SearchHandle {
  readonly id: number;
  readonly result: Promise<SearchResult>;
  stop(): void;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EngineOptions {
  /** URL of the engine's worker script. Defaults to the bundled Stockfish build. */
  workerUrl?: string;
  /** Milliseconds to wait for `uciok` before giving up. */
  initTimeoutMs?: number;
  /** Hash table size in MB. */
  hashMb?: number;
}

export const DEFAULT_ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

export class EngineUnsupportedError extends Error {
  constructor(
    message = 'This browser cannot run the chess engine (WebAssembly or Web Workers are unavailable).',
  ) {
    super(message);
    this.name = 'EngineUnsupportedError';
  }
}

export function isEngineSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly === 'object';
}

/**
 * Thin, promise-based client for a UCI engine running in a Web Worker.
 *
 * All searches are serialised: starting a new search while one is running
 * stops the previous one first (its promise resolves with `stopped: true`).
 */
export class EngineClient {
  readonly name: string = 'Stockfish';
  private worker: Worker | null = null;
  private lineListeners = new Set<(line: string) => void>();
  private readonly options: Required<EngineOptions>;
  private readyPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private current: { id: number; stop: () => void } | null = null;
  private nextId = 1;
  private currentMultiPv = 1;
  private terminated = false;

  status: EngineStatus = 'idle';
  error: Error | null = null;

  constructor(options: EngineOptions = {}) {
    this.options = {
      workerUrl: options.workerUrl ?? DEFAULT_ENGINE_URL,
      initTimeoutMs: options.initTimeoutMs ?? 30_000,
      hashMb: options.hashMb ?? 16,
    };
  }

  /** Boots the worker and completes the UCI handshake. Safe to call repeatedly. */
  init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.boot();
    return this.readyPromise;
  }

  private async boot(): Promise<void> {
    if (!isEngineSupported()) {
      this.status = 'error';
      this.error = new EngineUnsupportedError();
      throw this.error;
    }
    this.status = 'loading';
    try {
      const worker = new Worker(this.options.workerUrl);
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (typeof data !== 'string') return;
        for (const listener of this.lineListeners) listener(data);
      };
      const failure = new Promise<never>((_, reject) => {
        worker.onerror = (event) => {
          reject(new Error(`Engine worker failed to load: ${event.message || 'unknown error'}`));
        };
      });

      await Promise.race([
        (async () => {
          this.send('uci');
          await this.waitFor((line) => line === 'uciok', this.options.initTimeoutMs);
          this.send(`setoption name Hash value ${this.options.hashMb}`);
          this.send('isready');
          await this.waitFor((line) => line === 'readyok', this.options.initTimeoutMs);
        })(),
        failure,
      ]);
      this.status = 'ready';
    } catch (err) {
      this.status = 'error';
      this.error = err instanceof Error ? err : new Error(String(err));
      this.worker?.terminate();
      this.worker = null;
      throw this.error;
    }
  }

  /** Sends a raw UCI command. Prefer the typed helpers. */
  send(command: string): void {
    if (!this.worker || this.terminated) return;
    this.worker.postMessage(command);
  }

  /** Subscribe to every line the engine prints. Returns an unsubscribe function. */
  onLine(listener: (line: string) => void): () => void {
    this.lineListeners.add(listener);
    return () => this.lineListeners.delete(listener);
  }

  private waitFor(predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('Timed out waiting for the engine to respond.'));
      }, timeoutMs);
      const off = this.onLine((line) => {
        if (predicate(line)) {
          clearTimeout(timer);
          off();
          resolve(line);
        }
      });
    });
  }

  async setOption(name: string, value: string | number | boolean): Promise<void> {
    await this.init();
    this.send(`setoption name ${name} value ${String(value)}`);
  }

  /** Clears hash and search history — call between unrelated games/positions. */
  async newGame(): Promise<void> {
    await this.init();
    this.stop();
    await this.queue;
    this.send('ucinewgame');
    this.send('isready');
    await this.waitFor((line) => line === 'readyok', this.options.initTimeoutMs);
  }

  /** Stops the running search, if any. The search's promise resolves with `stopped: true`. */
  stop(): void {
    this.current?.stop();
  }

  /**
   * Starts a search. If another search is in progress it is stopped first.
   * The returned handle resolves when the engine reports `bestmove`.
   */
  search(params: SearchParams, onInfo?: (info: SearchInfo) => void): SearchHandle {
    const id = this.nextId++;
    let stopRequested = false;
    let stopFn: () => void = () => {
      stopRequested = true;
    };

    // Stop whatever is running so the queue drains quickly.
    this.stop();

    const result = this.queue.then(async () => {
      await this.init();
      if (this.terminated) throw new Error('Engine was terminated.');
      if (stopRequested) {
        return { bestmove: { move: null }, lines: new Map(), stopped: true } satisfies SearchResult;
      }
      return this.runSearch(id, params, onInfo, (fn) => {
        stopFn = fn;
      });
    });
    // Keep the chain alive even when a search fails.
    this.queue = result.catch(() => undefined);

    return {
      id,
      result,
      stop: () => stopFn(),
    };
  }

  private runSearch(
    id: number,
    params: SearchParams,
    onInfo: ((info: SearchInfo) => void) | undefined,
    registerStop: (fn: () => void) => void,
  ): Promise<SearchResult> {
    return new Promise<SearchResult>((resolve, reject) => {
      const lines = new Map<number, SearchInfo>();
      let stopped = false;
      let settled = false;

      const finish = (bestmove: BestMove) => {
        if (settled) return;
        settled = true;
        off();
        if (this.current?.id === id) this.current = null;
        resolve({ bestmove, lines, stopped });
      };

      const off = this.onLine((line) => {
        const info = parseInfo(line);
        if (info) {
          lines.set(info.multipv, info);
          onInfo?.(info);
          return;
        }
        const best = parseBestMove(line);
        if (best) finish(best);
      });

      const stop = () => {
        if (settled || stopped) return;
        stopped = true;
        this.send('stop');
      };
      registerStop(stop);
      this.current = { id, stop };

      try {
        const multipv = Math.max(1, params.multipv ?? 1);
        if (multipv !== this.currentMultiPv) {
          this.send(`setoption name MultiPV value ${multipv}`);
          this.currentMultiPv = multipv;
        }
        const moves = params.moves?.length ? ` moves ${params.moves.join(' ')}` : '';
        this.send(`position fen ${params.fen}${moves}`);

        const go: string[] = ['go'];
        if (params.searchmoves?.length) go.push('searchmoves', ...params.searchmoves);
        if (params.infinite) go.push('infinite');
        else {
          if (params.depth !== undefined) go.push('depth', String(params.depth));
          if (params.movetime !== undefined) go.push('movetime', String(params.movetime));
          if (params.nodes !== undefined) go.push('nodes', String(params.nodes));
          if (go.length === 1) go.push('depth', '12');
        }
        this.send(go.join(' '));
      } catch (err) {
        settled = true;
        off();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Shuts the worker down. The instance cannot be reused afterwards. */
  terminate(): void {
    this.terminated = true;
    this.stop();
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
    this.lineListeners.clear();
    this.status = 'idle';
  }
}

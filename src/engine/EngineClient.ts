import type { Fen, Uci } from '@/chess/types';
import { describeEngine, ENGINE_BUILD_URLS, type EngineBuild } from './build';
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
  /** URL of the engine's worker script. Defaults to the bundled Stockfish build for `build`. */
  workerUrl?: string;
  /**
   * Which Stockfish build to load. `multi` needs a cross-origin-isolated page;
   * when it fails to start the client silently falls back to `single`.
   */
  build?: EngineBuild;
  /** Search threads for the `multi` build (ignored for `single`). */
  threads?: number;
  /** Milliseconds to wait for `uciok` before giving up. */
  initTimeoutMs?: number;
  /** Hash table size in MB. */
  hashMb?: number;
}

export class EngineUnsupportedError extends Error {
  constructor(
    message = 'This browser cannot run the chess engine (WebAssembly or Web Workers are unavailable).',
  ) {
    super(message);
    this.name = 'EngineUnsupportedError';
  }
}

/** The worker died (or was shut down) while a search or `newGame` was waiting on it. */
export class EngineCrashedError extends Error {
  constructor(message = 'The engine stopped responding.') {
    super(message);
    this.name = 'EngineCrashedError';
  }
}

export function isEngineSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly === 'object';
}

/**
 * Thin, promise-based client for a UCI engine running in a Web Worker.
 *
 * Every command that needs the engine's attention (`search`, `newGame`) goes
 * through one FIFO queue, so only one search runs at a time. Starting a new
 * search asks the running one to stop (it resolves early with `stopped: true`);
 * searches already waiting in the queue still run, in order, unless their own
 * handle's `stop()` is called first (they then resolve with `stopped: true` and
 * no best move without reaching the engine). `newGame()` also stops the running
 * search and then waits its turn in the queue. A worker that dies after the
 * handshake rejects the pending command with `EngineCrashedError`, marks the
 * client `error` and refuses further work until a fresh client is created.
 */
export class EngineClient {
  private worker: Worker | null = null;
  private lineListeners = new Set<(line: string) => void>();
  private readonly options: Required<Omit<EngineOptions, 'workerUrl'>> & { workerUrl?: string };
  private readyPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private current: { id: number; stop: () => void } | null = null;
  /** Rejects whatever is waiting on the worker when it dies or is terminated. */
  private crashListeners = new Set<(err: Error) => void>();
  /** Owners (e.g. `useEngine`) told when the worker dies after the handshake. */
  private errorListeners = new Set<(err: Error) => void>();
  private nextId = 1;
  private currentMultiPv = 1;
  private terminated = false;

  status: EngineStatus = 'idle';
  error: Error | null = null;
  /** The build that is actually running (may differ from the requested one after a fallback). */
  build: EngineBuild;
  /** Search threads in use. */
  threads = 1;
  /** True when the threaded build was requested but the single-threaded one had to be used. */
  fellBack = false;

  constructor(options: EngineOptions = {}) {
    this.options = {
      workerUrl: options.workerUrl,
      build: options.build ?? 'single',
      threads: Math.max(1, Math.floor(options.threads ?? 1)),
      initTimeoutMs: options.initTimeoutMs ?? 30_000,
      hashMb: options.hashMb ?? 16,
    };
    this.build = this.options.build;
  }

  /** Human-readable name for status lines, e.g. "Stockfish 19 · 4 threads". */
  get name(): string {
    return describeEngine(this.build, this.threads);
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
    const requested = this.options.build;
    try {
      await this.bootBuild(requested);
    } catch (err) {
      if (requested !== 'multi' || this.terminated) this.fail(err);
      // Threads are an optimisation: never let them stop the engine from starting.
      console.warn(
        'Threaded engine failed to start; falling back to the single-threaded build.',
        err,
      );
      this.fellBack = true;
      try {
        await this.bootBuild('single');
      } catch (fallbackErr) {
        this.fail(fallbackErr);
      }
    }
    this.status = 'ready';
  }

  private fail(err: unknown): never {
    this.status = 'error';
    this.error = err instanceof Error ? err : new Error(String(err));
    this.worker?.terminate();
    this.worker = null;
    throw this.error;
  }

  /** Starts a worker for `build` and completes the UCI handshake. */
  private async bootBuild(build: EngineBuild): Promise<void> {
    this.worker?.terminate();
    this.worker = null;
    this.build = build;
    this.threads = build === 'multi' ? this.options.threads : 1;
    const url =
      build === this.options.build && this.options.workerUrl
        ? this.options.workerUrl
        : ENGINE_BUILD_URLS[build];

    const worker = new Worker(url);
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (typeof data !== 'string') return;
      for (const listener of this.lineListeners) listener(data);
    };
    let booted = false;
    const failure = new Promise<never>((_, reject) => {
      worker.onerror = (event) => {
        const message = event.message || 'unknown error';
        if (!booted) {
          reject(new Error(`Engine worker failed to load: ${message}`));
          return;
        }
        // After the handshake a worker error means the engine is gone: fail the
        // pending command and let the owner offer a retry with a fresh client.
        if (this.worker === worker) {
          this.crash(new EngineCrashedError(`Engine crashed: ${message}`));
        }
      };
    });

    try {
      await Promise.race([
        (async () => {
          this.send('uci');
          await this.waitFor((line) => line === 'uciok', this.options.initTimeoutMs);
          if (build === 'multi') this.send(`setoption name Threads value ${this.threads}`);
          this.send(`setoption name Hash value ${this.options.hashMb}`);
          this.send('isready');
          await this.waitFor((line) => line === 'readyok', this.options.initTimeoutMs);
        })(),
        failure,
      ]);
      booted = true;
    } catch (err) {
      worker.terminate();
      if (this.worker === worker) this.worker = null;
      throw err;
    }
  }

  /** The worker is unusable: settle everything waiting on it and stop accepting work. */
  private crash(err: Error): void {
    this.status = 'error';
    this.error = err;
    this.worker?.terminate();
    this.worker = null;
    this.current = null;
    for (const listener of [...this.crashListeners]) listener(err);
    this.crashListeners.clear();
    for (const listener of [...this.errorListeners]) listener(err);
  }

  /**
   * Called when the worker dies after a successful handshake (status becomes
   * `error`). Boot failures are reported through `init()` instead.
   */
  onError(listener: (err: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
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
        cleanup();
        reject(new Error('Timed out waiting for the engine to respond.'));
      }, timeoutMs);
      const onCrash = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(timer);
        off();
        this.crashListeners.delete(onCrash);
      };
      const off = this.onLine((line) => {
        if (predicate(line)) {
          cleanup();
          resolve(line);
        }
      });
      this.crashListeners.add(onCrash);
    });
  }

  private assertUsable(): void {
    if (this.terminated) throw new EngineCrashedError('Engine was terminated.');
    if (this.status === 'error' && this.error) throw this.error;
  }

  async setOption(name: string, value: string | number | boolean): Promise<void> {
    await this.init();
    this.assertUsable();
    this.send(`setoption name ${name} value ${String(value)}`);
  }

  /**
   * Clears hash and search history — call between unrelated games/positions.
   * Queued like a search: the running search (which belongs to the old game)
   * is asked to stop, and `ucinewgame` goes out once it has, before any search
   * started later.
   */
  newGame(): Promise<void> {
    this.stop();
    const run = this.queue.then(async () => {
      this.assertUsable();
      await this.init();
      this.assertUsable();
      this.send('ucinewgame');
      this.send('isready');
      await this.waitFor((line) => line === 'readyok', this.options.initTimeoutMs);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Stops the running search, if any. The search's promise resolves with `stopped: true`. */
  stop(): void {
    this.current?.stop();
  }

  /**
   * Starts a search. The running search is asked to stop so the queue drains
   * quickly; searches queued earlier still run first, in order (call their
   * handle's `stop()` to skip them). The returned handle resolves when the
   * engine reports `bestmove`.
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
      if (stopRequested) {
        return { bestmove: { move: null }, lines: new Map(), stopped: true } satisfies SearchResult;
      }
      this.assertUsable();
      await this.init();
      this.assertUsable();
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

      const cleanup = () => {
        off();
        this.crashListeners.delete(onCrash);
        if (this.current?.id === id) this.current = null;
      };
      const finish = (bestmove: BestMove) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ bestmove, lines, stopped });
      };
      const onCrash = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
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
      this.crashListeners.add(onCrash);

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
        if (params.infinite) go.push('infinite');
        else {
          if (params.depth !== undefined) go.push('depth', String(params.depth));
          if (params.movetime !== undefined) go.push('movetime', String(params.movetime));
          if (params.nodes !== undefined) go.push('nodes', String(params.nodes));
          if (go.length === 1) go.push('depth', '12');
        }
        // Stockfish reads every token after `searchmoves` as a move, so it must come last.
        if (params.searchmoves?.length) go.push('searchmoves', ...params.searchmoves);
        this.send(go.join(' '));
      } catch (err) {
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Shuts the worker down. The instance cannot be reused afterwards; searches
   * and `newGame` calls still waiting reject with `EngineCrashedError`.
   */
  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
    this.current = null;
    const err = new EngineCrashedError('Engine was terminated.');
    for (const listener of [...this.crashListeners]) listener(err);
    this.crashListeners.clear();
    this.errorListeners.clear();
    this.lineListeners.clear();
    this.status = 'idle';
  }
}

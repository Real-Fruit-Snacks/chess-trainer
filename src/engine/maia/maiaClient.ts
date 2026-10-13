import { useSyncExternalStore } from 'react';
import type { Fen } from '@/chess/types';
import { MAIA_DIR, MAIA_FILES } from '@/sw/maiaFiles';
import { type MaiaMove, maiaPolicy, maiaTokens, maiaValue, type MaiaValue } from './encoding';
import type { MaiaRequest, MaiaResponse } from './protocol';

/**
 * The human-like opponent on the page's side: starts its worker when first
 * needed, loads the model once, and turns the model's scores for a position
 * into legal moves with the chance a player of the rating plays each.
 */

export type MaiaStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface MaiaPrediction {
  /** The legal moves, likeliest first; their probabilities sum to 1. */
  moves: MaiaMove[];
  /** How players of the rating fare from here, for the side to move. */
  value: MaiaValue;
}

/** The worker as the client uses it (a stand-in in tests). */
export interface MaiaWorkerPort {
  postMessage(message: MaiaRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<MaiaResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface MaiaUrls {
  modelUrl: string;
  runtimeUrl: string;
}

interface Pending {
  resolve: (output: { logits: Float32Array; value: Float32Array }) => void;
  reject: (err: Error) => void;
}

export class MaiaClient {
  private statusValue: MaiaStatus = 'idle';
  private errorValue: string | null = null;
  private worker: MaiaWorkerPort | null = null;
  private loading: Promise<void> | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly spawn: () => MaiaWorkerPort,
    private readonly urls: MaiaUrls,
  ) {}

  get status(): MaiaStatus {
    return this.statusValue;
  }

  /** Why the model could not be loaded (after `failed`). */
  get error(): string | null {
    return this.errorValue;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(status: MaiaStatus, error: string | null = null): void {
    this.statusValue = status;
    this.errorValue = error;
    for (const listener of this.listeners) listener();
  }

  /** Loads the model (once; a failed load can be tried again). */
  load(): Promise<void> {
    if (this.statusValue === 'ready') return Promise.resolve();
    if (this.loading) return this.loading;
    this.set('loading');
    const loading = new Promise<void>((resolve, reject) => {
      const worker = this.spawn();
      this.worker = worker;
      const fail = (message: string) => {
        this.shutDown(message);
        this.set('failed', message);
        reject(new Error(message));
      };
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === 'loaded') {
          this.set('ready');
          resolve();
        } else if (message.type === 'load-failed') {
          fail(message.message);
        } else if (message.type === 'prediction') {
          const waiting = this.pending.get(message.id);
          this.pending.delete(message.id);
          waiting?.resolve({
            logits: new Float32Array(message.logits),
            value: new Float32Array(message.value),
          });
        } else {
          const waiting = this.pending.get(message.id);
          this.pending.delete(message.id);
          waiting?.reject(new Error(message.message));
        }
      };
      worker.onerror = (event) => {
        fail(event.message || 'its worker stopped');
      };
      worker.postMessage({ type: 'load', ...this.urls });
    });
    this.loading = loading;
    // A failed load is forgotten, so the next attempt starts afresh.
    loading.catch(() => {
      if (this.loading === loading) this.loading = null;
    });
    return loading;
  }

  /** The moves a player of `rating` might play in `fen`, and how such players fare from there. */
  async predict(fen: Fen, rating: number, opponentRating = rating): Promise<MaiaPrediction> {
    await this.load();
    const worker = this.worker;
    if (!worker) throw new Error('it is not running');
    const tokens = maiaTokens(fen);
    const id = this.nextId++;
    const output = await new Promise<{ logits: Float32Array; value: Float32Array }>(
      (resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        const buffer = tokens.buffer as ArrayBuffer;
        worker.postMessage({ type: 'predict', id, tokens: buffer, rating, opponentRating }, [
          buffer,
        ]);
      },
    );
    return { moves: maiaPolicy(fen, output.logits), value: maiaValue(output.value) };
  }

  /** Stops the worker (freeing the model's memory); the next `load` starts it again. */
  dispose(): void {
    this.shutDown('it was stopped');
    this.set('idle');
  }

  private shutDown(reason: string): void {
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
    for (const waiting of this.pending.values()) waiting.reject(new Error(reason));
    this.pending.clear();
  }
}

/** Where the files are served from, under the app's base path. */
export function maiaUrls(base: string = import.meta.env.BASE_URL): MaiaUrls {
  const dir = new URL(`${base}${MAIA_DIR}`, location.href);
  return {
    modelUrl: new URL(MAIA_FILES.model.name, dir).href,
    runtimeUrl: new URL(MAIA_FILES.runtime.name, dir).href,
  };
}

let shared: MaiaClient | null = null;

/** The page's one human-like opponent (its worker starts on first use). */
export function maiaClient(): MaiaClient {
  shared ??= new MaiaClient(
    () => new Worker(new URL('./maia.worker.ts', import.meta.url), { type: 'module' }),
    maiaUrls(),
  );
  return shared;
}

/** The shared client's status and error, as React state. */
export function useMaiaStatus(): { status: MaiaStatus; error: string | null } {
  const client = maiaClient();
  const status = useSyncExternalStore(
    (listener) => client.subscribe(listener),
    () => client.status,
  );
  return { status, error: status === 'failed' ? client.error : null };
}

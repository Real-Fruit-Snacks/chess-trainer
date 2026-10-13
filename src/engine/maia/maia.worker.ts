import * as ort from 'onnxruntime-web/wasm';
import { MAIA_CACHE } from '@/sw/maiaFiles';
import type { MaiaRequest, MaiaResponse } from './protocol';
import { createMaiaSession, runMaia } from './session';

/**
 * The human-like opponent's worker: holds the model and scores positions off
 * the main thread, so the board never waits on it. The files are read from the
 * cache the page downloaded them into (offline included), and fetched only
 * when they are not there.
 */

interface WorkerScope {
  postMessage(message: MaiaResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MaiaRequest>) => void) | null;
}
const scope = self as unknown as WorkerScope;

let session: ReturnType<typeof createMaiaSession> | null = null;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A file's bytes: the device's own copy when there is one, else the network's. */
async function readFile(url: string): Promise<ArrayBuffer> {
  try {
    if (typeof caches !== 'undefined') {
      const stored = await caches.match(url, { cacheName: MAIA_CACHE });
      if (stored) return await stored.arrayBuffer();
    }
  } catch {
    // Storage unavailable: the network it is.
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url.slice(url.lastIndexOf('/') + 1)}: HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

async function handle(request: MaiaRequest): Promise<void> {
  if (request.type === 'load') {
    try {
      session ??= Promise.all([readFile(request.runtimeUrl), readFile(request.modelUrl)]).then(
        ([runtime, model]) => createMaiaSession(ort, model, runtime),
      );
      await session;
      scope.postMessage({ type: 'loaded' });
    } catch (err) {
      session = null;
      scope.postMessage({ type: 'load-failed', message: describe(err) });
    }
    return;
  }
  try {
    if (!session) throw new Error('the model is not loaded');
    const out = await runMaia(
      ort,
      await session,
      new Float32Array(request.tokens),
      request.rating,
      request.opponentRating,
    );
    const logits = out.logits.buffer as ArrayBuffer;
    const value = out.value.buffer as ArrayBuffer;
    scope.postMessage({ type: 'prediction', id: request.id, logits, value }, [logits, value]);
  } catch (err) {
    scope.postMessage({ type: 'prediction-failed', id: request.id, message: describe(err) });
  }
}

scope.onmessage = (event) => {
  void handle(event.data);
};

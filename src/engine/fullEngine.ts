import {
  ENGINE_CACHE,
  ENGINE_DOWNLOAD_HEADER,
  ENGINE_FILES,
  type EngineBuild,
} from '@/sw/engineFiles';
import { ENGINE_BUILD_URLS, ENGINE_WASM_URLS } from './build';

/**
 * The full engine's files on this device. The page downloads them itself and
 * stores them in the engine cache; from then on the service worker serves
 * them from there (CacheFirst, no expiry), offline included.
 */

/** Whether both files of a build are stored. False when the browser has no Cache API. */
export async function isBuildDownloaded(build: EngineBuild): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const [script, wasm] = await Promise.all([
      caches.match(ENGINE_BUILD_URLS[build]),
      caches.match(ENGINE_WASM_URLS[build]),
    ]);
    return Boolean(script && wasm);
  } catch {
    return false;
  }
}

/**
 * Whether a build can start from the device's own copy: stored, and this page
 * served by the service worker, which is what hands the engine worker that
 * copy. (A page loaded past the worker — a hard reload — would fetch 99 MB
 * from the network instead.)
 */
export async function isBuildAvailable(build: EngineBuild): Promise<boolean> {
  const controlled = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  return controlled && isBuildDownloaded(build);
}

const SCRIPT_TYPES = ['application/javascript', 'text/javascript'];
const WASM_TYPES = ['application/wasm'];

/** A complete answer of the expected type: anything else (a captive portal's page) is refused. */
function check(response: Response, types: string[], what: string): void {
  const type = (response.headers.get('Content-Type') ?? '').toLowerCase();
  if (!response.ok || !types.some((t) => type.startsWith(t))) {
    throw new Error(`The ${what} could not be fetched (HTTP ${response.status}).`);
  }
}

/** What a stored copy keeps: its type (WebAssembly is only compiled from `application/wasm`). */
function storedHeaders(response: Response): HeadersInit {
  return { 'Content-Type': response.headers.get('Content-Type') ?? '' };
}

/**
 * Downloads a build's two files into the engine cache, reporting the binary's
 * progress in bytes. The total is the server's length when it sends a plain
 * one, the known size otherwise (a compressed response counts its compressed
 * bytes in Content-Length).
 *
 * The page fetches past the service worker (`ENGINE_DOWNLOAD_HEADER`) and the
 * HTTP cache, and stores the binary as it arrives, so aborting `signal` stops
 * the transfer itself and leaves nothing behind: the cache keeps a response
 * only once its body is complete. The binary goes in last, so a build counts
 * as downloaded exactly when it is whole.
 */
export async function fetchBuild(
  build: EngineBuild,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof caches === 'undefined') throw new Error('This browser cannot keep files offline.');
  const init: RequestInit = {
    signal,
    cache: 'no-store',
    headers: { [ENGINE_DOWNLOAD_HEADER]: '1' },
  };
  const script = await fetch(ENGINE_BUILD_URLS[build], init);
  check(script, SCRIPT_TYPES, 'engine script');
  const scriptBody = await script.blob();
  const response = await fetch(ENGINE_WASM_URLS[build], init);
  check(response, WASM_TYPES, 'engine');
  if (!response.body) throw new Error('The engine could not be fetched (empty response).');

  const length = Number(response.headers.get('Content-Length'));
  const plain = !response.headers.get('Content-Encoding');
  const total = plain && length > 0 ? length : ENGINE_FILES[build].wasmBytes;
  let received = 0;
  onProgress(0, total);
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        onProgress(Math.min(received, total), total);
        controller.enqueue(chunk);
      },
    }),
  );

  const cache = await caches.open(ENGINE_CACHE);
  await cache.put(
    ENGINE_BUILD_URLS[build],
    new Response(scriptBody, { headers: storedHeaders(script) }),
  );
  await cache.put(
    ENGINE_WASM_URLS[build],
    new Response(counted, { headers: storedHeaders(response) }),
  );
}

const FULL_BUILDS = ['full-single', 'full-multi'] as const satisfies readonly EngineBuild[];

/**
 * Deletes the full engine's files from the device: both builds, or all but
 * `keep` (the one just downloaded — the other would only sit there, 99 MB of
 * it, until threads were switched). True when something went.
 */
export async function removeFullEngine(keep?: EngineBuild): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  let removed = false;
  try {
    // Opening a cache creates it: look first.
    if (!(await caches.has(ENGINE_CACHE))) return false;
    const cache = await caches.open(ENGINE_CACHE);
    for (const build of FULL_BUILDS) {
      if (build === keep) continue;
      for (const url of [ENGINE_BUILD_URLS[build], ENGINE_WASM_URLS[build]]) {
        if (await cache.delete(url)) removed = true;
      }
    }
  } catch {
    // Storage unavailable: nothing to remove.
  }
  return removed;
}

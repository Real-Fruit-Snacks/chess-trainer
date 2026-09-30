/**
 * Cross-origin isolation, opt-in.
 *
 * Multi-threaded WebAssembly needs `SharedArrayBuffer`, which browsers only
 * expose to documents served with the COOP/COEP headers. GitHub Pages cannot
 * send custom headers, so the service worker adds them to every same-origin
 * response instead — the document, and also the worker scripts, because a
 * dedicated worker's own response must carry an embedder policy at least as
 * strict as its owner's. The headers are only added when the learner has
 * switched the option on, because they also block any cross-origin resource
 * that is not CORS-enabled.
 *
 * The flag lives in the Cache API (a tiny synthetic response) because that is
 * the one storage both the page and the service worker can read without a
 * message round-trip, and it survives service-worker restarts.
 *
 * This module is shared by the page and the service worker, so it must not
 * touch `window`, `document` or React.
 */

export const ISOLATION_HEADERS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export const ISOLATION_CACHE = 'chess-trainer-config';
export const ISOLATION_FLAG_URL = '/__chess-trainer/cross-origin-isolation';

type CacheStorageLike = Pick<CacheStorage, 'open'>;

function storage(): CacheStorageLike | null {
  return typeof caches === 'undefined' ? null : caches;
}

/** Whether the learner has asked for cross-origin isolation. */
export async function readIsolationFlag(
  store: CacheStorageLike | null = storage(),
): Promise<boolean> {
  if (!store) return false;
  try {
    const cache = await store.open(ISOLATION_CACHE);
    const hit = await cache.match(ISOLATION_FLAG_URL);
    return hit ? (await hit.text()) === '1' : false;
  } catch {
    return false;
  }
}

/** Records the learner's choice; takes effect on the next navigation. */
export async function writeIsolationFlag(
  enabled: boolean,
  store: CacheStorageLike | null = storage(),
): Promise<boolean> {
  if (!store) return false;
  try {
    const cache = await store.open(ISOLATION_CACHE);
    await cache.put(
      ISOLATION_FLAG_URL,
      new Response(enabled ? '1' : '0', { headers: { 'Content-Type': 'text/plain' } }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a copy of `response` carrying the isolation headers. Opaque and
 * error responses cannot be rebuilt, so they are returned unchanged.
 */
export function withIsolationHeaders(response: Response): Response {
  if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(ISOLATION_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** What the running document can actually do. */
export interface IsolationSupport {
  /** The document is cross-origin isolated (headers were applied). */
  isolated: boolean;
  /** SharedArrayBuffer is exposed, so threaded WASM can run. */
  sharedMemory: boolean;
  /** A service worker controls this page, so the headers can be applied on reload. */
  serviceWorker: boolean;
}

export function detectIsolationSupport(): IsolationSupport {
  const g = globalThis as typeof globalThis & { crossOriginIsolated?: boolean };
  return {
    isolated: g.crossOriginIsolated === true,
    sharedMemory: typeof SharedArrayBuffer !== 'undefined',
    serviceWorker:
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      navigator.serviceWorker.controller !== null,
  };
}

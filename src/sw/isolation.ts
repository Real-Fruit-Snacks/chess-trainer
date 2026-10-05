/**
 * Cross-origin isolation, on by default.
 *
 * Multi-threaded WebAssembly needs `SharedArrayBuffer`, which browsers only
 * expose to documents served with the COOP/COEP headers. GitHub Pages cannot
 * send custom headers, so the service worker adds them to every same-origin
 * response instead — the document, and also the worker scripts, because a
 * dedicated worker's own response must carry an embedder policy at least as
 * strict as its owner's. The learner can switch threads off, which removes
 * the headers again; they also block any cross-origin resource that is not
 * CORS-enabled (the app loads none: its only cross-origin requests are CORS
 * calls to the Lichess and Chess.com APIs).
 *
 * The flag lives in the Cache API (a tiny synthetic response) because that is
 * the one storage both the page and the service worker can read without a
 * message round-trip, and it survives service-worker restarts. No stored flag
 * means the default: on.
 *
 * This module is shared by the page and the service worker, so it must not
 * touch `window`, `document` or React.
 */

/** What an absent flag means: isolation on, so the threaded engine can run. */
export const ISOLATION_DEFAULT = true;

export const ISOLATION_HEADERS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export const ISOLATION_CACHE = 'chess-trainer-config';
export const ISOLATION_FLAG_URL = '/__chess-trainer/cross-origin-isolation';
/** The page tells the worker the flag changed, so it drops its in-memory copy. */
export const ISOLATION_CHANGED_MESSAGE = 'ISOLATION_FLAG_CHANGED';

type CacheStorageLike = Pick<CacheStorage, 'open'>;

function storage(): CacheStorageLike | null {
  return typeof caches === 'undefined' ? null : caches;
}

/**
 * Reads and writes of the flag run one after another: a read that started
 * before a write would otherwise resolve after it with the value the write
 * replaced (the Cache API does not order them).
 */
let flagQueue: Promise<unknown> = Promise.resolve();

function inTurn<T>(operation: () => Promise<T>): Promise<T> {
  const result = flagQueue.then(operation, operation);
  flagQueue = result.catch(() => undefined);
  return result;
}

/** The stored choice: true or false, or null when none is stored (or it cannot be read). */
function readStored(store: CacheStorageLike | null): Promise<boolean | null> {
  return inTurn(async () => {
    if (!store) return null;
    try {
      const cache = await store.open(ISOLATION_CACHE);
      const hit = await cache.match(ISOLATION_FLAG_URL);
      return hit ? (await hit.text()) === '1' : null;
    } catch {
      return null;
    }
  });
}

/** Whether cross-origin isolation is on: the learner's stored choice, or the default. */
export async function readIsolationFlag(
  store: CacheStorageLike | null = storage(),
): Promise<boolean> {
  return (await readStored(store)) ?? ISOLATION_DEFAULT;
}

/** Tells the controlling service worker (if any) that the flag changed (undefined: read it again). */
function notifyWorker(enabled: boolean | undefined): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.controller?.postMessage({
      type: ISOLATION_CHANGED_MESSAGE,
      enabled,
    });
  } catch {
    // No controller, or messaging is unavailable: the worker re-reads the flag on restart.
  }
}

/**
 * Records the learner's choice; takes effect on the next navigation. The
 * worker keeps the flag in memory, so it is told about the change.
 */
export function writeIsolationFlag(
  enabled: boolean,
  store: CacheStorageLike | null = storage(),
): Promise<boolean> {
  return inTurn(async () => {
    if (!store) return false;
    try {
      const cache = await store.open(ISOLATION_CACHE);
      await cache.put(
        ISOLATION_FLAG_URL,
        new Response(enabled ? '1' : '0', { headers: { 'Content-Type': 'text/plain' } }),
      );
      notifyWorker(enabled);
      return true;
    } catch {
      return false;
    }
  });
}

/** Forgets the stored choice, so the default applies again (Reset). */
export function resetIsolationFlag(store: CacheStorageLike | null = storage()): Promise<boolean> {
  return inTurn(async () => {
    if (!store) return false;
    try {
      const cache = await store.open(ISOLATION_CACHE);
      await cache.delete(ISOLATION_FLAG_URL);
      notifyWorker(undefined);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Makes the flag say what the setting says, writing only when they differ —
 * for saves from before threads were the default, and changes made in
 * another tab. Returns whether it wrote.
 */
export async function syncIsolationFlag(
  wanted: boolean,
  store: CacheStorageLike | null = storage(),
): Promise<boolean> {
  const stored = await readStored(store);
  if ((stored ?? ISOLATION_DEFAULT) === wanted) return false;
  return writeIsolationFlag(wanted, store);
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

import { ACTIVE_PROFILE_ID } from '@/store/profiles';
import type { SyncSnapshot } from './merge';
import { gunzipText, gzipText } from './vaultCrypto';

/**
 * The base of the next merge: the snapshot this device last agreed with the
 * relay, kept compressed in the Cache API (large enough, and out of the way of
 * localStorage's few megabytes). Where the Cache API is missing — some private
 * windows — it is kept in memory for the session; without any, the next merge
 * has no base and treats both sides as additions, which loses nothing.
 *
 * Reads and writes take turns, in the order they were asked for, so a base
 * forgotten (after an import) is not brought back by a save that started
 * earlier. `baseEpoch` counts the forgettings: a sync that loaded the base
 * before one merges again without it.
 */
const CACHE = 'chess-trainer-device-sync';
const memory = new Map<string, SyncSnapshot>();
let epoch = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after every task asked for before it. */
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** How many times the base was forgotten (it changes the moment `clearBase` is called). */
export const baseEpoch = (): number => epoch;

function requestFor(profile: string): string {
  const origin = typeof location === 'undefined' ? 'http://localhost' : location.origin;
  return `${origin}${import.meta.env.BASE_URL}__device-sync/base/${encodeURIComponent(profile)}`;
}

const cachesAvailable = () => typeof caches !== 'undefined';

export function loadBase(profile = ACTIVE_PROFILE_ID): Promise<SyncSnapshot | null> {
  return inTurn(async () => {
    if (cachesAvailable()) {
      try {
        const cache = await caches.open(CACHE);
        const response = await cache.match(requestFor(profile));
        if (response) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          return JSON.parse(await gunzipText(bytes)) as SyncSnapshot;
        }
      } catch {
        // Unreadable: fall through to the session copy, or no base.
      }
    }
    return memory.get(profile) ?? null;
  });
}

export function saveBase(snapshot: SyncSnapshot, profile = ACTIVE_PROFILE_ID): Promise<void> {
  memory.set(profile, snapshot);
  return inTurn(async () => {
    if (!cachesAvailable()) return;
    try {
      const cache = await caches.open(CACHE);
      const body = await gzipText(JSON.stringify(snapshot));
      await cache.put(
        requestFor(profile),
        new Response(body, { headers: { 'Content-Type': 'application/gzip' } }),
      );
    } catch {
      // Storage full or unavailable: the session copy serves.
    }
  });
}

/** Forgets the base: the next merge treats both sides as additions (after an import, say). */
export function clearBase(profile = ACTIVE_PROFILE_ID): Promise<void> {
  epoch++;
  memory.delete(profile);
  return inTurn(async () => {
    if (!cachesAvailable()) return;
    try {
      const cache = await caches.open(CACHE);
      await cache.delete(requestFor(profile));
    } catch {
      // Nothing to clear.
    }
  });
}

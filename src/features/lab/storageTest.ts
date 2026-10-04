import {
  isQuotaError,
  recordStorageLimit,
  safeLocalStorage,
  storageUsage,
  writeStorage,
} from '@/lib/persistStorage';
import { FILLER_PREFIX, PROBE_KEY } from './labKeys';

/**
 * Deliberately fills localStorage so the "storage is full" handling can be
 * seen on a real device, then takes the filler away again. The filler lives
 * under its own keys and never touches the app's data — and it never outlives
 * the lab: it is removed when the lab page closes and at every app start.
 */
export { FILLER_PREFIX, PROBE_KEY };
/** Chunk sizes in characters (two bytes each): big ones first, then ever smaller ones to use up the slack. */
const CHUNK_SIZES = [50_000, 10_000, 2_000, 400, 40];
const MAX_CHUNKS = 400; // a 40 MB ceiling in case a browser never says no

export interface FillResult {
  chunks: number;
  bytes: number;
  /** Whether the browser refused a write (the point of the exercise). */
  refused: boolean;
  /** What the browser allowed in all, in bytes (the filler plus everything already stored). */
  limitBytes: number | null;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Fills storage until even a tiny write is refused, so the app's next save
 * (a few hundred bytes) fails the way it would for a learner. When the browser
 * did refuse, the total it allowed is remembered for the storage meter.
 */
export function fillStorage(): FillResult {
  let chunks = 0;
  let bytes = 0;
  const store = storage();
  if (!store) return { chunks: 0, bytes: 0, refused: false, limitBytes: null };
  const written: { key: string; size: number }[] = [];
  for (const size of CHUNK_SIZES) {
    const filler = 'x'.repeat(size);
    let refused = false;
    while (chunks < MAX_CHUNKS) {
      try {
        const key = `${FILLER_PREFIX}${chunks}`;
        store.setItem(key, filler);
        written.push({ key, size });
        chunks += 1;
        bytes += size * 2;
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        refused = true;
        break;
      }
    }
    if (!refused) return { chunks, bytes, refused: false, limitBytes: null };
  }
  // Everything under the app's prefix (the filler included) is what fitted.
  const limitBytes = storageUsage('chess-trainer:').bytes;
  // Storage is full now, so make a little room for the number itself: the two
  // smallest chunks (160 bytes) go, far less than the probe's next step needs.
  for (const chunk of written.splice(-2)) {
    store.removeItem(chunk.key);
    chunks -= 1;
    bytes -= chunk.size * 2;
  }
  recordStorageLimit(limitBytes);
  return { chunks, bytes, refused: true, limitBytes };
}

/** Removes the filler and returns how many keys were removed. */
export function clearFiller(): number {
  const store = storage();
  if (!store) return 0;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(FILLER_PREFIX)) keys.push(key);
  }
  for (const key of keys) store.removeItem(key);
  return keys.length;
}

export function hasFiller(): boolean {
  const store = storage();
  if (!store) return false;
  for (let i = 0; i < store.length; i++) {
    if (store.key(i)?.startsWith(FILLER_PREFIX)) return true;
  }
  return false;
}

/**
 * Writes a few hundred bytes through the adapter the stores use. Browsers
 * allow overwriting a key with a same-sized value even when full, so the
 * probe grows each time; when it no longer fits, the adapter raises the
 * "storage is full" warning exactly as it would for a learner's own change.
 */
export function probeStorage(): void {
  const previous = safeLocalStorage.getItem(PROBE_KEY);
  const size = (typeof previous === 'string' ? previous.length : 0) + 400;
  safeLocalStorage.setItem(PROBE_KEY, 'p'.repeat(size));
}

/**
 * Everything the lab leaves in storage — the filler and the probe — removed.
 * Called when the lab unmounts and at app start, so a learner who filled
 * storage and navigated away is not left with every save failing. Returns how
 * many filler keys went.
 */
export function clearLabStorage(): number {
  const removed = clearFiller();
  if (removed > 0) {
    // A write that fits again tells the storage health the disk has room, which
    // saves every store that was waiting; the probe itself is not kept.
    writeStorage(PROBE_KEY, 'p');
  }
  safeLocalStorage.removeItem(PROBE_KEY);
  return removed;
}

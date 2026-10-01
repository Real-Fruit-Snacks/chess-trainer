import { isQuotaError, safeLocalStorage } from '@/lib/persistStorage';

/**
 * Deliberately fills localStorage so the "storage is full" handling can be
 * seen on a real device, then takes the filler away again. The filler lives
 * under its own keys and never touches the app's data.
 */
export const FILLER_PREFIX = 'chess-trainer:lab-filler-';
/** Chunk sizes in characters (two bytes each): big ones first, then ever smaller ones to use up the slack. */
const CHUNK_SIZES = [50_000, 10_000, 2_000, 400, 40];
const MAX_CHUNKS = 400; // a 40 MB ceiling in case a browser never says no

export interface FillResult {
  chunks: number;
  bytes: number;
  /** Whether the browser refused a write (the point of the exercise). */
  refused: boolean;
}

/**
 * Fills storage until even a tiny write is refused, so the app's next save
 * (a few hundred bytes) fails the way it would for a learner.
 */
export function fillStorage(): FillResult {
  let chunks = 0;
  let bytes = 0;
  for (const size of CHUNK_SIZES) {
    const filler = 'x'.repeat(size);
    let refused = false;
    while (chunks < MAX_CHUNKS) {
      try {
        localStorage.setItem(`${FILLER_PREFIX}${chunks}`, filler);
        chunks += 1;
        bytes += size * 2;
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        refused = true;
        break;
      }
    }
    if (!refused) return { chunks, bytes, refused: false };
  }
  return { chunks, bytes, refused: true };
}

/** Removes the filler and returns how many keys were removed. */
export function clearFiller(): number {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(FILLER_PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
  return keys.length;
}

export function hasFiller(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith(FILLER_PREFIX)) return true;
  }
  return false;
}

const PROBE_KEY = 'chess-trainer:lab-probe';

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

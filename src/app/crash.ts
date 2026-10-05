import { resetIsolationFlag } from '@/sw/isolation';

/** React (and the browser) can throw anything; the crash page needs an Error. */
export function normaliseError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  if (typeof thrown === 'string') return new Error(thrown);
  if (thrown && typeof thrown === 'object' && 'message' in thrown) {
    const { message } = thrown;
    return new Error(typeof message === 'string' ? message : String(message));
  }
  let description: string;
  try {
    description = JSON.stringify(thrown) ?? String(thrown);
  } catch {
    description = String(thrown);
  }
  return new Error(`Non-error thrown: ${description}`);
}

/**
 * A lazy page chunk that no longer exists on the server — the usual reason is
 * that the app was redeployed while this tab was open — fails with one of these
 * messages, depending on the browser.
 */
export function isChunkLoadError(thrown: unknown): boolean {
  const message =
    thrown instanceof Error
      ? thrown.message
      : typeof thrown === 'string'
        ? thrown
        : thrown && typeof thrown === 'object' && 'message' in thrown
          ? String(thrown.message)
          : '';
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (?:CSS )?chunk \S+ failed|ChunkLoadError/i.test(
    message,
  );
}

const STORAGE_PREFIX = 'chess-trainer:';

/**
 * Removes every key the app stores, without going through the stores (one of
 * them may be the thing that is broken), and starts over from the home page.
 */
export async function resetAppData(): Promise<void> {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Storage is unavailable: there is nothing to clear.
  }
  await resetIsolationFlag();
}

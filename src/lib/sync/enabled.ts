import { safeLocalStorage } from '@/lib/persistStorage';
import { storageKeyFor } from '@/store/profiles';
import { siteConfig } from '@/site.config';

/** Where the device-sync state is kept, per profile (see `src/store/deviceSync.ts`). */
export const DEVICE_SYNC_STORAGE_KEY = 'chess-trainer:device-sync';

/** The active profile's device-sync storage key. */
export const deviceSyncStorageKey = (): string => storageKeyFor(DEVICE_SYNC_STORAGE_KEY);

/** Whether this build offers device sync at all: it has a relay to sync through. */
export const deviceSyncOffered = (): boolean => siteConfig.syncRelay.length > 0;

/** The stored device-sync state, read without loading the store; null when there is none. */
function stored(): { secret?: unknown; lastSyncAt?: unknown } | null {
  if (!deviceSyncOffered()) return null;
  try {
    const raw = safeLocalStorage.getItem(deviceSyncStorageKey());
    if (typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw) as { state?: { secret?: unknown; lastSyncAt?: unknown } } | null;
    return parsed?.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether device sync is on for this profile, read straight from storage, so
 * the app's start-up and the Lichess sync can ask without loading the store.
 */
export function deviceSyncOn(): boolean {
  return typeof stored()?.secret === 'string';
}

/** Whether device sync is on and finished a sync within `withinMs`: the data has a copy elsewhere. */
export function deviceSyncedRecently(withinMs: number, now = Date.now()): boolean {
  const state = stored();
  return (
    typeof state?.secret === 'string' &&
    typeof state.lastSyncAt === 'number' &&
    now - state.lastSyncAt < withinMs
  );
}

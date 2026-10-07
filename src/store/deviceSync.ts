import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { rehydrateOnStorageChange, safeLocalStorage } from '@/lib/persistStorage';
import { DEVICE_SYNC_STORAGE_KEY } from '@/lib/sync/enabled';
import { storageKeyFor } from './profiles';

/**
 * Device sync on this device, for the profile: the secret behind the recovery
 * phrase while sync is on, and how far this device has synced. The secret is
 * kept here only — never in a backup, never sent anywhere — and goes when sync
 * is turned off. The synced data itself lives in the other stores.
 */
const DEVICE_SYNC_VERSION = 1;

export interface DeviceSyncState {
  /** The 16-byte secret behind the recovery phrase, base64url; null while sync is off. */
  secret: string | null;
  /** The vault version this device last agreed with (its ETag); null before the first sync. */
  etag: string | null;
  /**
   * The vault's generation at that version (sealed inside it, one more with every
   * write): a vault that comes back with a lower one is an old copy, and is refused.
   */
  generation: number;
  /** When this device last finished a sync. */
  lastSyncAt: number | null;
  /** When sync was turned on, or joined, on this device. */
  since: number | null;
  /** Why sync went off by itself (the synced copy was deleted), until it is read. */
  stoppedBecause: 'deleted' | null;

  turnOn: (secret: string, etag: string, generation: number, now?: number) => void;
  agreed: (etag: string, generation: number, now?: number) => void;
  turnOff: (because?: 'deleted') => void;
  clearStopped: () => void;
}

const initialState = {
  secret: null as string | null,
  etag: null as string | null,
  generation: 0,
  lastSyncAt: null as number | null,
  since: null as number | null,
  stoppedBecause: null as 'deleted' | null,
};

type PersistedDeviceSync = typeof initialState;

/** A stored blob read field by field: anything of the wrong type falls back. */
function repair(stored: unknown): PersistedDeviceSync {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<
    string,
    unknown
  >;
  const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0);
  const secret =
    typeof s.secret === 'string' && /^[A-Za-z0-9_-]{22}$/.test(s.secret) ? s.secret : null;
  return {
    secret,
    etag: secret ? text(s.etag) : null,
    generation: secret ? count(s.generation) : 0,
    lastSyncAt: secret ? time(s.lastSyncAt) : null,
    since: secret ? time(s.since) : null,
    stoppedBecause: s.stoppedBecause === 'deleted' ? 'deleted' : null,
  };
}

export const useDeviceSyncStore = create<DeviceSyncState>()(
  persist(
    (set) => ({
      ...initialState,
      turnOn: (secret, etag, generation, now = Date.now()) =>
        set({ secret, etag, generation, lastSyncAt: now, since: now, stoppedBecause: null }),
      agreed: (etag, generation, now = Date.now()) => set({ etag, generation, lastSyncAt: now }),
      turnOff: (because) => set({ ...initialState, stoppedBecause: because ?? null }),
      clearStopped: () => set({ stoppedBecause: null }),
    }),
    {
      name: storageKeyFor(DEVICE_SYNC_STORAGE_KEY),
      version: DEVICE_SYNC_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: ({ secret, etag, generation, lastSyncAt, since, stoppedBecause }) => ({
        secret,
        etag,
        generation,
        lastSyncAt,
        since,
        stoppedBecause,
      }),
      migrate: (stored) => repair(stored),
      merge: (stored, current) => ({ ...current, ...repair(stored) }),
    },
  ),
);

rehydrateOnStorageChange(useDeviceSyncStore, storageKeyFor(DEVICE_SYNC_STORAGE_KEY));

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { rehydrateOnStorageChange, safeLocalStorage } from '@/lib/persistStorage';
import { DEVICE_SYNC_STORAGE_KEY } from '@/lib/sync/enabled';
import { randomId } from '@/lib/sync/randomId';
import { storageKeyFor } from './profiles';

/**
 * Device sync on this device, for the profile: the secret behind the recovery
 * phrase while sync is on, and how far this device has synced. The secret is
 * kept here only — never in a backup, never sent anywhere — and goes when sync
 * is turned off. The synced data itself lives in the other stores; the copies
 * the merges are measured against live in the Cache API (`lib/sync/base.ts`),
 * and this store names the ones in use.
 */
const DEVICE_SYNC_VERSION = 1;

/** A write this device sent without hearing back: whether it went through is read from the vault. */
export interface PendingWrite {
  /** The generation it wrote. */
  generation: number;
  /** The copy of what it wrote (base.ts): the base, if the write went through. */
  copy: string;
}

export interface Agreement {
  /** The vault version (its ETag). */
  etag: string;
  /** The vault's generation at that version (sealed inside it, one more with every write). */
  generation: number;
  /** The copy of the vault at that version (base.ts); null when it could not be kept. */
  base: string | null;
  /** The base mark when it was agreed (base.ts). */
  mark: string;
}

export interface DeviceSyncState {
  /** The 16-byte secret behind the recovery phrase, base64url; null while sync is off. */
  secret: string | null;
  /** This device's random id in the vault's record of writes; null while sync is off. */
  device: string | null;
  /** The vault version this device last agreed with (its ETag); null before the first sync. */
  etag: string | null;
  /**
   * The vault's generation at that version: a vault that comes back with a
   * lower one is an old copy, and is refused.
   */
  generation: number;
  /** The copy of the vault at `etag`: the base of the next merge. */
  base: string | null;
  /** The base mark `base` was agreed under: a base forgotten since (another mark) is not used. */
  mark: string | null;
  pending: PendingWrite | null;
  /** When this device last finished a sync. */
  lastSyncAt: number | null;
  /** When sync was turned on, or joined, on this device. */
  since: number | null;
  /** Why sync went off by itself (the synced copy was deleted), until it is read. */
  stoppedBecause: 'deleted' | null;

  turnOn: (on: Agreement & { secret: string; device: string }, now?: number) => void;
  /** The vault at this version is the base from here; any pending write is settled. */
  agreed: (agreement: Agreement, now?: number) => void;
  /** Notes a write about to be sent (or, with null, that none is). */
  sending: (pending: PendingWrite | null) => void;
  turnOff: (because?: 'deleted') => void;
  clearStopped: () => void;
}

const initialState = {
  secret: null as string | null,
  device: null as string | null,
  etag: null as string | null,
  generation: 0,
  base: null as string | null,
  mark: null as string | null,
  pending: null as PendingWrite | null,
  lastSyncAt: null as number | null,
  since: null as number | null,
  stoppedBecause: null as 'deleted' | null,
};

type PersistedDeviceSync = typeof initialState;

const ID = /^[A-Za-z0-9_-]{8,64}$/;

/** A stored blob read field by field: anything of the wrong type falls back. */
function repair(stored: unknown): PersistedDeviceSync {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<
    string,
    unknown
  >;
  const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  const id = (v: unknown) => (typeof v === 'string' && ID.test(v) ? v : null);
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0);
  const secret =
    typeof s.secret === 'string' && /^[A-Za-z0-9_-]{22}$/.test(s.secret) ? s.secret : null;
  // A device id lost from storage is made anew: the device just has no writes under it yet.
  const device = secret ? (id(s.device) ?? randomId()) : null;
  const on = secret !== null;
  const p = s.pending as Partial<PendingWrite> | null | undefined;
  const pending =
    on && p && count(p.generation) > 0 && id(p.copy)
      ? { generation: count(p.generation), copy: id(p.copy) as string }
      : null;
  return {
    secret,
    device,
    etag: on ? text(s.etag) : null,
    generation: on ? count(s.generation) : 0,
    base: on ? id(s.base) : null,
    mark: on && typeof s.mark === 'string' ? s.mark : null,
    pending,
    lastSyncAt: on ? time(s.lastSyncAt) : null,
    since: on ? time(s.since) : null,
    stoppedBecause: s.stoppedBecause === 'deleted' ? 'deleted' : null,
  };
}

export const useDeviceSyncStore = create<DeviceSyncState>()(
  persist(
    (set) => ({
      ...initialState,
      turnOn: ({ secret, device, etag, generation, base, mark }, now = Date.now()) =>
        set({
          secret,
          device,
          etag,
          generation,
          base,
          mark,
          pending: null,
          lastSyncAt: now,
          since: now,
          stoppedBecause: null,
        }),
      agreed: ({ etag, generation, base, mark }, now = Date.now()) =>
        set({ etag, generation, base, mark, pending: null, lastSyncAt: now }),
      sending: (pending) => set({ pending }),
      turnOff: (because) => set({ ...initialState, stoppedBecause: because ?? null }),
      clearStopped: () => set({ stoppedBecause: null }),
    }),
    {
      name: storageKeyFor(DEVICE_SYNC_STORAGE_KEY),
      version: DEVICE_SYNC_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: ({
        secret,
        device,
        etag,
        generation,
        base,
        mark,
        pending,
        lastSyncAt,
        since,
        stoppedBecause,
      }) => ({
        secret,
        device,
        etag,
        generation,
        base,
        mark,
        pending,
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

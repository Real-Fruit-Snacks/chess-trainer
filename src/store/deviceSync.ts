import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { rehydrateOnStorageChange, safeLocalStorage } from '@/lib/persistStorage';
import { DEVICE_SYNC_STORAGE_KEY } from '@/lib/sync/enabled';
import { isSyncPart, type SyncPart } from '@/lib/sync/parts';
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
  /**
   * The parts this device keeps to itself: the learner's choice for this
   * device, kept when sync goes off and on again.
   */
  off: SyncPart[];
  /**
   * The learner's settings changed on this device since they last reached the
   * vault, each with the value it was changed to. A merge that has no version
   * of the settings to compare with (its copy lost, as some private windows
   * lose them) keeps these rather than take the vault's (merge.ts).
   */
  changedSettings: Record<string, unknown>;

  turnOn: (on: Agreement & { secret: string; device: string }, now?: number) => void;
  /** The vault at this version is the base from here; any pending write is settled. */
  agreed: (agreement: Agreement, now?: number) => void;
  /** Notes a write about to be sent (or, with null, that none is). */
  sending: (pending: PendingWrite | null) => void;
  turnOff: (because?: 'deleted') => void;
  clearStopped: () => void;
  /** Syncs a part on this device, or keeps it to this device. */
  setPart: (part: SyncPart, on: boolean) => void;
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
  off: [] as SyncPart[],
  changedSettings: {} as Record<string, unknown>,
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
    off: Array.isArray(s.off) ? [...new Set(s.off.filter(isSyncPart))] : [],
    changedSettings:
      on &&
      typeof s.changedSettings === 'object' &&
      s.changedSettings !== null &&
      !Array.isArray(s.changedSettings)
        ? (s.changedSettings as Record<string, unknown>)
        : {},
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
          // Everything here was just agreed with the vault.
          changedSettings: {},
        }),
      agreed: ({ etag, generation, base, mark }, now = Date.now()) =>
        set({ etag, generation, base, mark, pending: null, lastSyncAt: now }),
      sending: (pending) => set({ pending }),
      // What this device keeps to itself is its own choice: it stays for the next time.
      turnOff: (because) =>
        set(({ off }) => ({ ...initialState, off, stoppedBecause: because ?? null })),
      clearStopped: () => set({ stoppedBecause: null }),
      setPart: (part, on) =>
        set(({ off }) => ({
          off: on ? off.filter((p) => p !== part) : [...new Set([...off, part])],
        })),
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
        off,
        changedSettings,
      }) => ({
        off,
        changedSettings,
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

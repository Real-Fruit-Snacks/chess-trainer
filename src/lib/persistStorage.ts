import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { toast, useToasts } from '@/components/ui/toastStore';

/**
 * `localStorage` for the persisted stores that survives a full disk.
 *
 * Browsers allow roughly 5 MB of localStorage per site. When a write no longer
 * fits, `localStorage.setItem` throws; left alone, that exception escapes from
 * the store action that triggered it, the action fails silently from the
 * learner's point of view, and the change is lost at the next reload. This
 * wrapper catches the quota error, keeps the in-memory state, records the
 * failure per key for the Settings page, tells the learner once what to do
 * and, as soon as a write fits again, saves every store so nothing stays
 * behind in memory only.
 *
 * It also holds the two helpers every store wires up: `rehydrateOnStorageChange`,
 * which reloads a store when another tab writes its key, and `keepCorruptBlob`,
 * which copies a save that cannot be read aside before the defaults replace it.
 */

/** About how much a browser lets one site keep in localStorage (the lab's fill test refines it). */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
/** Where the lab's fill test records what this browser actually allowed, in bytes. */
export const STORAGE_LIMIT_KEY = 'chess-trainer:storage-limit';

export interface StorageHealth {
  /** A write failed for lack of space and at least one key has not fit since. */
  full: boolean;
  /** The storage key whose write failed most recently (null once every key fits again). */
  failedKey: string | null;
  failedAt: number | null;
  /** Every key whose last write was refused, with when it happened. */
  failed: Record<string, number>;
}

interface StorageHealthState extends StorageHealth {
  markFull: (key: string, at?: number) => void;
  /** Marks one key healthy again; with no key, every key (tests and the lab). */
  markOk: (key?: string) => void;
}

/** Retrying every pending store on each successful write is throttled to this. */
const RETRY_INTERVAL_MS = 1000;
let lastRetry = 0;

function summarize(failed: Record<string, number>): Omit<StorageHealth, 'failed'> {
  // Latest failure first; among failures in the same millisecond, the one recorded last.
  const entries = Object.entries(failed)
    .reverse()
    .sort((a, b) => b[1] - a[1]);
  const latest = entries[0];
  return {
    full: entries.length > 0,
    failedKey: latest ? latest[0] : null,
    failedAt: latest ? latest[1] : null,
  };
}

export const useStorageHealth = create<StorageHealthState>((set, get) => ({
  full: false,
  failedKey: null,
  failedAt: null,
  failed: {},
  markFull: (key, at = Date.now()) => {
    const failed = { ...get().failed };
    delete failed[key];
    failed[key] = at;
    set({ failed, ...summarize(failed) });
  },
  markOk: (key) => {
    if (key === undefined) {
      lastRetry = 0;
      set({ failed: {}, full: false, failedKey: null, failedAt: null });
      return;
    }
    if (!(key in get().failed)) return;
    const failed = { ...get().failed };
    delete failed[key];
    set({ failed, ...summarize(failed) });
  },
}));

/** Whether an exception from a storage write means "no space left". */
export function isQuotaError(error: unknown): boolean {
  // A DOMException is not always an `Error` of the page's realm, so duck-type it.
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  // Older WebKit and Firefox builds only set the legacy codes.
  return code === 22 || code === 1014;
}

export const STORAGE_FULL_MESSAGE =
  'Storage is full: your latest change could not be saved. Export a backup, then remove old analyses or games to make room.';

/** The id of the sticky "storage is full" toast while it is on screen. */
let warningToast: number | null = null;

/** Writes refused for lack of space since the app started. */
let refusals = 0;

/** How many writes storage has refused for lack of space so far (a change means another did). */
export const storageRefusals = (): number => refusals;

/** While true, writes leave the storage's health and its messages alone (see `quietly`). */
let quiet = false;

/**
 * Runs `task` without the usual bookkeeping of writes: a refused one is only
 * counted (`storageRefusals`), not recorded as a failure or announced, and one
 * that fits does not count as room made. Device sync applies a merge this way
 * and, when it does not fit, takes it back and says so itself: storage then
 * holds just what it held, and nothing of the learner's is waiting to be saved.
 */
export function quietly<T>(task: () => T): T {
  const before = quiet;
  quiet = true;
  try {
    return task();
  } finally {
    quiet = before;
  }
}

function warningShowing(): boolean {
  return warningToast !== null && useToasts.getState().toasts.some((t) => t.id === warningToast);
}

function reportFull(key: string): void {
  refusals++;
  if (quiet) return;
  useStorageHealth.getState().markFull(key);
  // One sticky warning at a time: a second failing key does not add a second toast.
  if (warningShowing()) return;
  warningToast = toast(STORAGE_FULL_MESSAGE, { tone: 'danger', duration: 0 });
}

/* ------------------------------------------------------------------ */
/* Stores that can be asked to save themselves again                  */
/* ------------------------------------------------------------------ */

/** The part of a zustand store the storage helpers need. */
export interface PersistedStoreLike {
  setState: (partial: Record<string, never>) => unknown;
  persist: { rehydrate: () => unknown };
}

const stores = new Set<PersistedStoreLike>();
let repersisting = false;

/** Registers a store so that it is saved again once a full storage has room. */
export function registerPersistedStore(store: PersistedStoreLike): () => void {
  stores.add(store);
  return () => {
    stores.delete(store);
  };
}

/**
 * Writes every registered store again. The persist middleware saves on every
 * `setState`, so an empty patch is enough to flush the in-memory state.
 */
export function repersistAll(): void {
  if (repersisting) return;
  repersisting = true;
  try {
    for (const store of stores) store.setState({});
  } finally {
    repersisting = false;
  }
}

/**
 * After a write succeeded: the key itself is healthy again, and since space
 * may have been freed, every store that is still waiting is saved again. Once
 * nothing is pending the sticky warning goes and a short confirmation shows.
 */
function recovered(key: string, now = Date.now()): void {
  if (quiet) return;
  const health = useStorageHealth.getState();
  if (!health.full) return;
  health.markOk(key);
  if (repersisting) return;
  if (useStorageHealth.getState().full) {
    if (now - lastRetry < RETRY_INTERVAL_MS) return;
    lastRetry = now;
    repersistAll();
    if (useStorageHealth.getState().full) return;
  }
  if (warningToast !== null) {
    const shown = warningShowing();
    useToasts.getState().dismiss(warningToast);
    warningToast = null;
    if (shown) {
      toast('Storage has room again: your latest changes were saved.', { tone: 'success' });
    }
  }
}

function nativeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Access can throw in private windows and sandboxed frames.
    return null;
  }
}

/**
 * Writes one key and reports whether it is now stored. A refused write for
 * lack of space is recorded and announced; other errors are rethrown.
 */
export function writeStorage(name: string, value: string): boolean {
  const store = nativeStorage();
  if (!store) return false;
  try {
    store.setItem(name, value);
    recovered(name);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    reportFull(name);
    return false;
  }
}

/** The zustand storage adapter every persisted store uses. */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return nativeStorage()?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    writeStorage(name, value);
  },
  removeItem: (name) => {
    try {
      nativeStorage()?.removeItem(name);
    } catch {
      // Nothing to do: the key is gone or storage is unavailable.
    }
  },
};

/* ------------------------------------------------------------------ */
/* Cross-tab changes                                                  */
/* ------------------------------------------------------------------ */

/**
 * Reloads `store` from storage whenever another tab writes its key, so two
 * tabs on the same profile stop overwriting each other (the last writer used
 * to win). Also registers the store for re-saving after a full disk. Returns
 * a function that stops watching.
 */
export function rehydrateOnStorageChange(store: PersistedStoreLike, key: string): () => void {
  const unregister = registerPersistedStore(store);
  if (typeof window === 'undefined') return unregister;
  const onStorage = (event: StorageEvent) => {
    // `key` is null when another tab cleared storage altogether.
    if (event.key !== null && event.key !== key) return;
    void store.persist.rehydrate();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    unregister();
  };
}

/* ------------------------------------------------------------------ */
/* Saves that cannot be read                                          */
/* ------------------------------------------------------------------ */

export const CORRUPT_SUFFIX = ':corrupt-';

/**
 * Copies the raw value under `key` to `<key>:corrupt-<timestamp>` so a save
 * that cannot be parsed or migrated is not lost when the defaults overwrite
 * it. Keeps one copy per key. Returns the copy's key, or null when nothing
 * could be kept.
 */
export function salvageCorruptBlob(key: string, now = Date.now()): string | null {
  const store = nativeStorage();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const prefix = `${key}${CORRUPT_SUFFIX}`;
  const stale: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(prefix)) stale.push(k);
  }
  for (const k of stale) store.removeItem(k);
  const target = `${prefix}${now}`;
  try {
    store.setItem(target, raw);
    return target;
  } catch {
    return null;
  }
}

/**
 * The `onRehydrateStorage` hook every store passes to `persist`: when the
 * stored blob cannot be read (bad JSON) or its `migrate` throws, the raw
 * value is kept aside before the store's first write replaces it.
 */
export function keepCorruptBlob(name: string) {
  return () => (_state: unknown, error?: unknown) => {
    if (!error) return;
    const copy = salvageCorruptBlob(name);
    console.warn(
      `[chess-trainer] The saved ${name} could not be read${copy ? ` — a copy was kept at ${copy}` : ''}.`,
      error,
    );
    if (corruptToastShown) return;
    corruptToastShown = true;
    toast(
      copy
        ? 'Some saved data could not be read and was set aside rather than deleted. Starting fresh for that part; the copy stays in the browser’s storage.'
        : 'Some saved data could not be read. Starting fresh for that part.',
      { tone: 'warning', duration: 0 },
    );
  };
}

let corruptToastShown = false;

const newerWarned = new Set<string>();
let newerToast = false;

/**
 * Called by a store's `migrate` when the stored version is newer than the
 * app: the unknown fields are kept, and the learner is told once to update.
 */
export function warnNewerSave(name: string, version: number, current: number): void {
  if (newerWarned.has(name)) return;
  newerWarned.add(name);
  console.warn(
    `[chess-trainer] ${name} was saved by a newer version (${version} > ${current}); its extra fields are kept untouched.`,
  );
  if (newerToast) return;
  newerToast = true;
  toast(
    'Your saved progress comes from a newer version of the app. Update the app to use everything in it; nothing is removed in the meantime.',
    { tone: 'info', duration: 0 },
  );
}

/* ------------------------------------------------------------------ */
/* Usage                                                              */
/* ------------------------------------------------------------------ */

export interface StorageUsage {
  /** Bytes used by this app's keys (UTF-16, as browsers count them). */
  bytes: number;
  /** Bytes per key, largest first. */
  keys: { key: string; bytes: number }[];
  /** Share of the limit, 0–1 (can exceed 1 on generous browsers). */
  ratio: number;
  /** The limit the ratio was measured against. */
  limit: number;
  /** Whether `limit` was measured on this device (by the lab) rather than assumed. */
  measured: boolean;
}

/** The limit the lab's fill test measured on this device, if it ran; null otherwise. */
export function recordedStorageLimit(): number | null {
  const raw = safeLocalStorage.getItem(STORAGE_LIMIT_KEY);
  const value = typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Remembers what the lab's fill test measured (bytes), or forgets it with null. */
export function recordStorageLimit(bytes: number | null): void {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) {
    safeLocalStorage.removeItem(STORAGE_LIMIT_KEY);
    return;
  }
  try {
    nativeStorage()?.setItem(STORAGE_LIMIT_KEY, String(Math.round(bytes)));
  } catch {
    // Storage may be full at this very moment (the lab measures by filling it).
  }
}

/**
 * How much of the browser's localStorage this site is using. `limit` is the
 * best estimate of what the browser allows: what the lab's fill test measured
 * on this device, or the typical 5 MB.
 */
export function storageUsage(prefix = 'chess-trainer:', limit?: number): StorageUsage {
  const store = nativeStorage();
  const keys: { key: string; bytes: number }[] = [];
  if (store) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(prefix)) continue;
      const value = store.getItem(key) ?? '';
      keys.push({ key, bytes: (key.length + value.length) * 2 });
    }
  }
  keys.sort((a, b) => b.bytes - a.bytes);
  const bytes = keys.reduce((sum, k) => sum + k.bytes, 0);
  const measured = limit === undefined ? recordedStorageLimit() : null;
  const chosen = limit ?? measured ?? STORAGE_LIMIT_BYTES;
  const safeLimit = chosen > 0 ? chosen : STORAGE_LIMIT_BYTES;
  return { bytes, keys, ratio: bytes / safeLimit, limit: safeLimit, measured: measured !== null };
}

/** "1.2 MB", "340 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { toast } from '@/components/ui/toastStore';

/**
 * `localStorage` for the persisted stores that survives a full disk.
 *
 * Browsers allow roughly 5 MB of localStorage per site. When a write no longer
 * fits, `localStorage.setItem` throws; left alone, that exception escapes from
 * the store action that triggered it, the action fails silently from the
 * learner's point of view, and the change is lost at the next reload. This
 * wrapper catches the quota error, keeps the in-memory state, records the
 * failure for the Settings page and tells the learner once what to do.
 */

/** About how much a browser lets one site keep in localStorage. */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

export interface StorageHealth {
  /** A write failed for lack of space and nothing has fit since. */
  full: boolean;
  /** The storage key whose write failed last. */
  failedKey: string | null;
  failedAt: number | null;
}

interface StorageHealthState extends StorageHealth {
  markFull: (key: string) => void;
  markOk: () => void;
}

export const useStorageHealth = create<StorageHealthState>((set) => ({
  full: false,
  failedKey: null,
  failedAt: null,
  markFull: (key) => set({ full: true, failedKey: key, failedAt: Date.now() }),
  markOk: () => set({ full: false, failedKey: null, failedAt: null }),
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

let warned = false;

function reportFull(key: string): void {
  const health = useStorageHealth.getState();
  health.markFull(key);
  if (warned) return;
  warned = true;
  toast(
    'Storage is full: your latest change could not be saved. Export a backup, then remove old analyses or games to make room.',
    { tone: 'danger', duration: 0 },
  );
}

function nativeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Access can throw in private windows and sandboxed frames.
    return null;
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
    const store = nativeStorage();
    if (!store) return;
    try {
      store.setItem(name, value);
      if (useStorageHealth.getState().full) {
        useStorageHealth.getState().markOk();
        warned = false;
      }
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      reportFull(name);
    }
  },
  removeItem: (name) => {
    try {
      nativeStorage()?.removeItem(name);
    } catch {
      // Nothing to do: the key is gone or storage is unavailable.
    }
  },
};

export interface StorageUsage {
  /** Bytes used by this app's keys (UTF-16, as browsers count them). */
  bytes: number;
  /** Bytes per key, largest first. */
  keys: { key: string; bytes: number }[];
  /** Share of the typical limit, 0–1 (can exceed 1 on generous browsers). */
  ratio: number;
}

/** How much of the browser's localStorage this site is using. */
export function storageUsage(prefix = 'chess-trainer:'): StorageUsage {
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
  return { bytes, keys, ratio: bytes / STORAGE_LIMIT_BYTES };
}

/** "1.2 MB", "340 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

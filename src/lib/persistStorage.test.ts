import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';
import {
  CORRUPT_SUFFIX,
  formatBytes,
  isQuotaError,
  keepCorruptBlob,
  type PersistedStoreLike,
  registerPersistedStore,
  safeLocalStorage,
  salvageCorruptBlob,
  STORAGE_LIMIT_BYTES,
  storageUsage,
  useStorageHealth,
  rehydrateOnStorageChange,
  writeStorage,
} from './persistStorage';

function quotaError(name = 'QuotaExceededError'): DOMException {
  return new DOMException('The quota has been exceeded.', name);
}

/** A stand-in for a persisted store: counts re-saves and reloads. */
function fakeStore(): PersistedStoreLike & { saves: number; reloads: number } {
  const store = {
    saves: 0,
    reloads: 0,
    setState: () => {
      store.saves += 1;
    },
    persist: {
      rehydrate: () => {
        store.reloads += 1;
      },
    },
  };
  return store;
}

describe('persistStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    useStorageHealth.getState().markOk();
    useToasts.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recognises every spelling of a quota error', () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError(quotaError('NS_ERROR_DOM_QUOTA_REACHED'))).toBe(true);
    const legacy = new Error('full') as Error & { code: number };
    legacy.code = 22;
    expect(isQuotaError(legacy)).toBe(true);
    expect(isQuotaError(new Error('something else'))).toBe(false);
    expect(isQuotaError('not an error')).toBe(false);
  });

  it('reads, writes and removes like localStorage', () => {
    safeLocalStorage.setItem('chess-trainer:test', '{"a":1}');
    expect(safeLocalStorage.getItem('chess-trainer:test')).toBe('{"a":1}');
    safeLocalStorage.removeItem('chess-trainer:test');
    expect(safeLocalStorage.getItem('chess-trainer:test')).toBeNull();
  });

  it('swallows a full disk, records it and warns the learner once', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    expect(() => safeLocalStorage.setItem('chess-trainer:progress', 'x')).not.toThrow();
    expect(() => safeLocalStorage.setItem('chess-trainer:games', 'y')).not.toThrow();
    const health = useStorageHealth.getState();
    expect(health.full).toBe(true);
    expect(health.failedKey).toBe('chess-trainer:games');
    expect(Object.keys(health.failed).sort()).toEqual([
      'chess-trainer:games',
      'chess-trainer:progress',
    ]);
    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toMatch(/Storage is full/);
    expect(toasts[0]?.tone).toBe('danger');
    // A third failure, and a second failure of the same key, add no second toast.
    safeLocalStorage.setItem('chess-trainer:analyses', 'z');
    safeLocalStorage.setItem('chess-trainer:progress', 'x');
    expect(useToasts.getState().toasts).toHaveLength(1);
    expect(useStorageHealth.getState().failedKey).toBe('chess-trainer:progress');
  });

  it('tracks health per key: one key fitting again does not clear another that still fails', () => {
    const full = new Set(['chess-trainer:progress', 'chess-trainer:games']);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (full.has(k)) throw quotaError();
      original.call(this, k, v);
    });
    safeLocalStorage.setItem('chess-trainer:progress', 'x');
    safeLocalStorage.setItem('chess-trainer:games', 'y');
    expect(useStorageHealth.getState().full).toBe(true);

    // Progress fits again; games still does not.
    full.delete('chess-trainer:progress');
    safeLocalStorage.setItem('chess-trainer:progress', 'x');
    expect(useStorageHealth.getState().full).toBe(true);
    expect(useStorageHealth.getState().failedKey).toBe('chess-trainer:games');
    expect(useToasts.getState().toasts).toHaveLength(1);

    full.delete('chess-trainer:games');
    safeLocalStorage.setItem('chess-trainer:games', 'y');
    expect(useStorageHealth.getState().full).toBe(false);
    expect(useStorageHealth.getState().failedKey).toBeNull();
  });

  it('saves every registered store again once a write fits, and swaps the warning for a confirmation', () => {
    const store = fakeStore();
    // Like the real persist middleware, a re-save writes the store's key.
    store.setState = () => {
      store.saves += 1;
      safeLocalStorage.setItem('chess-trainer:analyses', 'big');
    };
    const unregister = registerPersistedStore(store);
    try {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError();
      });
      safeLocalStorage.setItem('chess-trainer:analyses', 'big');
      expect(useStorageHealth.getState().full).toBe(true);
      expect(store.saves).toBe(0);
      spy.mockRestore();

      // Room is made (a game removed, say): the games write succeeds and the
      // analyses store, which never wrote again by itself, is flushed too.
      safeLocalStorage.setItem('chess-trainer:games', '{}');
      expect(store.saves).toBe(1);
      expect(useStorageHealth.getState().full).toBe(false);
      const toasts = useToasts.getState().toasts;
      expect(toasts.some((t) => /Storage is full/.exec(t.message))).toBe(false);
      expect(toasts.at(-1)?.message).toMatch(/room again/);
      expect(toasts.at(-1)?.tone).toBe('success');
    } finally {
      unregister();
    }
  });

  it('keeps the warning while a re-save still fails, then warns anew after a later failure', () => {
    const store = fakeStore();
    const unregister = registerPersistedStore(store);
    try {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError();
      });
      safeLocalStorage.setItem('chess-trainer:analyses', 'big');
      spy.mockRestore();
      // The analyses key is still too big: the retry fails for that key only.
      const original = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
        if (k === 'chess-trainer:analyses') throw quotaError();
        original.call(this, k, v);
      });
      store.setState = () => {
        store.saves += 1;
        safeLocalStorage.setItem('chess-trainer:analyses', 'big');
      };
      safeLocalStorage.setItem('chess-trainer:games', '{}');
      expect(store.saves).toBe(1);
      expect(useStorageHealth.getState().full).toBe(true);
      expect(useToasts.getState().toasts).toHaveLength(1);
      expect(useToasts.getState().toasts[0]?.message).toMatch(/Storage is full/);
    } finally {
      unregister();
    }
  });

  it('clears the warning once a write fits again', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    safeLocalStorage.setItem('chess-trainer:progress', 'x');
    expect(useStorageHealth.getState().full).toBe(true);
    spy.mockRestore();
    safeLocalStorage.setItem('chess-trainer:progress', 'x');
    expect(useStorageHealth.getState().full).toBe(false);
  });

  it('rethrows errors that are not about space', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => safeLocalStorage.setItem('chess-trainer:progress', 'x')).toThrow('SecurityError');
  });

  it('writeStorage says whether the value is now stored', () => {
    expect(writeStorage('chess-trainer:profiles', '{}')).toBe(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    expect(writeStorage('chess-trainer:profiles', '{}')).toBe(false);
    expect(useStorageHealth.getState().failedKey).toBe('chess-trainer:profiles');
  });

  it('reloads a store when another tab writes its key', () => {
    const store = fakeStore();
    const stop = rehydrateOnStorageChange(store, 'chess-trainer:progress');
    window.dispatchEvent(new StorageEvent('storage', { key: 'chess-trainer:games' }));
    expect(store.reloads).toBe(0);
    window.dispatchEvent(new StorageEvent('storage', { key: 'chess-trainer:progress' }));
    expect(store.reloads).toBe(1);
    // Another tab cleared everything.
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(store.reloads).toBe(2);
    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: 'chess-trainer:progress' }));
    expect(store.reloads).toBe(2);
  });

  it('keeps a copy of a save that cannot be read, one per key', () => {
    localStorage.setItem('chess-trainer:progress', '{not json');
    const copy = salvageCorruptBlob('chess-trainer:progress', 1_700_000_000_000);
    expect(copy).toBe(`chess-trainer:progress${CORRUPT_SUFFIX}1700000000000`);
    expect(localStorage.getItem(copy!)).toBe('{not json');
    // A later salvage replaces the older copy rather than piling them up.
    localStorage.setItem('chess-trainer:progress', '{still not json');
    const second = salvageCorruptBlob('chess-trainer:progress', 1_700_000_000_001);
    expect(localStorage.getItem(copy!)).toBeNull();
    expect(localStorage.getItem(second!)).toBe('{still not json');
    // Nothing stored, nothing to keep.
    expect(salvageCorruptBlob('chess-trainer:missing')).toBeNull();
  });

  it('the rehydration hook salvages only when hydration failed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('chess-trainer:games', 'garbage');
    const hook = keepCorruptBlob('chess-trainer:games')();
    hook(undefined, undefined);
    expect(localStorage.length).toBe(1);
    hook(undefined, new SyntaxError('Unexpected token'));
    expect(localStorage.length).toBe(2);
    expect(storageUsage().keys.some((k) => k.key.includes(CORRUPT_SUFFIX))).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('measures what the app keeps, largest key first, against the given limit', () => {
    localStorage.setItem('chess-trainer:progress', 'a'.repeat(1000));
    localStorage.setItem('chess-trainer:games', 'b'.repeat(4000));
    localStorage.setItem('other-site', 'c'.repeat(9000));
    const usage = storageUsage();
    expect(usage.keys.map((k) => k.key)).toEqual(['chess-trainer:games', 'chess-trainer:progress']);
    expect(usage.keys[0]?.bytes).toBe(('chess-trainer:games'.length + 4000) * 2);
    expect(usage.bytes).toBe(usage.keys[0]!.bytes + usage.keys[1]!.bytes);
    expect(usage.ratio).toBeCloseTo(usage.bytes / STORAGE_LIMIT_BYTES);
    expect(usage.limit).toBe(STORAGE_LIMIT_BYTES);
    const measured = storageUsage('chess-trainer:', 10 * 1024 * 1024);
    expect(measured.ratio).toBeCloseTo(usage.ratio / 2);
    expect(measured.limit).toBe(10 * 1024 * 1024);
    // A nonsense limit falls back to the typical one.
    expect(storageUsage('chess-trainer:', 0).limit).toBe(STORAGE_LIMIT_BYTES);
  });

  it('formats byte counts for people', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(20 * 1024)).toBe('20 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

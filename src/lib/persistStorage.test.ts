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
    safeLocalStorage.setItem('open-file:test', '{"a":1}');
    expect(safeLocalStorage.getItem('open-file:test')).toBe('{"a":1}');
    safeLocalStorage.removeItem('open-file:test');
    expect(safeLocalStorage.getItem('open-file:test')).toBeNull();
  });

  it('swallows a full disk, records it and warns the learner once', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    expect(() => safeLocalStorage.setItem('open-file:progress', 'x')).not.toThrow();
    expect(() => safeLocalStorage.setItem('open-file:games', 'y')).not.toThrow();
    const health = useStorageHealth.getState();
    expect(health.full).toBe(true);
    expect(health.failedKey).toBe('open-file:games');
    expect(Object.keys(health.failed).sort()).toEqual(['open-file:games', 'open-file:progress']);
    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toMatch(/Storage is full/);
    expect(toasts[0]?.tone).toBe('danger');
    // A third failure, and a second failure of the same key, add no second toast.
    safeLocalStorage.setItem('open-file:analyses', 'z');
    safeLocalStorage.setItem('open-file:progress', 'x');
    expect(useToasts.getState().toasts).toHaveLength(1);
    expect(useStorageHealth.getState().failedKey).toBe('open-file:progress');
  });

  it('tracks health per key: one key fitting again does not clear another that still fails', () => {
    const full = new Set(['open-file:progress', 'open-file:games']);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (full.has(k)) throw quotaError();
      original.call(this, k, v);
    });
    safeLocalStorage.setItem('open-file:progress', 'x');
    safeLocalStorage.setItem('open-file:games', 'y');
    expect(useStorageHealth.getState().full).toBe(true);

    // Progress fits again; games still does not.
    full.delete('open-file:progress');
    safeLocalStorage.setItem('open-file:progress', 'x');
    expect(useStorageHealth.getState().full).toBe(true);
    expect(useStorageHealth.getState().failedKey).toBe('open-file:games');
    expect(useToasts.getState().toasts).toHaveLength(1);

    full.delete('open-file:games');
    safeLocalStorage.setItem('open-file:games', 'y');
    expect(useStorageHealth.getState().full).toBe(false);
    expect(useStorageHealth.getState().failedKey).toBeNull();
  });

  it('saves every registered store again once a write fits, and swaps the warning for a confirmation', () => {
    const store = fakeStore();
    // Like the real persist middleware, a re-save writes the store's key.
    store.setState = () => {
      store.saves += 1;
      safeLocalStorage.setItem('open-file:analyses', 'big');
    };
    const unregister = registerPersistedStore(store);
    try {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError();
      });
      safeLocalStorage.setItem('open-file:analyses', 'big');
      expect(useStorageHealth.getState().full).toBe(true);
      expect(store.saves).toBe(0);
      spy.mockRestore();

      // Room is made (a game removed, say): the games write succeeds and the
      // analyses store, which never wrote again by itself, is flushed too.
      safeLocalStorage.setItem('open-file:games', '{}');
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
      safeLocalStorage.setItem('open-file:analyses', 'big');
      spy.mockRestore();
      // The analyses key is still too big: the retry fails for that key only.
      const original = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
        if (k === 'open-file:analyses') throw quotaError();
        original.call(this, k, v);
      });
      store.setState = () => {
        store.saves += 1;
        safeLocalStorage.setItem('open-file:analyses', 'big');
      };
      safeLocalStorage.setItem('open-file:games', '{}');
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
    safeLocalStorage.setItem('open-file:progress', 'x');
    expect(useStorageHealth.getState().full).toBe(true);
    spy.mockRestore();
    safeLocalStorage.setItem('open-file:progress', 'x');
    expect(useStorageHealth.getState().full).toBe(false);
  });

  it('rethrows errors that are not about space', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => safeLocalStorage.setItem('open-file:progress', 'x')).toThrow('SecurityError');
  });

  it('writeStorage says whether the value is now stored', () => {
    expect(writeStorage('open-file:profiles', '{}')).toBe(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    expect(writeStorage('open-file:profiles', '{}')).toBe(false);
    expect(useStorageHealth.getState().failedKey).toBe('open-file:profiles');
  });

  it('reloads a store when another tab writes its key', () => {
    const store = fakeStore();
    const stop = rehydrateOnStorageChange(store, 'open-file:progress');
    window.dispatchEvent(new StorageEvent('storage', { key: 'open-file:games' }));
    expect(store.reloads).toBe(0);
    window.dispatchEvent(new StorageEvent('storage', { key: 'open-file:progress' }));
    expect(store.reloads).toBe(1);
    // Another tab cleared everything.
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(store.reloads).toBe(2);
    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: 'open-file:progress' }));
    expect(store.reloads).toBe(2);
  });

  it('keeps a copy of a save that cannot be read, one per key', () => {
    localStorage.setItem('open-file:progress', '{not json');
    const copy = salvageCorruptBlob('open-file:progress', 1_700_000_000_000);
    expect(copy).toBe(`open-file:progress${CORRUPT_SUFFIX}1700000000000`);
    expect(localStorage.getItem(copy!)).toBe('{not json');
    // A later salvage replaces the older copy rather than piling them up.
    localStorage.setItem('open-file:progress', '{still not json');
    const second = salvageCorruptBlob('open-file:progress', 1_700_000_000_001);
    expect(localStorage.getItem(copy!)).toBeNull();
    expect(localStorage.getItem(second!)).toBe('{still not json');
    // Nothing stored, nothing to keep.
    expect(salvageCorruptBlob('open-file:missing')).toBeNull();
  });

  it('the rehydration hook salvages only when hydration failed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('open-file:games', 'garbage');
    const hook = keepCorruptBlob('open-file:games')();
    hook(undefined, undefined);
    expect(localStorage.length).toBe(1);
    hook(undefined, new SyntaxError('Unexpected token'));
    expect(localStorage.length).toBe(2);
    expect(storageUsage().keys.some((k) => k.key.includes(CORRUPT_SUFFIX))).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('measures what the app keeps, largest key first, against the given limit', () => {
    localStorage.setItem('open-file:progress', 'a'.repeat(1000));
    localStorage.setItem('open-file:games', 'b'.repeat(4000));
    localStorage.setItem('other-site', 'c'.repeat(9000));
    const usage = storageUsage();
    expect(usage.keys.map((k) => k.key)).toEqual(['open-file:games', 'open-file:progress']);
    expect(usage.keys[0]?.bytes).toBe(('open-file:games'.length + 4000) * 2);
    expect(usage.bytes).toBe(usage.keys[0]!.bytes + usage.keys[1]!.bytes);
    expect(usage.ratio).toBeCloseTo(usage.bytes / STORAGE_LIMIT_BYTES);
    expect(usage.limit).toBe(STORAGE_LIMIT_BYTES);
    const measured = storageUsage('open-file:', 10 * 1024 * 1024);
    expect(measured.ratio).toBeCloseTo(usage.ratio / 2);
    expect(measured.limit).toBe(10 * 1024 * 1024);
    // A nonsense limit falls back to the typical one.
    expect(storageUsage('open-file:', 0).limit).toBe(STORAGE_LIMIT_BYTES);
  });

  it('formats byte counts for people', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(20 * 1024)).toBe('20 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

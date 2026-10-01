import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';
import {
  formatBytes,
  isQuotaError,
  safeLocalStorage,
  STORAGE_LIMIT_BYTES,
  storageUsage,
  useStorageHealth,
} from './persistStorage';

function quotaError(name = 'QuotaExceededError'): DOMException {
  return new DOMException('The quota has been exceeded.', name);
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
    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toMatch(/Storage is full/);
    expect(toasts[0]?.tone).toBe('danger');
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

  it('measures what the app keeps, largest key first', () => {
    localStorage.setItem('chess-trainer:progress', 'a'.repeat(1000));
    localStorage.setItem('chess-trainer:games', 'b'.repeat(4000));
    localStorage.setItem('other-site', 'c'.repeat(9000));
    const usage = storageUsage();
    expect(usage.keys.map((k) => k.key)).toEqual(['chess-trainer:games', 'chess-trainer:progress']);
    expect(usage.keys[0]?.bytes).toBe(('chess-trainer:games'.length + 4000) * 2);
    expect(usage.bytes).toBe(usage.keys[0]!.bytes + usage.keys[1]!.bytes);
    expect(usage.ratio).toBeCloseTo(usage.bytes / STORAGE_LIMIT_BYTES);
  });

  it('formats byte counts for people', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(20 * 1024)).toBe('20 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

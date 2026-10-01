import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStorageHealth } from '@/lib/persistStorage';
import { clearFiller, FILLER_PREFIX, fillStorage, hasFiller, probeStorage } from './storageTest';

describe('storage filler', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('fills until even a tiny write is refused, then cleans up after itself', () => {
    // A pretend browser with room for 320 KB: three big chunks, then the slack.
    const original = Storage.prototype.setItem;
    const limit = 160_000;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      let used = 0;
      for (let i = 0; i < localStorage.length; i++) {
        used += localStorage.getItem(localStorage.key(i) ?? '')?.length ?? 0;
      }
      if (used + v.length > limit) throw new DOMException('full', 'QuotaExceededError');
      original.call(this, k, v);
    });
    const result = fillStorage();
    expect(result.refused).toBe(true);
    expect(result.chunks).toBe(3 + 1 + 0 + 0 + 0);
    expect(result.bytes).toBe((150_000 + 10_000) * 2);
    expect(hasFiller()).toBe(true);
    expect(localStorage.getItem(`${FILLER_PREFIX}0`)?.length).toBe(50_000);

    expect(clearFiller()).toBe(4);
    expect(hasFiller()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('stops at its ceiling when a browser never refuses', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    const result = fillStorage();
    expect(result.refused).toBe(false);
    expect(result.chunks).toBe(400);
  });

  it('rethrows errors that are not about space', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => fillStorage()).toThrow('SecurityError');
  });

  it('probes with a growing write so a full disk is noticed', () => {
    useStorageHealth.getState().markOk();
    probeStorage();
    const first = localStorage.getItem('chess-trainer:lab-probe')?.length ?? 0;
    probeStorage();
    expect(localStorage.getItem('chess-trainer:lab-probe')?.length).toBe(first + 400);
    expect(useStorageHealth.getState().full).toBe(false);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    probeStorage();
    expect(useStorageHealth.getState().full).toBe(true);
    expect(useStorageHealth.getState().failedKey).toBe('chess-trainer:lab-probe');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithTimeout,
  isTimeoutError,
  retryAfterSeconds,
  timeoutSignal,
} from './fetchWithTimeout';

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts a request that outlives its deadline', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(
              init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'),
            );
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const error = await fetchWithTimeout('https://example.test/x', { timeoutMs: 20 }).catch(
      (e: unknown) => e,
    );
    expect(isTimeoutError(error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still honours the caller’s own abort signal', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(
              init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'),
            );
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const pending = fetchWithTimeout('https://example.test/x', {
      signal: controller.signal,
      timeoutMs: 60_000,
    });
    const failure = pending.catch((e: unknown) => e);
    controller.abort();
    const error = await failure;
    expect((error as { name?: string }).name).toBe('AbortError');
    expect(isTimeoutError(error)).toBe(false);
  });

  it('combines signals even without AbortSignal.any', () => {
    const original = AbortSignal.any;
    // @ts-expect-error -- simulating an older browser
    AbortSignal.any = undefined;
    try {
      const controller = new AbortController();
      const combined = timeoutSignal(controller.signal, 60_000);
      expect(combined.aborted).toBe(false);
      controller.abort();
      expect(combined.aborted).toBe(true);
    } finally {
      AbortSignal.any = original;
    }
  });

  it('reads Retry-After as seconds or as a date', () => {
    const headers = (value: string | null) => ({
      headers: new Headers(value === null ? {} : { 'Retry-After': value }),
    });
    expect(retryAfterSeconds(headers(null))).toBeNull();
    expect(retryAfterSeconds(headers('30'))).toBe(30);
    expect(retryAfterSeconds(headers('nonsense'))).toBeNull();
    const soon = new Date(Date.now() + 45_000).toUTCString();
    const seconds = retryAfterSeconds(headers(soon));
    expect(seconds).toBeGreaterThanOrEqual(43);
    expect(seconds).toBeLessThanOrEqual(46);
  });
});

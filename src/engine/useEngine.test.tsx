import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/** An engine client whose start-up fails until `failing` is switched off. */
const fake = vi.hoisted(() => {
  const state = {
    failing: true,
    created: 0,
    terminated: 0,
    onError: null as ((err: Error) => void) | null,
  };
  class FakeEngineClient {
    status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
    private ready: Promise<void> | null = null;
    constructor() {
      state.created++;
    }
    init(): Promise<void> {
      // Like the real client: the first start-up is remembered, failure included.
      this.ready ??= state.failing
        ? Promise.reject(new Error('worker failed')).catch((err: unknown) => {
            this.status = 'error';
            throw err;
          })
        : Promise.resolve().then(() => {
            this.status = 'ready';
          });
      return this.ready;
    }
    terminate() {
      state.terminated++;
    }
    onError(listener: (err: Error) => void) {
      state.onError = listener;
      return () => undefined;
    }
  }
  return { state, FakeEngineClient };
});

vi.mock('./EngineClient', () => ({ EngineClient: fake.FakeEngineClient }));
vi.mock('./build', () => ({ chooseEngineBuild: () => ({ build: 'single', threads: 1 }) }));

import { useEngine } from './useEngine';

describe('useEngine', () => {
  it('retries a failed start with a fresh engine', async () => {
    const { result } = renderHook(() => useEngine());
    await vi.waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('worker failed');
    expect(fake.state.created).toBe(1);

    fake.state.failing = false;
    await act(() => result.current.start());
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
    // The failed worker was terminated and replaced.
    expect(fake.state.created).toBe(2);
    expect(fake.state.terminated).toBe(1);
  });

  it('reports a worker that dies after the handshake so the page can offer Retry', async () => {
    fake.state.failing = false;
    const { result } = renderHook(() => useEngine());
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => fake.state.onError?.(new Error('Engine crashed: out of memory')));
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toMatch(/crashed/);
  });
});

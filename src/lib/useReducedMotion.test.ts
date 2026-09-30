import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, useReducedMotion } from './useReducedMotion';

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => media);
  return {
    set(matches: boolean) {
      media.matches = matches;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
}

describe('useReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the media query and follows changes', () => {
    const media = mockMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});

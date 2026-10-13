import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newCard } from '@/lib/srs';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';

const counter = vi.hoisted(() => vi.fn(() => 3));
vi.mock('./repertoireDue', () => ({ countRepertoireDue: counter }));

import { useDueCount } from './useDueCount';

describe('useDueCount', () => {
  beforeEach(() => {
    counter.mockClear();
    useProgress.getState().resetAll();
    useRepertoire.getState().resetAll();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts puzzle reviews at once and never loads the repertoire counter without cards', async () => {
    const past = Date.now() - 60_000;
    useProgress.setState({
      puzzleReviews: {
        p1: { puzzleId: 'p1', due: past, step: 1, lapses: 0, addedAt: past, lastResult: 'failed' },
      } as never,
    });
    const { result } = renderHook(() => useDueCount());
    expect(result.current.puzzles).toBe(1);
    expect(result.current.openings).toBe(0);
    expect(result.current.total).toBe(1);
    // Give a lazy import every chance to run: it must not.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(counter).not.toHaveBeenCalled();
  });

  it('adds the repertoire moves once the counter has loaded', async () => {
    useRepertoire.setState({ cards: { 'italian|e2e4': newCard(Date.now() - 1000) } });
    const { result } = renderHook(() => useDueCount());
    await waitFor(() => expect(result.current.openings).toBe(3));
    expect(result.current.total).toBe(3);
    expect(counter).toHaveBeenCalled();
  });
});

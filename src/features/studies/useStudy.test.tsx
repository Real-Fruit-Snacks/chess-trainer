import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Study } from './studies';
import { useStudy } from './useStudy';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

/** A two-ply study: Ra7 (Black must play Kc8), then Rh8#. */
const study: Study = {
  id: 'ladder',
  title: 'Ladder',
  composer: 'Test',
  year: null,
  fen: '3k4/8/8/8/8/8/R7/4K2R w - - 0 1',
  goal: 'win',
  difficulty: 1,
  themes: ['mate'],
  intro: 'A two-move mate for testing the study trainer.',
  line: [
    { moves: ['Ra7'], reply: 'Kc8', note: 'Cut the king off.' },
    { moves: ['Rh8#'], note: 'Mate.' },
  ],
  outro: 'The rooks work together on alternating ranks and files.',
};

describe('useStudy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals only while the solver is to move', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useStudy(study, onDone));
    expect(result.current.canReveal).toBe(true);

    // A wrong move: during the flash the solution cannot be revealed, and nothing is recorded.
    act(() => result.current.playMove('a2', 'a3'));
    expect(result.current.phase).toBe('wrong');
    expect(result.current.canReveal).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.phase).toBe('wrong');
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.phase).toBe('solving');

    // The right move: during the scripted reply the same holds.
    act(() => result.current.playMove('a2', 'a7'));
    expect(result.current.phase).toBe('replying');
    expect(result.current.canReveal).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.phase).toBe('replying');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.phase).toBe('solving');
    expect(result.current.ply).toBe(1);

    // Now it works, and plays the rest of the line.
    act(() => result.current.reveal());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.phase).toBe('revealed');
    expect(onDone).toHaveBeenCalledWith('revealed', true);
  });

  it('replay starts a clean attempt: assisted is reset', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useStudy(study, onDone));
    act(() => result.current.hint());
    expect(result.current.assisted).toBe(true);
    act(() => result.current.reveal());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.phase).toBe('revealed');
    act(() => result.current.retry());
    expect(result.current.phase).toBe('solving');
    expect(result.current.assisted).toBe(false);
    expect(result.current.ply).toBe(0);
    // Solving the replay without help counts as a clean solve.
    act(() => result.current.playMove('a2', 'a7'));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => result.current.playMove('h1', 'h8'));
    expect(result.current.phase).toBe('solved');
    expect(onDone).toHaveBeenLastCalledWith('solved', false);
  });
});

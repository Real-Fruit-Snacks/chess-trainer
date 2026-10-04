import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonStep } from './model';
import { type StepResult, useLessonStep } from './useLessonStep';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

/** White rook on d4: the task is Rh4. The step's own arrow points at the answer. */
const rookStep: LessonStep = {
  title: 'The rook',
  text: 'Rooks move along ranks and files.',
  fen: '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1',
  shapes: ['d4h4'],
  task: { prompt: 'Move the rook to h4.', moves: ['Rh4'], hint: 'Along the rank.' },
};

/** A task with a scripted reply: Qxg4+ is answered by hxg4. */
const replyStep: LessonStep = {
  text: 'Trade queens.',
  fen: '4r1k1/pb3p2/1p6/7p/N5q1/2N5/PP3PPP/3QR1K1 w - - 0 1',
  task: { prompt: 'Trade queens.', moves: ['Qxg4+'], reply: 'hxg4' },
};

describe('useLessonStep', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports a shown answer as revealed, with the wrong moves before it, at once', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result } = renderHook(() => useLessonStep(rookStep, onSolved));
    expect(result.current.canReveal).toBe(true);

    act(() => result.current.playMove('d4', 'd8'));
    expect(result.current.phase).toBe('wrong');
    expect(result.current.highlights.get('d8')).toBe('wrong');
    // While the wrong move is being taken back, "Show answer" does nothing.
    expect(result.current.canReveal).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.phase).toBe('wrong');
    expect(onSolved).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.phase).toBe('awaiting');
    act(() => result.current.reveal());
    // Reported in the same call, not an effect later: a caller can grade on the spot.
    expect(onSolved).toHaveBeenCalledTimes(1);
    expect(onSolved).toHaveBeenCalledWith({ revealed: true, mistakes: 1, hinted: false });
    expect(result.current.phase).toBe('revealed');
    expect(result.current.done).toBe(true);
    expect(result.current.canReveal).toBe(false);
    expect([...result.current.highlights.keys()]).not.toContain('d8');
    expect(result.current.lastMove).toEqual(['d4', 'h4']);
  });

  it('clears the wrong-square mark when the answer is shown', () => {
    const { result } = renderHook(() => useLessonStep(rookStep, vi.fn()));
    act(() => result.current.playMove('d4', 'a4'));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    act(() => result.current.reveal());
    expect(result.current.highlights.size).toBe(0);
  });

  it('shows the hint marks on their own: the piece, then the move', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result } = renderHook(() => useLessonStep(rookStep, onSolved));
    expect(result.current.hintShapes).toEqual([]);
    expect(result.current.shapes).toEqual([{ orig: 'd4', dest: 'h4', brush: 'green' }]);

    act(() => result.current.hint());
    expect(result.current.hintShapes).toEqual([{ orig: 'd4', brush: 'yellow' }]);
    expect(result.current.feedback).toBe('Along the rank.');
    act(() => result.current.hint());
    expect(result.current.hintShapes).toEqual([{ orig: 'd4', dest: 'h4', brush: 'yellow' }]);
    expect(result.current.shapes).toHaveLength(2);

    act(() => result.current.playMove('d4', 'h4'));
    expect(onSolved).toHaveBeenCalledWith({ revealed: false, mistakes: 0, hinted: true });
    expect(result.current.hintShapes).toEqual([]);
  });

  it('does not reveal once the right move is in and the reply is on its way', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result } = renderHook(() => useLessonStep(replyStep, onSolved));
    act(() => result.current.playMove('d1', 'g4'));
    expect(result.current.phase).toBe('replying');
    act(() => result.current.reveal());
    expect(result.current.phase).toBe('replying');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.phase).toBe('correct');
    expect(onSolved).toHaveBeenCalledTimes(1);
    expect(onSolved).toHaveBeenCalledWith({ revealed: false, mistakes: 0, hinted: false });
  });

  it('starts the count again on Replay and on a new step', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result, rerender } = renderHook(({ step }) => useLessonStep(step, onSolved), {
      initialProps: { step: rookStep },
    });
    act(() => result.current.playMove('d4', 'a4'));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    act(() => result.current.retry());
    act(() => result.current.playMove('d4', 'h4'));
    expect(onSolved).toHaveBeenLastCalledWith({ revealed: false, mistakes: 0, hinted: false });

    rerender({ step: { ...rookStep } });
    act(() => result.current.hint());
    act(() => result.current.playMove('d4', 'h4'));
    expect(onSolved).toHaveBeenLastCalledWith({ revealed: false, mistakes: 0, hinted: true });
  });
});

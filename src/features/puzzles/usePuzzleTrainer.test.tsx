import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Puzzle } from './puzzleService';
import { usePuzzleTrainer } from './usePuzzleTrainer';

/** Back-rank mate in two: after 1...Rf8-c8?? ... we use a simple two-move puzzle instead. */
const puzzle: Puzzle = {
  id: 't1',
  // Black to move plays ...Kg8-h8 (the setup move); then White mates with Rd8#.
  fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1',
  moves: 'g8h8 d1d8',
  rating: 700,
  rd: 80,
  popularity: 100,
  plays: 1000,
  themes: 'backRankMate mate mateIn1 oneMove',
  url: 'https://lichess.org/x',
};

const anyMate: Puzzle = {
  id: 't3',
  // Black escapes check with ...Kh8; White then has three different mates in one.
  fen: '6k1/8/4Q1K1/8/8/8/8/8 b - - 0 1',
  moves: 'g8h8 e6e8',
  rating: 600,
  rd: 80,
  popularity: 100,
  plays: 1000,
  themes: 'mate mateIn1 oneMove',
  url: 'https://lichess.org/z',
};

const twoMover: Puzzle = {
  id: 't2',
  // Ladder mate: after ...Kd8 the solver plays Ra7, Black replies ...Kc8, then Rh8#.
  fen: '4k3/8/8/8/8/8/R7/4K2R b - - 0 1',
  moves: 'e8d8 a2a7 d8c8 h1h8',
  rating: 900,
  rd: 80,
  popularity: 100,
  plays: 1000,
  themes: 'mate mateIn2 short',
  url: 'https://lichess.org/y',
};

describe('usePuzzleTrainer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays the setup move, then accepts the solution and reports once', () => {
    const onOutcome = vi.fn();
    const { result } = renderHook(() => usePuzzleTrainer(onOutcome));

    act(() => result.current.load(puzzle));
    expect(result.current.phase).toBe('intro');
    expect(result.current.solverColor).toBe('white');

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current.phase).toBe('solving');
    expect(result.current.position.fen.split(' ')[1]).toBe('w');

    act(() => result.current.playUserMove('d1', 'd8'));
    expect(result.current.phase).toBe('solved');
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome.mock.calls[0]?.[0]).toMatchObject({ outcome: 'solved', hintUsed: false });
  });

  it('rejects a wrong move, takes it back and allows retry without re-reporting', () => {
    const onOutcome = vi.fn();
    const { result } = renderHook(() => usePuzzleTrainer(onOutcome));
    act(() => result.current.load(puzzle));
    act(() => {
      vi.advanceTimersByTime(700);
    });

    act(() => result.current.playUserMove('d1', 'd7'));
    expect(result.current.phase).toBe('failed');
    expect(onOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }), puzzle);

    act(() => {
      vi.advanceTimersByTime(800);
    });
    act(() => result.current.retry());
    expect(result.current.phase).toBe('solving');
    expect(result.current.practiceAfterFail).toBe(true);

    act(() => result.current.playUserMove('d1', 'd8'));
    expect(result.current.phase).toBe('solved');
    expect(onOutcome).toHaveBeenCalledTimes(1);
  });

  it('plays the opponent reply between solver moves', () => {
    const onOutcome = vi.fn();
    const { result } = renderHook(() => usePuzzleTrainer(onOutcome));
    act(() => result.current.load(twoMover));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current.position.total).toBe(2);
    act(() => result.current.playUserMove('a2', 'a7'));
    expect(result.current.phase).toBe('replying');
    expect(onOutcome).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.phase).toBe('solving');
    expect(result.current.position.progress).toBe(1);
    act(() => result.current.playUserMove('h1', 'h8'));
    expect(result.current.phase).toBe('solved');
    expect(onOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'solved' }),
      twoMover,
    );
  });

  it('accepts any checkmating move on the final step', () => {
    const onOutcome = vi.fn();
    const { result } = renderHook(() => usePuzzleTrainer(onOutcome));
    act(() => result.current.load(anyMate));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    // Expected Qe8#; Qc8# is a different mate and must be accepted too.
    act(() => result.current.playUserMove('e6', 'c8'));
    expect(result.current.phase).toBe('solved');
    expect(onOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'solved' }), anyMate);
  });

  it('hints mark the solve as assisted and show the piece, then the move', () => {
    const onOutcome = vi.fn();
    const { result } = renderHook(() => usePuzzleTrainer(onOutcome));
    act(() => result.current.load(puzzle));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    act(() => result.current.hint());
    expect(result.current.shapes).toEqual([{ orig: 'd1', brush: 'green' }]);
    act(() => result.current.hint());
    expect(result.current.shapes).toEqual([{ orig: 'd1', dest: 'd8', brush: 'green' }]);
    act(() => result.current.playUserMove('d1', 'd8'));
    expect(onOutcome.mock.calls[0]?.[0]).toMatchObject({ outcome: 'solved', hintUsed: true });
  });

  it('showing the solution counts as a fail and plays it out', () => {
    const onOutcome = vi.fn();
    const { result } = renderHook(() => usePuzzleTrainer(onOutcome));
    act(() => result.current.load(puzzle));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    act(() => result.current.showSolution());
    expect(onOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }), puzzle);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.phase).toBe('solved');
    expect(result.current.position.fen).toContain('3R3k');
  });
});

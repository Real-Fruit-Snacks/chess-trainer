import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameTree } from '@/chess/tree';
import type * as SoundModule from '@/lib/sound';
import { DAY_MS } from '@/lib/srs';
import { useProgress } from '@/store/progress';
import { cardsFor, useRepertoire } from '@/store/repertoire';

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

import { useRepertoireTrainer } from './useRepertoireTrainer';

/** 1. d4 Nf6 2. c4 e6 3. Nc3 and 1. c4 e6 2. d4 Nf6 3. Nc3 transpose before White's Nc3. */
const PGN = '1. d4 (1. c4 e6 2. d4 Nf6 3. Nc3) 1... Nf6 2. c4 e6 3. Nc3 *';
const MAIN_NC3 = 'd2d4 g8f6 c2c4 e7e6 b1c3';
const SIDE_NC3 = 'c2c4 e7e6 d2d4 g8f6 b1c3';

/** Lets the opponent's replies (450 ms each) play out. */
const wait = async (ms = 600) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('useRepertoireTrainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mid-afternoon, so "earlier today" never crosses midnight.
    vi.setSystemTime(new Date(2026, 9, 3, 15, 0, 0));
    // pickLine breaks ties at random: the first (main) line.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    useRepertoire.setState({ cards: {}, sessions: [] });
    useProgress.getState().resetAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** Plays the main line 1. d4 Nf6 2. c4 e6 3. Nc3 as White; `miss` plays a wrong third move first. */
  async function playMainLine(miss = false) {
    const tree = GameTree.fromPgn(PGN);
    const { result } = renderHook(() => useRepertoireTrainer('rep', tree, 'white'));
    act(() => result.current.start());
    expect(result.current.phase).toBe('learner');
    act(() => result.current.playMove('d2', 'd4'));
    await wait();
    act(() => result.current.playMove('c2', 'c4'));
    await wait();
    expect(result.current.phase).toBe('learner');
    if (miss) {
      act(() => result.current.playMove('g1', 'f3'));
      await wait();
    }
    act(() => result.current.playMove('b1', 'c3'));
    await wait();
    return result;
  }

  it('grading a move also grades the same move reached by another move order', async () => {
    const result = await playMainLine();
    expect(result.current.phase).toBe('lineDone');
    const cards = cardsFor(useRepertoire.getState().cards, 'rep');
    expect(cards[MAIN_NC3]?.reps).toBe(1);
    expect(cards[SIDE_NC3]?.reps).toBe(1);
    // The side line's own first moves come from other positions: still unknown.
    expect(cards.c2c4).toBeUndefined();
    expect(cards['c2c4 e7e6 d2d4']).toBeUndefined();
    // Counted once in the line result.
    expect(result.current.lineResult).toEqual({ correct: 3, total: 3 });
  });

  it('a miss carries over to the transposition', async () => {
    await playMainLine(true);
    const cards = cardsFor(useRepertoire.getState().cards, 'rep');
    expect(cards[MAIN_NC3]?.lapses).toBe(1);
    expect(cards[SIDE_NC3]?.lapses).toBe(1);
  });

  it('a twin already recalled today through its own line is not advanced twice', async () => {
    const earlier = Date.now() - 60_000;
    const recalled = {
      ease: 2.5,
      interval: 1,
      due: earlier + DAY_MS,
      reps: 1,
      lapses: 0,
      lastReviewed: earlier,
    };
    useRepertoire.setState({ cards: { [`rep|${SIDE_NC3}`]: recalled } });
    await playMainLine();
    const cards = cardsFor(useRepertoire.getState().cards, 'rep');
    expect(cards[MAIN_NC3]?.reps).toBe(1);
    expect(cards[SIDE_NC3]).toEqual(recalled);
  });
});

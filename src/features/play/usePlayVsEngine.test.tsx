import { act, renderHook } from '@testing-library/react';
import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBlunder } from '@/chess/blunderCheck';
import { START_FEN } from '@/chess/helpers';
import type * as BookModule from './openingBook';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { repertoireCardId, useRepertoire } from '@/store/repertoire';
import { useSettings } from '@/store/settings';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';

/**
 * A scripted engine: every search answers with the first legal move (plus a
 * one-line `info` so the coach has a score), and records every UCI command it
 * was given in order, so tests can check what the hook asked for and when.
 */
interface FakeEngine {
  status: 'ready' | 'error' | 'loading';
  /** Every `setoption` and `search` in the order they reached the engine. */
  log: string[];
  searches: { fen: string; moves: string[]; depth?: number; movetime?: number }[];
  /** Score (cp, for the side to move) the next searches report. */
  cp: number;
  /** How long each search "thinks" before answering (fake-timer milliseconds). */
  delayMs: number;
  /** The next N searches end as if stopped early (a shallow result the hook must not trust). */
  stopNext: number;
  instance: object;
}
const fake: FakeEngine = vi.hoisted(() => ({
  status: 'ready',
  log: [],
  searches: [],
  cp: 0,
  delayMs: 0,
  stopNext: 0,
  instance: {},
}));

vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const client = {
    init: () => Promise.resolve(),
    setOption: (name: string, value: number) => {
      fake.log.push(`setoption name ${name} value ${value}`);
      return Promise.resolve();
    },
    newGame: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: { fen: string; moves?: string[]; depth?: number; movetime?: number }) => {
      fake.searches.push({
        fen: params.fen,
        moves: [...(params.moves ?? [])],
        depth: params.depth,
        movetime: params.movetime,
      });
      fake.log.push(`search ${params.fen}`);
      const chess = new Chess(params.fen);
      for (const m of params.moves ?? []) {
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
      const move = chess.moves({ verbose: true })[0];
      const lines = new Map();
      if (move) {
        lines.set(1, {
          depth: 12,
          multipv: 1,
          score: { type: 'cp', value: fake.cp },
          pv: [move.lan],
          nodes: 1,
          nps: 1,
          time: 1,
        });
      }
      const stopped = fake.stopNext > 0;
      if (stopped) fake.stopNext -= 1;
      const result = { stopped, bestmove: { move: move ? move.lan : null }, lines };
      return {
        id: fake.searches.length,
        stop: () => undefined,
        result: fake.delayMs
          ? new Promise((resolve) => setTimeout(() => resolve(result), fake.delayMs))
          : Promise.resolve(result),
      };
    },
  };
  fake.instance = client;
  // Stable like the real hook's `engine`, which the hook's callbacks depend on.
  const engine = () => fake.instance;
  return {
    useEngine: () => ({
      engine,
      status: fake.status,
      error: null,
      start: () => Promise.resolve(),
    }),
  };
});

const played = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: played, playMoveSound: vi.fn() };
});

/** Records the card map every book reply was weighted with. */
const bookReplyCards = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('./openingBook', async (importOriginal) => {
  const actual = await importOriginal<typeof BookModule>();
  return {
    ...actual,
    bookReply: (...args: Parameters<typeof actual.bookReply>) => {
      bookReplyCards.push(args[1]);
      return actual.bookReply(...args);
    },
  };
});

import { usePlayVsEngine } from './usePlayVsEngine';

/**
 * Lets the engine effect's promises settle and its "thinking" pause elapse. Two
 * rounds: a timer scheduled by a state update made while the clock advanced
 * (the coach finishing, say) is only due in the second one.
 */
const settle = async (ms = 400) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** Advances the fake clock a second at a time so every React update commits as it would live. */
const advance = async (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(1000, ms - elapsed));
    });
  }
};

/** White mates in one with Qa8#. */
const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1';

describe('usePlayVsEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.status = 'ready';
    fake.log.length = 0;
    fake.searches.length = 0;
    fake.cp = 0;
    fake.delayMs = 0;
    fake.stopNext = 0;
    bookReplyCards.length = 0;
    played.mockClear();
    // No random moves from the weak levels: the scripted engine decides.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    useProgress.getState().resetAll();
    useSettings.getState().reset();
    useRepertoire.setState({ cards: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('records a finished game once and refuses a take-back afterwards', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({ color: 'white', levelId: 1, timeControlId: 'none', fen: MATE_IN_ONE }),
    );
    act(() => {
      result.current.playerNotation('Qa8#');
    });
    await settle();
    expect(result.current.gameOver?.verdict).toBe('win');
    expect(useProgress.getState().games).toHaveLength(1);
    expect(useProgress.getState().games[0]?.source).toBe('play');

    act(() => result.current.takeBack());
    await settle();
    expect(result.current.game.position.history).toHaveLength(1);
    expect(result.current.gameOver?.verdict).toBe('win');
    expect(useProgress.getState().games).toHaveLength(1);
  });

  it('the coach does not call a checkmating move a blunder', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 1,
        timeControlId: 'none',
        fen: MATE_IN_ONE,
        coach: true,
      }),
    );
    expect(result.current.coach).toBe(true);
    await settle();
    act(() => {
      result.current.playerNotation('Qa8#');
    });
    await settle();
    expect(result.current.gameOver?.verdict).toBe('win');
    expect(result.current.coachAlert).toBeNull();
    expect(result.current.coachChecking).toBe(false);
    expect(played).not.toHaveBeenCalledWith('failed');
    // No search was wasted on the mated position.
    expect(fake.searches.some((s) => s.fen.startsWith('Q5k1'))).toBe(false);
  });

  it('the coach searches at Skill Level 20, even after the engine played at its own level', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({ color: 'white', levelId: 1, timeControlId: 'none', coach: true }),
    );
    await settle();
    // The coach already knows the starting position; the skill was raised before that search.
    const firstSearch = fake.log.findIndex((c) => c.startsWith('search'));
    expect(firstSearch).toBeGreaterThan(-1);
    expect(fake.log.slice(0, firstSearch)).toContain('setoption name Skill Level value 20');

    act(() => {
      result.current.playerNotation('e4');
    });
    await settle();
    // Learner moved, coach checked, engine (Level 1 = Skill 0) replied.
    expect(result.current.game.position.history).toHaveLength(2);
    expect(fake.log).toContain('setoption name Skill Level value 0');
    // Back on the learner's turn the coach evaluates again — at full strength.
    const lastSkillZero = fake.log.lastIndexOf('setoption name Skill Level value 0');
    const after = fake.log.slice(lastSkillZero + 1);
    // The engine's own search comes first, then the coach's — preceded by the skill reset.
    const lastSearch = after.length - 1;
    expect(after[lastSearch]).toMatch(/^search r1bqkbnr/);
    expect(after.slice(0, lastSearch)).toContain('setoption name Skill Level value 20');
    expect(result.current.coachAlert).toBeNull();
  });

  it('a coach search that was stopped early is neither trusted nor remembered', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    // The coach's first look at the starting position is cut short (Hint, say, stopped it).
    fake.stopNext = 1;
    act(() =>
      result.current.start({ color: 'white', levelId: 1, timeControlId: 'none', coach: true }),
    );
    await settle();
    const startSearches = () =>
      fake.searches.filter((s) => s.fen === START_FEN && s.moves.length === 0).length;
    expect(startSearches()).toBe(1);
    act(() => {
      result.current.playerNotation('e4');
    });
    await settle();
    // The move is judged against a fresh, complete search of the position before it.
    expect(startSearches()).toBe(2);
    expect(result.current.coachAlert).toBeNull();
    expect(result.current.game.position.history).toHaveLength(2);
  });

  it('a hint that arrives after the learner has moved is not drawn', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: 'none' }));
    fake.delayMs = 1000;
    act(() => result.current.hint());
    expect(result.current.hinting).toBe(true);
    act(() => {
      result.current.playerNotation('e4');
    });
    await advance(3000);
    expect(result.current.game.position.history).toHaveLength(2);
    expect(result.current.hintShapes).toEqual([]);
    expect(result.current.hintMove).toBeNull();
    expect(result.current.hinting).toBe(false);
    // On the learner's turn the hint is drawn, and given in words for screen readers.
    fake.delayMs = 0;
    act(() => result.current.hint());
    await settle();
    const expected = new Chess(result.current.game.position.fen).moves()[0];
    expect(result.current.hintShapes).toHaveLength(1);
    expect(result.current.hintMove).toEqual({ kind: 'hint', san: expected });
  });

  it('a fresh engine after Retry is told the level’s Skill Level again', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() => result.current.start({ color: 'black', levelId: 1, timeControlId: 'none' }));
    await settle();
    const skillZero = () => fake.log.filter((c) => c === 'setoption name Skill Level value 0');
    expect(result.current.game.position.history).toHaveLength(1);
    expect(skillZero()).toHaveLength(1);
    // Retry builds a new worker, which starts at full strength.
    const original = fake.instance;
    fake.instance = { ...original };
    try {
      act(() => {
        result.current.playerNotation('e5');
      });
      await settle();
      expect(result.current.game.position.history).toHaveLength(3);
      expect(skillZero()).toHaveLength(2);
    } finally {
      fake.instance = original;
    }
  });

  it('start() leaves the Play defaults in settings alone', () => {
    useSettings.getState().update({ playLevel: 3, playColor: 'random', playTimeControl: 'none' });
    const { result } = renderHook(() => usePlayVsEngine());
    act(() => result.current.start({ color: 'white', levelId: 8, timeControlId: '1+0' }));
    const settings = useSettings.getState();
    expect(settings.playLevel).toBe(3);
    expect(settings.playColor).toBe('random');
    expect(settings.playTimeControl).toBe('none');
  });

  it('records the source and event the caller asked for', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 8,
        timeControlId: 'none',
        fen: MATE_IN_ONE,
        source: 'arcade',
        event: 'Odds Ladder · queen odds',
      }),
    );
    act(() => {
      result.current.playerNotation('Qa8#');
    });
    await settle();
    const game = useProgress.getState().games[0];
    expect(game?.source).toBe('arcade');
    expect(game?.event).toBe('Odds Ladder · queen odds');
    expect(game?.pgn).toContain('[Event "Chess Trainer — Odds Ladder · queen odds"]');
  });

  describe('opening practice', () => {
    const rep = BUILT_IN_REPERTOIRES.find((r) => r.id === 'london')!;
    const book = { id: rep.id, name: rep.name, color: rep.color, pgn: rep.pgn };

    it('weights the book reply with the cards of this repertoire, keyed by path', async () => {
      // One learner card on a bare path, stored under the repertoire's prefix.
      const path = 'd2d4 d7d5 c1f4';
      useRepertoire.setState({
        cards: {
          [repertoireCardId(rep.id, path)]: {
            due: 0,
            interval: 1,
            ease: 2.5,
            reps: 1,
            lapses: 0,
            lastReviewed: 0,
          },
          [repertoireCardId('italian', path)]: { reps: 0 } as never,
        },
      });
      const { result } = renderHook(() => usePlayVsEngine());
      act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: 'none', book }));
      expect(result.current.playerColor).toBe('white');
      act(() => {
        result.current.playerNotation('d4');
      });
      await settle();
      expect(result.current.book?.status).toBe('in-book');
      expect(bookReplyCards.length).toBeGreaterThan(0);
      const cards = bookReplyCards[0]!;
      expect(Object.keys(cards)).toEqual([path]);
      expect(fake.searches).toHaveLength(0);
      const games = useProgress.getState().games;
      expect(games).toHaveLength(0);
    });

    it('alerts every time the learner leaves the book at the same ply, counting the lapse once', async () => {
      const review = vi.spyOn(useRepertoire.getState(), 'review');
      useRepertoire.setState({ review });
      const { result } = renderHook(() => usePlayVsEngine());
      act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: 'none', book }));
      act(() => {
        result.current.playerNotation('e4');
      });
      await settle();
      expect(result.current.bookAlert?.played).toBe('e4');
      expect(result.current.book?.status).toBe('deviated');
      // The engine waits for the decision.
      expect(result.current.game.position.history).toHaveLength(1);

      act(() => result.current.bookTakeBack());
      expect(result.current.bookAlert).toBeNull();
      expect(result.current.game.position.history).toHaveLength(0);

      act(() => {
        result.current.playerNotation('e4');
      });
      await settle();
      expect(result.current.bookAlert?.played).toBe('e4');
      expect(review).toHaveBeenCalledTimes(1);
      expect(played).toHaveBeenCalledWith('failed');
      expect(played.mock.calls.filter(([s]) => s === 'failed')).toHaveLength(2);

      // Playing on hands the game to the engine and records it as a book game.
      act(() => result.current.bookPlayOn());
      await settle();
      expect(result.current.game.position.history).toHaveLength(2);
    });

    it('pauses the clocks while a deviation alert is up', async () => {
      const { result } = renderHook(() => usePlayVsEngine());
      act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: '5+0', book }));
      act(() => {
        result.current.playerNotation('e4');
      });
      await settle();
      expect(result.current.bookAlert).not.toBeNull();
      expect(result.current.clock.running).toBeNull();
      const before = result.current.clock.black;
      await advance(5_000);
      expect(result.current.clock.black).toBe(before);
      act(() => result.current.bookTakeBack());
      await settle();
      // Back on the learner's move with the learner's clock running again.
      expect(result.current.clock.running).toBe('white');
    });

    it('does not raise the alert again on later moves of a game played on', async () => {
      const { result } = renderHook(() => usePlayVsEngine());
      act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: 'none', book }));
      act(() => {
        result.current.playerNotation('e4');
      });
      await settle();
      expect(result.current.bookAlert).not.toBeNull();
      act(() => result.current.bookPlayOn());
      await settle();
      // The engine answered; the deviation stays on record but the alert does not come back.
      expect(result.current.game.position.history).toHaveLength(2);
      expect(result.current.book?.status).toBe('deviated');
      expect(result.current.bookAlert).toBeNull();
      act(() => {
        result.current.playerNotation('Nf3');
      });
      await settle();
      expect(result.current.game.position.history).toHaveLength(4);
      expect(result.current.bookAlert).toBeNull();
      expect(played.mock.calls.filter(([s]) => s === 'failed')).toHaveLength(1);
    });

    it('one take-back clears both the coach and the book alert', async () => {
      // Every reply looks like a blunder to the coach unless it is the engine's own first choice.
      fake.cp = 500;
      const { result } = renderHook(() => usePlayVsEngine());
      act(() =>
        result.current.start({
          color: 'white',
          levelId: 1,
          timeControlId: 'none',
          book,
          coach: true,
        }),
      );
      await settle();
      act(() => {
        result.current.playerNotation('e4');
      });
      await settle();
      expect(result.current.bookAlert).not.toBeNull();
      expect(result.current.coachAlert).not.toBeNull();
      act(() => result.current.bookTakeBack());
      expect(result.current.bookAlert).toBeNull();
      expect(result.current.coachAlert).toBeNull();
      expect(result.current.game.position.history).toHaveLength(0);
    });

    it('a resignation closes the alert; a late take-back cannot reopen the recorded game', async () => {
      const { result } = renderHook(() => usePlayVsEngine());
      act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: 'none', book }));
      act(() => {
        result.current.playerNotation('e4');
      });
      await settle();
      expect(result.current.bookAlert).not.toBeNull();
      // The alert's handler as it was on screen when the learner resigned.
      const lateTakeBack = result.current.bookTakeBack;
      act(() => result.current.resign());
      await settle();
      expect(result.current.gameOver?.reason).toBe('resignation');
      expect(result.current.bookAlert).toBeNull();
      act(() => lateTakeBack());
      await settle();
      expect(result.current.gameOver?.reason).toBe('resignation');
      expect(result.current.game.position.history).toHaveLength(1);
      expect(useProgress.getState().games).toHaveLength(1);
      expect(useProgress.getState().games[0]?.source).toBe('book');
    });

    it('the hint in book is the repertoire move', () => {
      const { result } = renderHook(() => usePlayVsEngine());
      act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: 'none', book }));
      act(() => result.current.hint());
      expect(result.current.hintShapes).toEqual([{ orig: 'd2', dest: 'd4', brush: 'paleBlue' }]);
      expect(result.current.hintMove).toEqual({ kind: 'hint', san: 'd4' });
      expect(fake.searches).toHaveLength(0);
    });
  });

  describe('clocks', () => {
    it('the first move starts the clocks without an increment', async () => {
      const { result } = renderHook(() => usePlayVsEngine());
      act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: '2+1' }));
      act(() => {
        result.current.playerNotation('e4');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.clock.running).toBe('black');
      expect(result.current.clock.white).toBe(120_000);
    });

    it('a flag against a side with no mating material is a draw', async () => {
      const { result } = renderHook(() => usePlayVsEngine());
      // The engine (White) has a bare king; the learner (Black) runs out of time.
      act(() =>
        result.current.start({
          color: 'black',
          levelId: 1,
          timeControlId: '1+0',
          fen: '4k2r/8/8/8/8/8/8/4K3 w - - 0 1',
        }),
      );
      await settle();
      expect(result.current.game.position.history).toHaveLength(1);
      expect(result.current.clock.running).toBe('black');
      await settle(61_000);
      expect(result.current.gameOver).toEqual({
        result: '1/2-1/2',
        reason: 'time, with no mating material left',
        verdict: 'draw',
      });
      expect(useProgress.getState().games[0]?.result).toBe('1/2-1/2');
    });

    it('keeps the depth and adds a time limit when the engine is short of time', async () => {
      const { result } = renderHook(() => usePlayVsEngine());
      act(() => result.current.start({ color: 'black', levelId: 2, timeControlId: '1+0' }));
      await settle();
      // The first move does not count against the clock: the level's own depth, no movetime.
      expect(fake.searches[0]).toMatchObject({ depth: 2, movetime: undefined });
      act(() => {
        result.current.playerNotation('e5');
      });
      await settle();
      act(() => {
        result.current.playerNotation('Nc6');
      });
      // A long think burns the engine's clock down to a few seconds. Short steps: a React update
      // made inside one long act() scope would only commit when the scope ends.
      fake.delayMs = 52_000;
      await advance(60_000);
      fake.delayMs = 0;
      expect(result.current.game.position.history).toHaveLength(5);
      expect(result.current.clock.white).toBeLessThan(10_000);
      act(() => {
        result.current.playerNotation('Nf6');
      });
      // Under ten seconds the engine skips its natural-looking pause and answers at once.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5);
      });
      expect(result.current.game.position.history).toHaveLength(7);
      await settle();
      const last = fake.searches[fake.searches.length - 1]!;
      expect(last.depth).toBe(2);
      expect(last.movetime).toBeLessThanOrEqual(300);
      expect(result.current.gameOver).toBeNull();
    });
  });

  it('closes a pending promotion when the clock falls', async () => {
    useSettings.getState().update({ autoQueen: false });
    const { result } = renderHook(() => usePlayVsEngine());
    // The engine (Black) has a bare king; White runs out of time over the promotion choice.
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 1,
        timeControlId: '1+0',
        fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1',
      }),
    );
    act(() => result.current.playerMove('a1', 'b1'));
    await settle();
    // The engine replied; now the pawn reaches the last rank and the picker opens.
    expect(result.current.game.position.history).toHaveLength(2);
    act(() => result.current.playerMove('a7', 'a8'));
    expect(result.current.game.pendingPromotion).not.toBeNull();
    await settle(61_000);
    expect(result.current.gameOver?.reason).toBe('time, with no mating material left');
    expect(result.current.game.pendingPromotion).toBeNull();
    act(() => result.current.resolvePromotion('q'));
    expect(result.current.game.position.history).toHaveLength(2);
  });

  it('closes a pending promotion on resignation instead of playing it later', async () => {
    useSettings.getState().update({ autoQueen: false });
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 1,
        timeControlId: 'none',
        fen: '8/P6k/8/8/8/8/8/K7 w - - 0 1',
      }),
    );
    act(() => result.current.playerMove('a7', 'a8'));
    expect(result.current.game.pendingPromotion).not.toBeNull();
    act(() => result.current.resign());
    expect(result.current.gameOver?.verdict).toBe('loss');
    act(() => result.current.resolvePromotion('q'));
    await settle();
    expect(result.current.game.position.history).toHaveLength(0);
  });

  describe('blunder check', () => {
    /** 1.e4 e5 2.Nf3 Nc6: 3.Ba6?? loses the bishop to ...bxa6. */
    const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

    const startWith = (
      blunderCheck: boolean,
      fen = ITALIAN,
      opponent: 'engine' | 'human' = 'engine',
    ) => {
      const hook = renderHook(() => usePlayVsEngine());
      act(() =>
        hook.result.current.start({
          color: 'white',
          levelId: 1,
          timeControlId: 'none',
          fen,
          opponent,
          blunderCheck,
        }),
      );
      return hook;
    };

    it('holds back a move that hangs a piece, and counts it once', async () => {
      const { result } = startWith(true);
      expect(result.current.blunderCheck).toBe(true);
      act(() => result.current.playerMove('f1', 'a6'));
      expect(result.current.game.position.history).toHaveLength(0);
      expect(result.current.blunderAlert).toMatchObject({
        revealed: false,
        warning: { kind: 'material', move: { san: 'Ba6' }, reply: { san: 'bxa6' }, captured: 'b' },
      });
      expect(played).toHaveBeenCalledWith('notify');
      expect(result.current.blunderStops).toBe(1);
      // The same move again is the same stop.
      act(() => result.current.blunderLookAgain());
      act(() => result.current.playerMove('f1', 'a6'));
      expect(result.current.blunderStops).toBe(1);
      expect(useProgress.getState().blunderChecks).toEqual({ stopped: 1, playedAnyway: 0 });
      await settle();
      // Nothing was played, so the engine was not asked for a reply.
      expect(fake.searches).toHaveLength(0);
    });

    it('shows the answer on the board when asked', () => {
      const { result } = startWith(true);
      act(() => result.current.playerMove('f1', 'a6'));
      expect(result.current.hintShapes).toEqual([]);
      act(() => result.current.blunderShowMe());
      expect(result.current.blunderAlert?.revealed).toBe(true);
      expect(result.current.hintShapes).toEqual([
        { orig: 'f1', dest: 'a6', brush: 'paleBlue' },
        { orig: 'b7', dest: 'a6', brush: 'red' },
      ]);
    });

    it('lets another move through, or the same one played anyway', async () => {
      const { result } = startWith(true);
      act(() => result.current.playerMove('f1', 'a6'));
      // Choosing another move simply replaces the warning.
      act(() => result.current.playerMove('f1', 'c4'));
      expect(result.current.blunderAlert).toBeNull();
      expect(result.current.game.position.history.map((m) => m.san)).toEqual(['Bc4']);
      await settle();
      expect(result.current.game.position.history).toHaveLength(2);

      const second = startWith(true).result;
      act(() => {
        second.current.playerNotation('Ba6');
      });
      expect(second.current.blunderAlert?.warning.move.san).toBe('Ba6');
      act(() => second.current.blunderPlayAnyway());
      expect(second.current.blunderAlert).toBeNull();
      expect(second.current.game.position.history.map((m) => m.san)).toEqual(['Ba6']);
      expect(useProgress.getState().blunderChecks.playedAnyway).toBe(1);
    });

    it('stops a promotion that allows mate once the piece is chosen', () => {
      // After c8=Q the bishop on b8 sees h2, and ...Qxh2 is mate.
      const { result } = startWith(true, '1b6/2P5/8/k7/7q/8/6PP/7K w - - 0 1');
      act(() => result.current.playerMove('c7', 'c8'));
      expect(result.current.game.pendingPromotion).not.toBeNull();
      expect(result.current.blunderAlert).toBeNull();
      act(() => result.current.resolvePromotion('q'));
      expect(result.current.game.pendingPromotion).toBeNull();
      expect(result.current.game.position.history).toHaveLength(0);
      expect(result.current.blunderAlert?.warning).toMatchObject({
        kind: 'mate',
        reply: { san: 'Qxh2#' },
      });
      act(() => result.current.blunderPlayAnyway());
      expect(result.current.game.position.history.map((m) => m.san)).toEqual(['c8=Q']);
    });

    it('stays out of the way when it is off, and between two players', () => {
      const off = startWith(false).result;
      act(() => off.current.playerMove('f1', 'a6'));
      expect(off.current.blunderAlert).toBeNull();
      expect(off.current.game.position.history).toHaveLength(1);

      const hotSeat = startWith(true, ITALIAN, 'human').result;
      expect(hotSeat.current.blunderCheck).toBe(false);
      act(() => hotSeat.current.playerMove('f1', 'a6'));
      expect(hotSeat.current.game.position.history).toHaveLength(1);
    });

    it('clears the warning with a take-back or a new game', async () => {
      const { result } = startWith(true);
      act(() => result.current.playerMove('f1', 'c4'));
      await settle();
      expect(result.current.game.position.history).toHaveLength(2);
      // Whatever the engine answered, some move now hangs material: find one and try it.
      const fen = result.current.game.position.fen;
      const hanging = new Chess(fen)
        .moves({ verbose: true })
        .find((m) => checkBlunder(fen, { from: m.from, to: m.to }));
      if (!hanging) throw new Error('no hanging move');
      act(() => result.current.playerMove(hanging.from, hanging.to));
      expect(result.current.blunderAlert).not.toBeNull();
      act(() => result.current.takeBack());
      expect(result.current.blunderAlert).toBeNull();
      expect(result.current.game.position.history).toHaveLength(0);
      act(() => result.current.playerMove('f1', 'a6'));
      expect(result.current.blunderAlert).not.toBeNull();
      act(() => result.current.start({ color: 'white', levelId: 1, timeControlId: 'none' }));
      expect(result.current.blunderAlert).toBeNull();
      expect(result.current.blunderStops).toBe(0);
      expect(result.current.blunderCheck).toBe(false);
    });
  });
});

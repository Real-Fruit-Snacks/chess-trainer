import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';

/** Stockfish: ready, and asked for nothing in these games but hints and the coach. */
const engine = vi.hoisted(() => ({ searches: 0 }));
vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const client = {
    init: () => Promise.resolve(),
    setOption: () => Promise.resolve(),
    newGame: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: { fen: string; moves?: string[] }) => {
      engine.searches++;
      const chess = new Chess(params.fen);
      for (const m of params.moves ?? []) chess.move(m);
      const move = chess.moves({ verbose: true })[0];
      return {
        id: engine.searches,
        stop: () => undefined,
        result: Promise.resolve({
          stopped: false,
          bestmove: { move: move?.lan ?? null },
          lines: new Map([[1, { score: { type: 'cp', value: 0 }, pv: [move?.lan ?? ''] }]]),
        }),
      };
    },
  };
  // Stable like the real hook's `engine`, which the hook's callbacks depend on.
  const engineFn = () => client;
  return {
    useEngine: () => ({
      engine: engineFn,
      status: 'ready',
      error: null,
      start: () => Promise.resolve(),
    }),
  };
});

/**
 * The human-like opponent, scripted: the model's "prediction" puts `favourite`
 * first with half the probability and spreads the rest over the other legal moves.
 * Its status is a little store, as the real client's is: loading it makes it ready.
 */
const maia = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    status: 'idle',
    listeners,
    setStatus(status: string) {
      this.status = status;
      for (const listener of listeners) listener();
    },
    loads: 0,
    predictions: [] as { fen: string; rating: number }[],
    /** Predictions still to fail, each with this message. */
    failures: 0,
    favourite: 'c7c5',
  };
});
vi.mock('@/engine/maia/maiaClient', async () => {
  const { Chess } = await import('chess.js');
  const { useSyncExternalStore } = await import('react');
  const client = {
    get status() {
      return maia.status;
    },
    load: () => {
      maia.loads++;
      maia.setStatus('ready');
      return Promise.resolve();
    },
    predict: (fen: string, rating: number) => {
      maia.predictions.push({ fen, rating });
      if (maia.failures > 0) {
        maia.failures--;
        return Promise.reject(new Error('bad input'));
      }
      const legal = new Chess(fen).moves({ verbose: true });
      const favourite = legal.find((m) => m.lan === maia.favourite) ?? legal[0];
      const others = legal.filter((m) => m !== favourite);
      const moves = [
        ...(favourite ? [{ uci: favourite.lan, san: favourite.san, probability: 0.5 }] : []),
        ...others.map((m) => ({ uci: m.lan, san: m.san, probability: 0.5 / others.length })),
      ];
      return Promise.resolve({ moves, value: { win: 0.4, draw: 0.2, loss: 0.4 } });
    },
  };
  const subscribe = (listener: () => void) => {
    maia.listeners.add(listener);
    return () => void maia.listeners.delete(listener);
  };
  return {
    maiaClient: () => client,
    useMaiaStatus: () => {
      const status = useSyncExternalStore(subscribe, () => maia.status);
      return { status, error: status === 'failed' ? 'boom' : null };
    },
  };
});

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

import { usePlayVsEngine } from './usePlayVsEngine';

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** White mates in one with Qa8#. */
const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1';

describe('usePlayVsEngine against the human-like opponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    maia.status = 'idle';
    maia.loads = 0;
    maia.failures = 0;
    maia.predictions.length = 0;
    maia.favourite = 'c7c5';
    engine.searches = 0;
    // The draw lands on the likeliest move; the pause is the shortest for the position.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    useProgress.getState().resetAll();
    useSettings.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('answers with a move drawn from the model’s prediction, after a pause like a person’s', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 3,
        timeControlId: 'none',
        opponent: 'humanlike',
        humanRating: 1500,
      }),
    );
    expect(result.current.opponent).toBe('humanlike');
    expect(result.current.humanRating).toBe(1500);
    expect(maia.loads).toBe(1);
    act(() => {
      result.current.playerNotation('e4');
    });
    await advance(10);
    expect(maia.predictions).toEqual([
      { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', rating: 1500 },
    ]);
    // Half the probability on the favourite, early in the game: (300 + 600) / 2 ms.
    expect(result.current.thinking).toBe(true);
    await advance(300);
    expect(result.current.game.position.history).toHaveLength(1);
    await advance(200);
    expect(result.current.game.position.history.map((m) => m.san)).toEqual(['e4', 'c5']);
    expect(result.current.thinking).toBe(false);
    // Stockfish was never asked for the opponent's move.
    expect(engine.searches).toBe(0);
  });

  it('waits for the model to load before it moves', async () => {
    maia.status = 'loading';
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'black',
        levelId: 3,
        timeControlId: 'none',
        opponent: 'humanlike',
        humanRating: 900,
      }),
    );
    maia.favourite = 'd2d4';
    await advance(2000);
    expect(maia.predictions).toHaveLength(0);
    expect(result.current.humanStatus).toBe('loading');
    act(() => maia.setStatus('ready'));
    await advance(2000);
    expect(result.current.game.position.history.map((m) => m.san)).toEqual(['d4']);
    expect(maia.predictions[0]?.rating).toBe(900);
  });

  it('records its games by rating, and suggests a step up after two wins', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    for (let game = 0; game < 2; game++) {
      act(() =>
        result.current.start({
          color: 'white',
          levelId: 3,
          timeControlId: 'none',
          opponent: 'humanlike',
          humanRating: 1500,
          fen: MATE_IN_ONE,
        }),
      );
      act(() => {
        result.current.playerNotation('Qa8#');
      });
      await advance(500);
      expect(result.current.gameOver?.verdict).toBe('win');
    }
    const games = useProgress.getState().games;
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ source: 'humanlike', opponentRating: 1500, level: 0 });
    expect(games[0]?.pgn).toContain('[Black "Maia 1500 (human-like)"]');
    expect(games[0]?.pgn).toContain('[Event "Chess Trainer — play a human-like opponent"]');
    expect(result.current.suggestedRating).toBe(1600);
    expect(result.current.suggestedLevel).toBeNull();
    // Engine-level stats are not touched: no level suggestion from these games.
    expect(useProgress.getState().games.every((g) => g.source === 'humanlike')).toBe(true);
  });

  it('keeps the coach and the blunder check, which run on Stockfish and the board', () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 3,
        timeControlId: 'none',
        opponent: 'humanlike',
        humanRating: 1200,
        coach: true,
        blunderCheck: true,
      }),
    );
    expect(result.current.coach).toBe(true);
    expect(result.current.blunderCheck).toBe(true);
  });

  it('says when the model could not choose a move, and asks it again on Retry', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 3,
        timeControlId: 'none',
        opponent: 'humanlike',
        humanRating: 1300,
      }),
    );
    maia.failures = 1;
    act(() => {
      result.current.playerNotation('e4');
    });
    await advance(10);
    expect(maia.predictions).toHaveLength(1);
    expect(result.current.humanMoveError).toBe('bad input');
    expect(result.current.humanStatus).toBe('ready');
    expect(result.current.thinking).toBe(false);
    // Nothing more happens on its own: the game waits for Retry.
    await advance(5000);
    expect(maia.predictions).toHaveLength(1);

    const loads = maia.loads;
    act(() => result.current.retryHuman());
    expect(result.current.humanMoveError).toBeNull();
    await advance(2000);
    expect(maia.predictions).toHaveLength(2);
    expect(result.current.game.position.history.map((m) => m.san)).toEqual(['e4', 'c5']);
    // The model itself was fine: it was not loaded again.
    expect(maia.loads).toBe(loads);
  });

  it('loads the model again when it is stopped mid-game', async () => {
    maia.favourite = 'e2e4';
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'black',
        levelId: 3,
        timeControlId: 'none',
        opponent: 'humanlike',
        humanRating: 1300,
      }),
    );
    expect(maia.loads).toBe(1);
    // Its files deleted in another tab, say: the client is stopped and starts again.
    act(() => maia.setStatus('idle'));
    expect(maia.loads).toBe(2);
    await advance(2000);
    // The move asked for before the stop is dropped; the one asked for after it is played.
    expect(result.current.game.position.history.map((m) => m.san)).toEqual(['e4']);
  });

  it('says when the model failed, and loads it again on Retry', () => {
    maia.status = 'failed';
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 3,
        timeControlId: 'none',
        opponent: 'humanlike',
        humanRating: 1200,
      }),
    );
    expect(result.current.humanStatus).toBe('failed');
    expect(result.current.humanError).toBe('boom');
    const before = maia.loads;
    act(() => result.current.retryHuman());
    expect(maia.loads).toBe(before + 1);
  });
});

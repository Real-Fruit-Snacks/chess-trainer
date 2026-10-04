import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fen } from '@/chess/types';
import { useProgress } from '@/store/progress';
import type { EndgameDrill } from './endgameDrills';

/**
 * A scripted engine. It replies with `fake.move` when that is legal (otherwise
 * the first legal move) and reports `fake.score` in centipawns for the side to
 * move, which in a drill is the engine's side.
 */
const fake = vi.hoisted(() => ({
  move: null as string | null,
  score: -600,
  searches: [] as { fen: string; moves: string[]; depth: number }[],
}));

vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const client = {
    init: () => Promise.resolve(),
    newGame: () => Promise.resolve(),
    setOption: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: { fen: string; moves?: string[]; depth: number }) => {
      fake.searches.push({ fen: params.fen, moves: params.moves ?? [], depth: params.depth });
      const chess = new Chess(params.fen);
      for (const m of params.moves ?? []) {
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
      const legal = chess.moves({ verbose: true }).map((m) => m.lan);
      const move = fake.move && legal.includes(fake.move) ? fake.move : (legal[0] ?? null);
      return {
        id: fake.searches.length,
        stop: () => undefined,
        result: Promise.resolve({
          stopped: false,
          bestmove: { move },
          lines: new Map([[1, { score: { type: 'cp', value: fake.score }, pv: [] }]]),
        }),
      };
    },
  };
  return {
    useEngine: () => ({
      engine: () => client,
      status: 'ready',
      error: null,
      start: () => Promise.resolve(),
    }),
  };
});

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

import { drillScore, useDrillGame } from './useDrillGame';

/** King and rook against king, White to move: Ra8 is mate at once. */
const MATE_IN_ONE: Fen = '6k1/8/6K1/8/8/8/8/R7 w - - 0 1';
/** King and queen against king, far from a mate. */
const QUEEN_ENDING: Fen = '8/8/3k4/8/8/8/8/3QK3 w - - 0 1';

function drill(overrides: Partial<EndgameDrill>): EndgameDrill {
  return {
    id: 'test-drill',
    title: 'Test drill',
    group: 'Checkmates',
    description: 'A drill for the tests.',
    goal: 'mate',
    color: 'white',
    positions: [QUEEN_ENDING],
    tip: 'No tip.',
    moveLimit: 30,
    difficulty: 1,
    ...overrides,
  };
}

/** Waits until the engine has replied and it is the user's move again. */
async function engineReplied(result: { current: ReturnType<typeof useDrillGame> }) {
  await vi.waitFor(
    () => {
      expect(result.current.thinking).toBe(false);
      expect(result.current.game.position.turn).toBe('white');
    },
    { timeout: 3000 },
  );
}

describe('useDrillGame', () => {
  beforeEach(() => {
    fake.move = null;
    fake.score = -600;
    fake.searches = [];
    useProgress.getState().resetAll();
  });
  afterEach(() => vi.restoreAllMocks());

  it('mates in one, records the drill with its score and stops there', () => {
    const { result } = renderHook(() => useDrillGame());
    const mateDrill = drill({ positions: [MATE_IN_ONE] });
    act(() => result.current.start(mateDrill, MATE_IN_ONE));
    expect(result.current.phase).toBe('playing');
    act(() => result.current.playerMove('a1', 'a8'));
    expect(result.current.phase).toBe('won');
    expect(result.current.result).toEqual({
      outcome: 'won',
      reason: 'Checkmate!',
      moves: 1,
      score: drillScore(mateDrill, 1, true),
    });
    expect(useProgress.getState().drills['test-drill']).toMatchObject({
      best: 99,
      attempts: 1,
      detail: 'Done in 1 move',
    });
    // The finished drill takes no more moves.
    act(() => result.current.playerMove('g6', 'f6'));
    expect(result.current.game.position.history).toHaveLength(1);
  });

  it('the engine replies with the whole game so far, and hands the move back', async () => {
    const { result } = renderHook(() => useDrillGame());
    act(() => result.current.start(drill({}), QUEEN_ENDING));
    act(() => result.current.playerMove('d1', 'd4'));
    await engineReplied(result);
    expect(result.current.phase).toBe('playing');
    expect(result.current.game.position.history).toHaveLength(2);
    expect(fake.searches.at(-1)).toMatchObject({ fen: QUEEN_ENDING, moves: ['d1d4'] });
    expect(result.current.userMoves).toBe(1);
  });

  it('a won position the engine now holds as a draw ends a winning drill', async () => {
    const { result } = renderHook(() => useDrillGame());
    act(() => result.current.start(drill({}), QUEEN_ENDING));
    fake.score = 5;
    act(() => result.current.playerMove('d1', 'd4'));
    await vi.waitFor(() => expect(result.current.phase).toBe('lost'));
    expect(result.current.result?.reason).toBe(
      'The engine now holds a draw — the win slipped away.',
    );
    expect(useProgress.getState().drills['test-drill']).toMatchObject({ best: 0, attempts: 1 });
  });

  it('a holding drill is lost once the engine sees a clear win, and won at the move limit', async () => {
    const hold = drill({ goal: 'hold', group: 'Rook endgames', moveLimit: 5 });
    const { result } = renderHook(() => useDrillGame());

    // A clearly lost score for the defender: the draw is gone.
    act(() => result.current.start(hold, QUEEN_ENDING));
    fake.score = 500;
    act(() => result.current.playerMove('d1', 'd4'));
    await vi.waitFor(() => expect(result.current.phase).toBe('lost'));
    expect(result.current.result?.reason).toBe(
      'That let the win through — the engine now sees a winning line.',
    );

    // A restart goes back to the same position.
    act(() => result.current.restart());
    expect(result.current.phase).toBe('playing');
    expect(result.current.game.position.fen).toBe(QUEEN_ENDING);

    // Held for the whole limit: a win, scored 100.
    fake.score = 0;
    act(() => result.current.start({ ...hold, moveLimit: 1 }, QUEEN_ENDING));
    act(() => result.current.playerMove('d1', 'd4'));
    await vi.waitFor(() => expect(result.current.phase).toBe('won'));
    expect(result.current.result).toMatchObject({
      reason: 'You held the draw for 1 moves.',
      score: 100,
    });
  });

  it('a mating drill past its move limit is lost', async () => {
    const { result } = renderHook(() => useDrillGame());
    act(() => result.current.start(drill({ moveLimit: 1 }), QUEEN_ENDING));
    act(() => result.current.playerMove('d1', 'd4'));
    await vi.waitFor(() => expect(result.current.phase).toBe('lost'));
    expect(result.current.result?.reason).toBe('Move limit reached (1). Look for a faster plan.');
  });

  it('a hint draws the engine’s move as an arrow, and giving up loses the drill', async () => {
    const { result } = renderHook(() => useDrillGame());
    act(() => result.current.start(drill({}), QUEEN_ENDING));
    fake.move = 'd1d5';
    act(() => result.current.hint());
    await vi.waitFor(() => expect(result.current.hinting).toBe(false));
    expect(result.current.hintShapes).toEqual([{ orig: 'd1', dest: 'd5', brush: 'paleBlue' }]);
    expect(fake.searches.at(-1)?.depth).toBe(18);
    // Playing a move clears the arrow.
    act(() => result.current.playerMove('d1', 'd4'));
    expect(result.current.hintShapes).toEqual([]);
    await engineReplied(result);

    act(() => result.current.giveUp());
    expect(result.current.phase).toBe('lost');
    expect(result.current.result?.reason).toMatch(/^Given up/);
  });
});

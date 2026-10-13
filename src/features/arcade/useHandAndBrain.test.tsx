import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A scripted engine. An open search answers `fake.best` when it is legal
 * (otherwise the first legal move) with `fake.score`; a search limited to some
 * moves (`searchmoves`, the partner playing the Brain's piece) answers the
 * first of them with `fake.limitedScore`. Scores are for the side to move.
 */
const fake = vi.hoisted(() => ({
  best: null as string | null,
  score: 30,
  limitedScore: -20,
  searches: [] as { moves: string[]; searchmoves?: string[] }[],
}));

vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const client = {
    init: () => Promise.resolve(),
    newGame: () => Promise.resolve(),
    setOption: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: { fen: string; moves?: string[]; searchmoves?: string[] }) => {
      fake.searches.push({ moves: params.moves ?? [], searchmoves: params.searchmoves });
      const chess = new Chess(params.fen);
      for (const m of params.moves ?? []) {
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
      const legal = chess.moves({ verbose: true }).map((m) => m.lan);
      const limited = params.searchmoves?.length ? params.searchmoves : null;
      const move = limited
        ? (limited[0] ?? null)
        : fake.best && legal.includes(fake.best)
          ? fake.best
          : (legal[0] ?? null);
      const value = limited ? fake.limitedScore : fake.score;
      return {
        id: fake.searches.length,
        stop: () => undefined,
        result: Promise.resolve({
          stopped: false,
          bestmove: { move },
          lines: new Map([[1, { score: { type: 'cp', value }, pv: move ? [move] : [] }]]),
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

vi.mock('@/lib/sound', () => ({
  playSound: vi.fn(),
  playMoveSound: vi.fn(),
  gameEndSound: () => 'gameEnd',
}));

import { useHandAndBrain } from './useHandAndBrain';

interface Hook {
  current: ReturnType<typeof useHandAndBrain>;
}

/** Waits for the opponent's reply and the partner's look at the new position. */
async function playerToMove(result: Hook, plies: number) {
  await vi.waitFor(
    () => {
      expect(result.current.game.position.history).toHaveLength(plies);
      expect(result.current.busy).toBeNull();
    },
    { timeout: 3000 },
  );
}

describe('useHandAndBrain', () => {
  beforeEach(() => {
    fake.best = null;
    fake.score = 30;
    fake.limitedScore = -20;
    fake.searches = [];
    // The weakest levels play a random move now and then: never in these tests.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Brain: calling the best move’s piece plays it at no cost, and the opponent replies', async () => {
    fake.best = 'e2e4';
    const { result } = renderHook(() => useHandAndBrain());
    act(() => result.current.start({ role: 'brain', color: 'white', levelId: 1 }));
    await vi.waitFor(() => expect(result.current.brainReady).toBe(true));
    expect(result.current.options).toEqual(expect.arrayContaining(['p', 'n']));

    act(() => result.current.callPiece('p'));
    expect(result.current.calls).toEqual([
      { ply: 1, type: 'p', san: 'e4', bestSan: 'e4', bestType: 'p', lossCp: 0, grade: 'best' },
    ]);
    await playerToMove(result, 2);
    await vi.waitFor(() => expect(result.current.brainReady).toBe(true));
  });

  it('Brain: another piece is played as well as the partner can, and graded by the loss', async () => {
    fake.best = 'e2e4';
    const { result } = renderHook(() => useHandAndBrain());
    act(() => result.current.start({ role: 'brain', color: 'white', levelId: 1 }));
    await vi.waitFor(() => expect(result.current.brainReady).toBe(true));

    act(() => result.current.callPiece('n'));
    await vi.waitFor(() => expect(result.current.calls).toHaveLength(1));
    const limited = fake.searches.find((s) => s.searchmoves);
    expect(limited?.searchmoves?.sort()).toEqual(['b1a3', 'b1c3', 'g1f3', 'g1h3']);
    expect(result.current.calls[0]).toMatchObject({
      type: 'n',
      bestSan: 'e4',
      bestType: 'p',
      lossCp: 50, // 30 for the best move against −20 for the best knight move
      grade: 'inaccuracy',
    });
    // A piece with no legal move is not a call.
    await playerToMove(result, 2);
    await vi.waitFor(() => expect(result.current.brainReady).toBe(true));
    act(() => result.current.callPiece('k'));
    expect(result.current.calls).toHaveLength(1);
  });

  it('Hand: only the called piece moves; the best move costs nothing, another is graded', async () => {
    fake.best = 'g1f3';
    const { result } = renderHook(() => useHandAndBrain());
    act(() => result.current.start({ role: 'hand', color: 'white', levelId: 1 }));
    await vi.waitFor(() => expect(result.current.handCall?.type).toBe('n'));
    expect([...result.current.dests.keys()].sort()).toEqual(['b1', 'g1']);

    // A pawn is not the called piece: nothing happens.
    act(() => result.current.playerMove('e2', 'e4'));
    expect(result.current.game.position.history).toHaveLength(0);

    // Next call: the partner will want Nc3 (the opponent cannot play it, so it plays its own move).
    fake.best = 'b1c3';
    act(() => result.current.playerMove('g1', 'f3'));
    expect(result.current.calls[0]).toMatchObject({ san: 'Nf3', lossCp: 0, grade: 'best' });
    expect(result.current.handCall).toBeNull();
    await playerToMove(result, 2);

    // The Hand plays Na3 instead, which the partner then judges.
    await vi.waitFor(() => expect(result.current.handCall?.best).toBe('b1c3'));
    const searchesBefore = fake.searches.length;
    act(() => result.current.playerMove('b1', 'a3'));
    await vi.waitFor(() => expect(result.current.calls).toHaveLength(2));
    expect(fake.searches.length).toBeGreaterThan(searchesBefore);
    // Best 30 for White; after Na3 the opponent's search says +30 for Black, so −30: a 60 loss.
    expect(result.current.calls[1]).toMatchObject({
      san: 'Na3',
      bestSan: 'Nc3',
      lossCp: 60,
      grade: 'inaccuracy',
    });
  });

  it('resigning ends the game as a loss, and the PGN says which role was played', async () => {
    const { result } = renderHook(() => useHandAndBrain());
    act(() => result.current.start({ role: 'brain', color: 'black', levelId: 1 }));
    await playerToMove(result, 1);
    act(() => result.current.resign());
    expect(result.current.gameOver).toEqual({
      result: '1-0',
      reason: 'resignation',
      verdict: 'loss',
    });
    const pgn = result.current.pgn();
    expect(pgn).toMatch(/\[Event "[^"]*Hand & Brain · Brain"\]/);
    expect(pgn).toContain('[Result "1-0"]');
    // Nothing more is called once the game is over.
    act(() => result.current.callPiece('p'));
    expect(result.current.calls).toHaveLength(0);
  });
});

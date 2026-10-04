import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FortressModule from './fortress';

/**
 * A scripted engine: the move is always the first legal one and the score is
 * whatever the test sets (centipawns for the side to move). A held search
 * waits for the test to release it.
 */
interface FakeEngine {
  score: number;
  hold: boolean;
  release: ((score: number) => void) | null;
  searches: number;
}
const fake: FakeEngine = vi.hoisted(() => ({ score: 0, hold: false, release: null, searches: 0 }));

vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const answer = (move: string | null, score: number) => ({
    stopped: false,
    bestmove: { move },
    lines: new Map([[1, { score: { type: 'cp', value: score }, pv: move ? [move] : [] }]]),
  });
  const client = {
    init: () => Promise.resolve(),
    newGame: () => Promise.resolve(),
    setOption: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: { fen: string; moves?: string[] }) => {
      fake.searches += 1;
      const chess = new Chess(params.fen);
      for (const m of params.moves ?? []) {
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
      const move = chess.moves({ verbose: true }).find((m) => !m.promotion)?.lan ?? null;
      const result = fake.hold
        ? new Promise((resolve) => {
            fake.release = (score) => resolve(answer(move, score));
          })
        : Promise.resolve(answer(move, fake.score));
      return { id: fake.searches, stop: () => undefined, result };
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

// Two moves to hold instead of twenty: the same rules, a shorter test.
vi.mock('./fortress', async (importOriginal) => ({
  ...(await importOriginal<typeof FortressModule>()),
  HOLD_MOVES: 2,
}));

import { useFortress } from './useFortress';

interface Hook {
  current: ReturnType<typeof useFortress>;
}

/** The player's first legal (non-promotion) move in the current position. */
function playAnyMove(result: Hook) {
  const move = result.current.game
    .chess()
    .moves({ verbose: true })
    .find((m) => !m.promotion);
  if (!move) throw new Error('no move');
  act(() => result.current.playerMove(move.from, move.to));
}

/** Waits for the held grading search to be under way, then answers it with `score`. */
async function answerHeldSearch(score: number) {
  await vi.waitFor(() => expect(fake.release).not.toBeNull());
  await act(async () => {
    fake.release?.(score);
    await Promise.resolve();
  });
}

/** Waits for the attacker's reply (and its grading) to come in. */
async function attackerReplies(result: Hook) {
  await vi.waitFor(
    () => {
      expect(result.current.busy).toBeNull();
      expect(result.current.game.position.turn).toBe(result.current.playerColor);
    },
    { timeout: 3000 },
  );
}

describe('useFortress: the last move is graded before it counts', () => {
  beforeEach(() => {
    fake.score = 0;
    fake.hold = false;
    fake.release = null;
    fake.searches = 0;
    // No random moves from the weak levels, and the same position every time.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a final move that throws the position away collapses it instead of holding it', async () => {
    const { result } = renderHook(() => useFortress());
    act(() => result.current.startRun(1));
    expect(result.current.phase).toBe('playing');
    playAnyMove(result);
    await attackerReplies(result);
    expect(result.current.movesMade).toBe(1);

    // The second (last) move: graded before anything is awarded.
    fake.hold = true;
    playAnyMove(result);
    expect(result.current.movesMade).toBe(2);
    expect(result.current.busy).toBe('grading');
    expect(result.current.phase).toBe('playing');
    expect(result.current.held).toBe(0);
    // The attacker is to move and stands 9 pawns better: the defender's -900.
    await answerHeldSearch(900);
    await vi.waitFor(() => expect(result.current.phase).toBe('fallen'));
    expect(result.current.outcome).toBe('collapsed');
    expect(result.current.held).toBe(0);
    expect(result.current.lives).toBe(2);
    expect(result.current.cp).toBe(-900);
  });

  it('a final move that keeps the position playable holds it', async () => {
    const { result } = renderHook(() => useFortress());
    act(() => result.current.startRun(1));
    playAnyMove(result);
    await attackerReplies(result);
    fake.hold = true;
    playAnyMove(result);
    await answerHeldSearch(150);
    await vi.waitFor(() => expect(result.current.phase).toBe('held'));
    expect(result.current.outcome).toBe('survived');
    expect(result.current.held).toBe(1);
    expect(result.current.lives).toBe(3);
    // The game so far can go to the analysis board, with its starting position.
    expect(result.current.pgn()).toContain('[FEN "');
    expect(result.current.pgn()).toContain('[Event "Chess Trainer — Fortress"]');
  });
});

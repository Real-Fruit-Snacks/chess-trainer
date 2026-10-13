import { act, renderHook, waitFor } from '@testing-library/react';
import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameTree } from '@/chess/tree';
import type { LongColor } from '@/chess/types';
import type { SearchParams, SearchResult } from '@/engine/EngineClient';
import type * as SoundModule from '@/lib/sound';
import { useSettings } from '@/store/settings';
import { reviewOf } from '@/test/fakeReview';
import type { ReviewSummary } from './gameReview';
import type { UseAnalysis } from './useAnalysis';
import { useFixMistakes } from './useFixMistakes';

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playMoveSound: vi.fn() };
});

const SANS = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Nc3', 'Nxh5'];
/** White ("you") played 2. Bc4 (Nf3 was better) and 4. Nc3?? missing Qxf7#. */
const REVIEW = reviewOf(SANS, {
  3: { judgement: 'inaccuracy', best: 'g1f3' },
  6: { judgement: 'blunder', best: 'd8e7' },
  7: { judgement: 'blunder', best: 'h5f7' },
});

/** Centipawns the scripted engine gives each move, for the side to move. */
let scores: Record<string, number> = {};
const searches: SearchParams[] = [];
const engine = {
  search: (params: SearchParams) => {
    searches.push(params);
    const lines = new Map(
      (params.searchmoves ?? []).map((uci, i) => [
        i + 1,
        {
          depth: 14,
          multipv: i + 1,
          score: { type: 'cp' as const, value: scores[uci] ?? 0 },
          pv: [uci],
        },
      ]),
    );
    const result: SearchResult = { bestmove: { move: null }, lines, stopped: false };
    return { id: searches.length, result: Promise.resolve(result), stop: () => undefined };
  },
};

function setup(review: ReviewSummary | null = REVIEW, sans = SANS) {
  const tree = GameTree.fromPgn(sans.join(' '));
  tree.goEnd();
  const setEngineOn = vi.fn();
  const goTo = vi.fn();
  const setOrientation = vi.fn<(color: LongColor) => void>();
  const analysisOf = (r: ReviewSummary | null, t: GameTree) =>
    ({
      tree: t,
      review: r,
      current: t.current,
      engineOn: true,
      setEngineOn,
      goTo,
      engine: () => engine,
    }) as unknown as UseAnalysis;
  const view = { orientation: 'black' as LongColor, setOrientation };
  const hook = renderHook(({ r, t }) => useFixMistakes(analysisOf(r, t), view), {
    initialProps: { r: review, t: tree },
  });
  return { hook, tree, setEngineOn, goTo, setOrientation };
}

const fenBefore = (ply: number) => {
  const chess = new Chess();
  for (const san of SANS.slice(0, ply - 1)) chess.move(san);
  return chess.fen();
};

beforeEach(() => {
  scores = {};
  searches.length = 0;
  useSettings.setState({ autoQueen: false });
});

afterEach(() => vi.clearAllMocks());

describe('useFixMistakes', () => {
  it('sets the board to the position before the first mistake, engine paused, from the learner’s side', () => {
    const { hook, setEngineOn, setOrientation } = setup();
    act(() => hook.result.current.start('white'));
    const fix = hook.result.current;
    expect(fix.phase).toBe('asking');
    expect(fix.steps.map((s) => s.san)).toEqual(['Bc4', 'Nc3']);
    expect(fix.step?.san).toBe('Bc4');
    expect(setEngineOn).toHaveBeenCalledWith(false);
    expect(setOrientation).toHaveBeenCalledWith('white');
    expect(fix.board).toMatchObject({
      fen: fenBefore(3),
      turn: 'white',
      movable: 'white',
      lastMove: ['e7', 'e5'],
      shapes: [],
    });
    expect(fix.board?.dests.get('g1')).toEqual(['e2', 'f3', 'h3']);
  });

  it('turns the move played away, checks another with the engine, and takes the engine’s own at once', async () => {
    const { hook } = setup();
    act(() => hook.result.current.start('white'));
    act(() => hook.result.current.play('f1', 'c4'));
    expect(hook.result.current.phase).toBe('asking');
    expect(hook.result.current.feedback).toEqual({
      tone: 'warning',
      text: 'Bc4 is the move you played in the game. Find a better one.',
    });
    expect(hook.result.current.board?.shapes).toEqual([{ orig: 'f1', dest: 'c4', brush: 'red' }]);

    // Another move: on the board while the engine compares it with Nf3, then taken back.
    scores = { g1f3: 60, a2a3: -40 };
    act(() => hook.result.current.play('a2', 'a3'));
    expect(hook.result.current.phase).toBe('checking');
    expect(hook.result.current.board?.movable).toBeUndefined();
    await waitFor(() => expect(hook.result.current.phase).toBe('asking'));
    expect(searches[0]).toMatchObject({ fen: fenBefore(3), searchmoves: ['g1f3', 'a2a3'] });
    expect(hook.result.current.feedback?.text).toBe(
      'a3 is not good enough here. Try another move.',
    );

    act(() => hook.result.current.play('g1', 'f3'));
    expect(hook.result.current.phase).toBe('found');
    expect(hook.result.current.feedback).toEqual({
      tone: 'success',
      text: 'Yes: Nf3 is the engine’s move.',
    });
    expect(hook.result.current.results).toEqual([{ ply: 3, outcome: 'retry', found: 'Nf3' }]);
    expect(hook.result.current.board?.lastMove).toEqual(['g1', 'f3']);
    expect(searches).toHaveLength(1);
  });

  it('accepts a move as good as the engine’s, shows the move on request, and sums up', async () => {
    const { hook } = setup();
    act(() => hook.result.current.start('white'));
    scores = { g1f3: 50, b1c3: 45 };
    act(() => {
      expect(hook.result.current.playNotation('Nc3')).toBe(true);
    });
    await waitFor(() => expect(hook.result.current.phase).toBe('found'));
    expect(hook.result.current.feedback?.text).toBe(
      'Yes: Nc3 is as good as the engine’s move, Nf3.',
    );
    expect(hook.result.current.answer).toEqual({ san: 'Nc3', uci: 'b1c3' });

    act(() => hook.result.current.next());
    expect(hook.result.current.step?.san).toBe('Nc3');
    expect(hook.result.current.board?.fen).toBe(fenBefore(7));
    expect(hook.result.current.playNotation('Kxe8')).toBe(false);
    act(() => hook.result.current.show());
    expect(hook.result.current.phase).toBe('shown');
    expect(hook.result.current.feedback?.text).toBe('The move was Qxf7#.');
    expect(hook.result.current.board?.lastMove).toEqual(['h5', 'f7']);

    act(() => hook.result.current.next());
    expect(hook.result.current.phase).toBe('summary');
    expect(hook.result.current.results).toEqual([
      { ply: 3, outcome: 'first', found: 'Nc3' },
      { ply: 7, outcome: 'shown', found: null },
    ]);

    // Once more, only the one that was shown.
    act(() => hook.result.current.retryMissed());
    expect(hook.result.current.steps.map((s) => s.san)).toEqual(['Nc3']);
    act(() => hook.result.current.play('h5', 'f7'));
    expect(hook.result.current.results).toEqual([{ ply: 7, outcome: 'first', found: 'Qxf7#' }]);
  });

  it('asks which piece a promotion makes, unless queens are automatic', () => {
    const sans = ['e4', 'f5', 'exf5', 'g6', 'fxg6', 'Nf6', 'gxh7', 'Rg8', 'h8=Q'];
    const promotion = reviewOf(sans, { 9: { judgement: 'mistake', best: 'h7g8q' } });
    const { hook } = setup(promotion, sans);
    act(() => hook.result.current.start('white'));
    expect(hook.result.current.board?.lastMove).toEqual(['h8', 'g8']);
    act(() => hook.result.current.play('h7', 'g8'));
    expect(hook.result.current.pendingPromotion).toEqual({ from: 'h7', to: 'g8', color: 'white' });
    expect(hook.result.current.phase).toBe('asking');
    act(() => hook.result.current.resolvePromotion('q'));
    expect(hook.result.current.phase).toBe('found');
    expect(hook.result.current.answer).toEqual({ san: 'hxg8=Q', uci: 'h7g8q' });

    useSettings.setState({ autoQueen: true });
    act(() => hook.result.current.retryMissed());
    act(() => hook.result.current.leave());
    act(() => hook.result.current.start('white'));
    act(() => hook.result.current.play('h7', 'g8'));
    expect(hook.result.current.pendingPromotion).toBeNull();
    expect(hook.result.current.phase).toBe('found');
  });

  it('puts the board, the engine and the orientation back on leaving', () => {
    const { hook, tree, setEngineOn, setOrientation, goTo } = setup();
    act(() => hook.result.current.start('white'));
    act(() => hook.result.current.leave());
    expect(hook.result.current.phase).toBe('off');
    expect(hook.result.current.board).toBeNull();
    expect(setEngineOn).toHaveBeenLastCalledWith(true);
    expect(setOrientation).toHaveBeenLastCalledWith('black');
    expect(goTo).toHaveBeenCalledWith(tree.current);
  });

  it('ends when the review goes (the main line changed)', () => {
    const { hook, tree, setEngineOn, setOrientation, goTo } = setup();
    act(() => hook.result.current.start('white'));
    hook.rerender({ r: null, t: tree });
    expect(hook.result.current.phase).toBe('off');
    expect(setEngineOn).toHaveBeenLastCalledWith(true);
    // The same game: the board goes back to where it was.
    expect(setOrientation).toHaveBeenLastCalledWith('black');
    expect(goTo).toHaveBeenCalled();
  });

  it('leaves a game loaded meanwhile the way it opened', () => {
    const { hook, setOrientation, goTo } = setup();
    act(() => hook.result.current.start('white'));
    setOrientation.mockClear();
    hook.rerender({ r: null, t: GameTree.fromPgn('1. d4 d5 *') });
    expect(hook.result.current.phase).toBe('off');
    expect(setOrientation).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
  });

  it('has nothing to do for a side without mistakes or without a review', () => {
    const clean = reviewOf(SANS, { 6: { judgement: 'blunder', best: 'd8e7' } });
    const { hook, setEngineOn } = setup(clean);
    act(() => hook.result.current.start('white'));
    expect(hook.result.current.phase).toBe('off');
    expect(setEngineOn).not.toHaveBeenCalled();
  });
});

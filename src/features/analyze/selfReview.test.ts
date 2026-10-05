import { describe, expect, it } from 'vitest';
import type { MoveJudgement } from '@/components/chess/MoveList';
import type { SearchInfo } from '@/engine/uci';
import type { ReviewedMove, ReviewSummary } from './gameReview';
import {
  engineMoveOf,
  judgeSuggestion,
  scoreSelfReview,
  SUGGESTION_DEPTH,
  suggestionVerdict,
} from './selfReview';

function reviewOf(moves: [san: string, judgement: MoveJudgement, best?: string][]): ReviewSummary {
  return {
    moves: moves.map(([san, judgement, best], i): ReviewedMove => ({
      ply: i + 1,
      san,
      mover: i % 2 === 0 ? 'white' : 'black',
      winBefore: 0.5,
      winAfter: 0.5,
      loss: judgement === 'blunder' ? 0.4 : judgement === 'mistake' ? 0.25 : 0,
      judgement,
      best: best ?? null,
      bestUci: null,
      scoreBefore: null,
      fen: '',
      scoreAfter: null,
      bestPv: [],
      replyUci: null,
      replyPv: [],
    })),
    counts: {
      white: { inaccuracy: 0, mistake: 0, blunder: 0 },
      black: { inaccuracy: 0, mistake: 0, blunder: 0 },
    },
    accuracy: { white: 90, black: 90 },
    wins: [],
    depth: 12,
  };
}

const GAME = reviewOf([
  ['e4', 'good'],
  ['e5', 'good'],
  ['Nf3', 'good'],
  ['f6', 'mistake', 'Nc6'],
  ['Nxe5', 'inaccuracy'],
  ['fxe5', 'blunder', 'Qe7'],
  ['Qh5+', 'good'],
  ['Ke7', 'good'],
]);

describe('scoreSelfReview', () => {
  it('counts exact marks as found and the move after as a late find', () => {
    const score = scoreSelfReview(GAME, [
      { ply: 4, san: 'f6' },
      { ply: 7, san: 'Qh5+' },
    ]);
    expect(score.moments.map((m) => [m.ply, m.outcome])).toEqual([
      [4, 'found'],
      [6, 'late'],
    ]);
    expect(score).toMatchObject({ found: 2, late: 1, total: 2, falseAlarms: 0 });
    expect(score.marks.map((m) => m.outcome)).toEqual(['found', 'late']);
  });

  it('tells a false alarm from a mark on an inaccuracy, and lists what was missed', () => {
    const score = scoreSelfReview(GAME, [
      { ply: 2, san: 'e5' },
      { ply: 5, san: 'Nxe5' },
    ]);
    // The mark on 3.Nxe5 is the move after 2...f6: that turning point was seen a move late.
    expect(score.moments.map((m) => m.outcome)).toEqual(['late', 'missed']);
    expect(score.marks.map((m) => [m.ply, m.outcome])).toEqual([
      [2, 'false-alarm'],
      [5, 'late'],
    ]);
    const minor = scoreSelfReview(GAME, [
      { ply: 5, san: 'Nxe5' },
      { ply: 4, san: 'f6' },
    ]);
    // Marked exactly, 2...f6 is found; the mark on the inaccuracy after it is then only minor.
    expect(minor.marks.map((m) => [m.ply, m.outcome])).toEqual([
      [4, 'found'],
      [5, 'minor'],
    ]);
    expect(minor.falseAlarms).toBe(0);
  });

  it('never spends one mark on two turning points, and drops marks the main line no longer has', () => {
    const back = reviewOf([
      ['e4', 'mistake'],
      ['e5', 'blunder'],
      ['Nf3', 'good'],
    ]);
    // A mark on 1...e5 finds 1...e5 itself; 1.e4 is not found a move late with the same mark.
    const score = scoreSelfReview(back, [{ ply: 2, san: 'e5' }]);
    expect(score.moments.map((m) => m.outcome)).toEqual(['missed', 'found']);
    expect(scoreSelfReview(back, [{ ply: 2, san: 'c5' }]).marks).toEqual([]);
  });

  it('has nothing to find in a clean game', () => {
    const clean = reviewOf([
      ['e4', 'good'],
      ['e5', 'good'],
    ]);
    expect(scoreSelfReview(clean, [])).toMatchObject({ found: 0, total: 0, falseAlarms: 0 });
    expect(scoreSelfReview(clean, [{ ply: 1, san: 'e4' }]).falseAlarms).toBe(1);
  });
});

describe('suggestions', () => {
  it('grades a suggestion by the win probability it gives up', () => {
    expect(suggestionVerdict(0.3, true)).toBe('best');
    expect(suggestionVerdict(0.01, false)).toBe('best');
    expect(suggestionVerdict(0.04, false)).toBe('good');
    expect(suggestionVerdict(0.08, false)).toBe('ok');
    expect(suggestionVerdict(0.2, false)).toBe('worse');
  });

  const engineAnswering = (cps: Record<string, number>, stopped = false) => {
    const calls: unknown[] = [];
    const engine = {
      search: (params: unknown) => {
        calls.push(params);
        const lines = new Map<number, SearchInfo>();
        Object.entries(cps).forEach(([uci, cp], i) => {
          lines.set(i + 1, {
            depth: SUGGESTION_DEPTH,
            multipv: i + 1,
            score: { type: 'cp', value: cp },
            pv: [uci],
          });
        });
        return {
          id: 1,
          stop: () => undefined,
          result: Promise.resolve({ stopped, bestmove: { move: null }, lines }),
        };
      },
    };
    return { engine, calls };
  };

  it('searches the suggestion against the engine’s move', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const { engine, calls } = engineAnswering({ c7c5: 30, a7a6: -80 });
    expect(await judgeSuggestion(engine, fen, 'a7a6', 'c7c5')).toMatchObject({
      verdict: 'worse',
      best: 'c7c5',
    });
    expect(calls[0]).toMatchObject({ fen, searchmoves: ['c7c5', 'a7a6'], multipv: 2 });
    // The engine's own move needs no search; nothing to compare with gives no verdict.
    expect(await judgeSuggestion(engine, fen, 'c7c5', 'c7c5')).toEqual({
      verdict: 'best',
      loss: 0,
      best: 'c7c5',
    });
    expect(await judgeSuggestion(engine, fen, 'c7c5', null)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('gives no verdict for a stopped search, and never a negative loss', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(await judgeSuggestion(engineAnswering({}, true).engine, fen, 'a7a6', 'c7c5')).toBeNull();
    const better = await judgeSuggestion(
      engineAnswering({ c7c5: 0, e7e5: 20 }).engine,
      fen,
      'e7e5',
      'c7c5',
    );
    expect(better).toEqual({ verdict: 'best', loss: 0, best: 'c7c5' });
  });

  it('compares with the game move when that was the engine’s choice too', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const move = { fen, san: 'c5', judgement: 'best' as const, bestUci: null };
    // The review leaves the engine's move out when it is the move played.
    expect(engineMoveOf(move)).toBe('c7c5');
    expect(engineMoveOf({ ...move, judgement: 'mistake', bestUci: 'e7e5' })).toBe('e7e5');
    // No engine move and not the engine's choice: nothing to compare with.
    expect(engineMoveOf({ ...move, judgement: 'good' })).toBeNull();
  });
});

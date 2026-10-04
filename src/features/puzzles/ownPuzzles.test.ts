import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import type { Score } from '@/engine/uci';
import {
  gameTitle,
  isAcceptableAlternative,
  isOwnPuzzleId,
  type MainLine,
  MIN_OWN_PUZZLE_GAP_CP,
  ownPuzzleFromMoment,
  ownPuzzleId,
  ownPuzzlesFromReview,
  scoreCp,
  verifyOwnPuzzleMove,
} from './ownPuzzles';

/** Scholar's mate: Black's 3...Nf6?? is the blunder; the fix is 3...g6 (or Qe7). */
function line(moves: string): MainLine {
  const chess = new Chess();
  const fens = [chess.fen()];
  const sans: string[] = [];
  for (const san of moves.split(' ')) {
    sans.push(chess.move(san).san);
    fens.push(chess.fen());
  }
  return { fens, sans };
}

const SCHOLAR = line('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#');
const META = { title: 'alice – bob, 2026.09.29', url: 'https://lichess.org/abc', rating: 1400 };

describe('ownPuzzleFromMoment', () => {
  it('builds a Lichess-style puzzle: opponent move, then the better move', () => {
    const puzzle = ownPuzzleFromMoment(
      SCHOLAR,
      { ply: 6, san: 'Nf6', mover: 'black', judgement: 'blunder', loss: 0.9, bestUci: 'g7g6' },
      META,
      123,
    );
    expect(puzzle).not.toBeNull();
    // Position before White's 3.Qh5, then that move, then the solution.
    expect(puzzle?.fen).toBe(SCHOLAR.fens[4]);
    expect(puzzle?.moves).toBe('d1h5 g7g6');
    expect(puzzle?.themes).toBe('ownGame blunder');
    expect(puzzle?.rating).toBe(1400);
    expect(puzzle?.url).toBe(META.url);
    expect(puzzle?.source).toMatchObject({ title: META.title, ply: 6, played: 'Nf6' });
    expect(puzzle?.createdAt).toBe(123);
    expect(isOwnPuzzleId(puzzle?.id ?? '')).toBe(true);
    expect(puzzle?.id).toBe(ownPuzzleId(SCHOLAR.fens[5] ?? '', 'g7g6'));
  });

  it('is deterministic per position and solution', () => {
    expect(ownPuzzleId('fen', 'e2e4')).toBe(ownPuzzleId('fen', 'e2e4'));
    expect(ownPuzzleId('fen', 'e2e4')).not.toBe(ownPuzzleId('fen', 'd2d4'));
  });

  it('refuses first moves, good moves and impossible solutions', () => {
    const first = ownPuzzleFromMoment(
      SCHOLAR,
      { ply: 1, san: 'e4', mover: 'white', judgement: 'mistake', loss: 0.3, bestUci: 'd2d4' },
      META,
    );
    expect(first).toBeNull();
    const good = ownPuzzleFromMoment(
      SCHOLAR,
      { ply: 4, san: 'Nc6', mover: 'black', judgement: 'good', loss: 0, bestUci: null },
      META,
    );
    expect(good).toBeNull();
    const illegal = ownPuzzleFromMoment(
      SCHOLAR,
      { ply: 6, san: 'Nf6', mover: 'black', judgement: 'blunder', loss: 0.9, bestUci: 'a1a8' },
      META,
    );
    expect(illegal).toBeNull();
  });

  it('needs a clear gap to the second-best move when the review measured one', () => {
    const moment = {
      ply: 6,
      san: 'Nf6',
      mover: 'black' as const,
      judgement: 'blunder' as const,
      loss: 0.9,
      bestUci: 'g7g6',
    };
    // g6 and Qe7 both parry the mate: no single answer, no puzzle.
    expect(ownPuzzleFromMoment(SCHOLAR, { ...moment, bestGapCp: 20 }, META)).toBeNull();
    expect(
      ownPuzzleFromMoment(SCHOLAR, { ...moment, bestGapCp: MIN_OWN_PUZZLE_GAP_CP }, META),
    ).toMatchObject({ verified: true });
    // Without a measurement the puzzle is made, and the trainer checks alternatives later.
    expect(ownPuzzleFromMoment(SCHOLAR, moment, META)).toMatchObject({ verified: false });
    expect(ownPuzzleFromMoment(SCHOLAR, { ...moment, bestGapCp: null }, META)).toMatchObject({
      verified: false,
    });
  });
});

describe('verifyOwnPuzzleMove', () => {
  const fen = SCHOLAR.fens[5] ?? '';
  const engineWith = (lines: { pv: string[]; score: Score }[], bestmove = lines[0]?.pv[0]) => ({
    search: vi.fn(() => ({
      id: 1,
      stop: () => undefined,
      result: Promise.resolve({
        bestmove: { move: bestmove ?? null },
        lines: new Map(lines.map((l, i) => [i + 1, { depth: 12, multipv: i + 1, ...l }])),
        stopped: false,
      }),
    })),
  });

  it('accepts a move within 50 cp of the best and rejects a clearly worse one', async () => {
    const close = engineWith([
      { pv: ['g7g6'], score: { type: 'cp', value: -30 } },
      { pv: ['d8e7'], score: { type: 'cp', value: -70 } },
    ]);
    expect(await verifyOwnPuzzleMove(close, fen, 'g7g6', 'd8e7')).toBe(true);
    expect(close.search).toHaveBeenCalledWith(
      expect.objectContaining({ fen, depth: 12, multipv: 2, searchmoves: ['g7g6', 'd8e7'] }),
    );
    const worse = engineWith([
      { pv: ['g7g6'], score: { type: 'cp', value: -30 } },
      { pv: ['g8f6'], score: { type: 'mate', value: -1 } },
    ]);
    expect(await verifyOwnPuzzleMove(worse, fen, 'g7g6', 'g8f6')).toBe(false);
  });

  it('accepts the played move when the engine ranks it first, and fails safe otherwise', async () => {
    const better = engineWith([
      { pv: ['d8e7'], score: { type: 'cp', value: -20 } },
      { pv: ['g7g6'], score: { type: 'cp', value: -30 } },
    ]);
    expect(await verifyOwnPuzzleMove(better, fen, 'g7g6', 'd8e7')).toBe(true);
    const onlyBest = engineWith([{ pv: ['g7g6'], score: { type: 'cp', value: -30 } }]);
    expect(await verifyOwnPuzzleMove(onlyBest, fen, 'g7g6', 'd8e7')).toBe(false);
    expect(isAcceptableAlternative(100, 50)).toBe(true);
    expect(isAcceptableAlternative(100, 49)).toBe(false);
    expect(scoreCp({ type: 'mate', value: 2 })).toBeGreaterThan(
      scoreCp({ type: 'cp', value: 900 }),
    );
    expect(scoreCp({ type: 'mate', value: -1 })).toBeLessThan(scoreCp({ type: 'cp', value: -900 }));
  });
});

describe('ownPuzzlesFromReview', () => {
  const review = {
    moves: [
      {
        ply: 2,
        san: 'e5',
        mover: 'black' as const,
        judgement: 'inaccuracy' as const,
        loss: 0.12,
        bestUci: 'c7c5',
      },
      {
        ply: 4,
        san: 'Nc6',
        mover: 'black' as const,
        judgement: 'good' as const,
        loss: 0,
        bestUci: null,
      },
      {
        ply: 6,
        san: 'Nf6',
        mover: 'black' as const,
        judgement: 'blunder' as const,
        loss: 0.9,
        bestUci: 'g7g6',
      },
      {
        ply: 5,
        san: 'Qh5',
        mover: 'white' as const,
        judgement: 'mistake' as const,
        loss: 0.25,
        bestUci: 'g1f3',
      },
    ],
  };

  it('keeps mistakes and blunders, biggest swing first, optionally one side', () => {
    const all = ownPuzzlesFromReview(SCHOLAR, review, META);
    expect(all.map((p) => p.source.ply)).toEqual([6, 5]);
    const black = ownPuzzlesFromReview(SCHOLAR, review, META, { side: 'black' });
    expect(black.map((p) => p.source.ply)).toEqual([6]);
    const withInaccuracies = ownPuzzlesFromReview(SCHOLAR, review, META, {
      includeInaccuracies: true,
    });
    expect(withInaccuracies.map((p) => p.source.ply)).toEqual([6, 5, 2]);
  });
});

describe('gameTitle', () => {
  it('prefers players and date, falls back to the event', () => {
    expect(gameTitle({ White: 'alice', Black: 'bob', Date: '2026.09.29' })).toBe(
      'alice – bob, 2026.09.29',
    );
    expect(gameTitle({ White: 'alice', Black: 'bob', Date: '????.??.??' })).toBe('alice – bob');
    expect(gameTitle({ Event: 'Club championship' })).toBe('Club championship');
    expect(gameTitle({})).toBe('Analysed game');
  });
});

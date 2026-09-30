import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  gameTitle,
  isOwnPuzzleId,
  type MainLine,
  ownPuzzleFromMoment,
  ownPuzzleId,
  ownPuzzlesFromReview,
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

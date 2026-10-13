import { describe, expect, it } from 'vitest';
import { chess960StartFen } from '@/chess/chess960';
import { START_FEN } from '@/chess/helpers';
import { checkStartPosition } from './startPosition';

describe('checkStartPosition', () => {
  it('accepts a playable position and normalises it', () => {
    expect(checkStartPosition(null)).toEqual({ fen: null, problem: null, chess960: false });
    expect(checkStartPosition(START_FEN)).toEqual({
      fen: START_FEN,
      problem: null,
      chess960: false,
    });
    expect(checkStartPosition('6k1/5ppp/8/8/8/8/8/Q5K1 w').fen).toBe(
      '6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1',
    );
  });

  it('refuses garbage, a side in check that is not to move, and a finished game', () => {
    expect(checkStartPosition('not a fen').problem).toMatch(/not a valid FEN/);
    expect(checkStartPosition('4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1').problem).toMatch(
      /Black is in check but it is not their move/,
    );
    expect(checkStartPosition('4k3/8/8/8/8/8/8/4K3 w - - 0 1').problem).toMatch(/already over/);
    expect(checkStartPosition('Q5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1').problem).toMatch(
      /already over \(checkmate\)/,
    );
  });

  it('keeps a Chess960 position whole: asked for, or one only Chess960 has', () => {
    const start = chess960StartFen(274);
    expect(checkStartPosition(start)).toEqual({ fen: start, problem: null, chess960: true });
    // Castling rights by file are written back as X-FEN.
    expect(checkStartPosition('bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w GCgc - 0 1').fen).toBe(
      start,
    );
    // The classical position, played as Chess960 when asked.
    expect(checkStartPosition(START_FEN, { chess960: true })).toEqual({
      fen: START_FEN,
      problem: null,
      chess960: true,
    });
    expect(
      checkStartPosition('Q5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1', { chess960: true }),
    ).toMatchObject({ fen: null, chess960: true });
    expect(checkStartPosition('nonsense', { chess960: true }).problem).toMatch(/not a valid FEN/);
  });
});

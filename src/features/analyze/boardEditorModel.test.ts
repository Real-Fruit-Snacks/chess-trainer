import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { availableCastling, parseBoard, toFen, validatePosition } from './boardEditorModel';

describe('board editor model', () => {
  it('round-trips the start position', () => {
    const position = parseBoard(START_FEN);
    expect(position.pieces.size).toBe(32);
    expect(toFen(position)).toBe(START_FEN.replace(/ 0 1$/, ' 0 1'));
  });

  it('drops castling rights that the piece placement no longer allows', () => {
    const position = parseBoard('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    position.pieces.delete('h1');
    expect(availableCastling(position.pieces)).toEqual({ K: false, Q: true, k: true, q: true });
    expect(toFen(position)).toBe('r3k2r/8/8/8/8/8/8/R3K3 w Qkq - 0 1');
  });

  it('explains invalid positions', () => {
    expect(validatePosition('8/8/8/8/8/8/8/8 w - - 0 1')).toMatch(/king/i);
    expect(validatePosition('4k3/8/8/8/8/8/8/4K2P w - - 0 1')).toMatch(/pawn/i);
    // White is in check but it is Black's move.
    expect(validatePosition('4k3/8/8/8/8/8/8/r3K3 b - - 0 1')).toMatch(/White is in check/);
    expect(validatePosition('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')).toBeNull();
  });
});

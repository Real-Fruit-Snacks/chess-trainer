import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import {
  availableCastling,
  availableEnPassant,
  parseBoard,
  pieceCountError,
  toFen,
  validatePosition,
} from './boardEditorModel';

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

  it('keeps the move counters of the game it was opened from', () => {
    const position = parseBoard('4k3/8/8/8/8/8/8/4K3 b - - 7 31');
    expect(position).toMatchObject({ halfmove: 7, fullmove: 31 });
    expect(toFen(position)).toBe('4k3/8/8/8/8/8/8/4K3 b - - 7 31');
    // Garbage counters fall back to the defaults.
    expect(parseBoard('4k3/8/8/8/8/8/8/4K3 w - - x y')).toMatchObject({ halfmove: 0, fullmove: 1 });
  });

  it('offers en passant only when a capture is possible, and writes it to the FEN', () => {
    // Black pawn on d5 beside White's e5 pawn, d6 and d7 empty: d6 is available.
    const position = parseBoard('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1');
    expect(availableEnPassant(position.pieces, 'w')).toEqual(['d6']);
    expect(availableEnPassant(position.pieces, 'b')).toEqual([]);
    position.enPassant = 'd6';
    expect(toFen(position)).toBe('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    // A stale square is dropped once the pieces no longer allow it.
    position.pieces.delete('e5');
    expect(toFen(position)).toBe('4k3/8/8/3p4/8/8/8/4K3 w - - 0 1');
    // No white pawn next to it, or the pawn did not just double-step: nothing offered.
    expect(availableEnPassant(parseBoard('4k3/3p4/8/4P3/8/8/8/4K3 w - - 0 1').pieces, 'w')).toEqual(
      [],
    );
    expect(parseBoard('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1').enPassant).toBe('d6');
  });

  it('refuses impossible piece counts', () => {
    expect(pieceCountError(parseBoard('4k3/pppppppp/p7/8/8/8/8/4K3 w - - 0 1').pieces)).toMatch(
      /Black has 9 pawns/,
    );
    expect(
      pieceCountError(parseBoard('4k3/8/8/8/8/N7/PPPPPPPP/RNBQKBNR w - - 0 1').pieces),
    ).toMatch(/White has 17 pieces/);
    // Two extra queens with every pawn still on the board.
    expect(pieceCountError(parseBoard('4k3/8/8/8/8/8/PPPPPPPP/QQQ1K3 w - - 0 1').pieces)).toMatch(
      /2 promoted pieces but only 0 pawns missing/,
    );
    // One promoted queen with a pawn gone: fine.
    expect(pieceCountError(parseBoard('4k3/8/8/8/8/8/PPPPPPP1/QQ2K3 w - - 0 1').pieces)).toBeNull();
    expect(validatePosition('4k3/pppppppp/p7/8/8/8/8/4K3 w - - 0 1')).toMatch(/pawns/);
  });
});

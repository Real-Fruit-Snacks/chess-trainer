import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  ALL_SQUARES,
  attackers,
  attacks,
  between,
  isAttacked,
  isPlacementField,
  kingSquare,
  kingSquares,
  knightSquares,
  lineStep,
  movePiece,
  parsePlacement,
  pieceName,
  placementField,
  reach,
} from './geometry';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('reading a placement', () => {
  it('reads and writes the placement field back unchanged', () => {
    const fens = [START, '4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1', '8/8/8/3n4/8/8/8/R2Q4 w - - 0 1'];
    for (const fen of fens) {
      expect(placementField(parsePlacement(fen))).toBe(fen.split(' ')[0]);
    }
    const start = parsePlacement(START);
    expect(start.size).toBe(32);
    expect(start.get('e1')).toEqual({ color: 'w', type: 'k' });
    expect(start.get('d8')).toEqual({ color: 'b', type: 'q' });
    expect(kingSquare(start, 'b')).toBe('e8');
    expect(kingSquare(parsePlacement('8/8/8/8/8/8/8/R7 w - - 0 1'), 'w')).toBeNull();
  });

  it('tells a well-formed placement from anything else', () => {
    expect(isPlacementField(START)).toBe(true);
    expect(isPlacementField('8/8/8/8/8/8/8/8')).toBe(true);
    expect(isPlacementField('not a fen')).toBe(false);
    expect(isPlacementField('8/8/8/8/8/8/8')).toBe(false);
    expect(isPlacementField('9/8/8/8/8/8/8/8')).toBe(false);
    expect(isPlacementField('7/8/8/8/8/8/8/8')).toBe(false);
    expect(isPlacementField('ppppppppp/8/8/8/8/8/8/8')).toBe(false);
  });

  it('has 64 squares, a1 first', () => {
    expect(ALL_SQUARES).toHaveLength(64);
    expect(ALL_SQUARES[0]).toBe('a1');
    expect(ALL_SQUARES[63]).toBe('h8');
    expect(pieceName({ color: 'b', type: 'n' })).toBe('black knight');
  });
});

describe('lines', () => {
  it('finds the squares between two squares on a line, and none off it', () => {
    expect(between('a1', 'd4')).toEqual(['b2', 'c3']);
    expect(between('e1', 'e4')).toEqual(['e2', 'e3']);
    expect(between('h8', 'a8')).toEqual(['g8', 'f8', 'e8', 'd8', 'c8', 'b8']);
    expect(between('e4', 'e5')).toEqual([]);
    expect(between('b1', 'c3')).toBeNull();
    expect(between('a1', 'a1')).toBeNull();
    expect(lineStep('c3', 'a1')).toEqual([-1, -1]);
  });
});

describe('attacks and movement', () => {
  it('matches chess.js for every piece of a busy position', () => {
    // Where each piece of the side to move can go agrees with chess.js wherever no
    // check, castling or en passant is involved.
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5';
    const chess = new Chess(fen);
    const placement = parsePlacement(fen);
    for (const [square, piece] of placement) {
      if (piece.color !== 'w' || piece.type === 'k') continue;
      const legal = chess
        .moves({ square, verbose: true })
        .map((m) => m.to)
        .sort();
      expect(reach(placement, square).sort(), square).toEqual(legal);
    }
  });

  it('stops lines at the first piece, which is attacked', () => {
    const placement = parsePlacement('8/8/8/3p4/8/8/8/3R4 w - - 0 1');
    const rook = attacks(placement, 'd1');
    expect(rook).toContain('d5');
    expect(rook).not.toContain('d6');
    expect(rook).toContain('a1');
    expect(isAttacked(placement, 'd5', 'w')).toBe(true);
    expect(isAttacked(placement, 'd6', 'w')).toBe(false);
    expect(attackers(placement, 'd5', 'w')).toEqual(['d1']);
  });

  it('attacks diagonally forwards with a pawn, and moves straight', () => {
    const white = parsePlacement('8/8/8/8/8/3n4/4P3/8 w - - 0 1');
    expect(attacks(white, 'e2').sort()).toEqual(['d3', 'f3']);
    expect(reach(white, 'e2').sort()).toEqual(['d3', 'e3', 'e4']);
    const black = parsePlacement('8/4p3/4N3/8/8/8/8/8 b - - 0 1');
    expect(attacks(black, 'e7').sort()).toEqual(['d6', 'f6']);
    expect(reach(black, 'e7')).toEqual([]);
    // No double step once the pawn has moved.
    expect(reach(parsePlacement('8/8/8/8/8/4P3/8/8 w - - 0 1'), 'e3')).toEqual(['e4']);
  });

  it('jumps with the knight and steps with the king, edges included', () => {
    expect(knightSquares('a1').sort()).toEqual(['b3', 'c2']);
    expect(knightSquares('e4')).toHaveLength(8);
    expect(kingSquares('h8').sort()).toEqual(['g7', 'g8', 'h7']);
  });

  it('moves a piece, taking what stood on the square', () => {
    const placement = parsePlacement('8/8/8/3p4/8/8/8/3R4 w - - 0 1');
    const after = movePiece(placement, 'd1', 'd5');
    expect(placementField(after)).toBe('8/8/8/3R4/8/8/8/8');
    expect(placementField(placement)).toBe('8/8/8/3p4/8/8/8/3R4');
  });
});

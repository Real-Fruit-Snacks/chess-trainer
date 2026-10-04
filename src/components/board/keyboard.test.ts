import { describe, expect, it } from 'vitest';
import {
  describePosition,
  describeSquare,
  moveCursor,
  squareFromKeys,
  squareOffset,
} from './keyboard';

describe('keyboard board control', () => {
  it('moves the cursor from the viewer’s perspective and stops at the edge', () => {
    expect(moveCursor('e4', 'ArrowUp', 'white')).toBe('e5');
    expect(moveCursor('e4', 'ArrowUp', 'black')).toBe('e3');
    expect(moveCursor('e4', 'ArrowLeft', 'white')).toBe('d4');
    expect(moveCursor('e4', 'ArrowLeft', 'black')).toBe('f4');
    expect(moveCursor('a1', 'ArrowLeft', 'white')).toBe('a1');
    expect(moveCursor('h8', 'ArrowUp', 'white')).toBe('h8');
    expect(moveCursor('e4', 'Enter', 'white')).toBeNull();
  });

  it('places overlays on the right square for both orientations', () => {
    expect(squareOffset('a1', 'white')).toEqual({ x: 0, y: 7 / 8 });
    expect(squareOffset('a1', 'black')).toEqual({ x: 7 / 8, y: 0 });
    expect(squareOffset('h8', 'white')).toEqual({ x: 7 / 8, y: 0 });
  });

  it('describes squares and whole positions in words', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(describeSquare(start, 'e2')).toBe('e2, white pawn');
    expect(describeSquare(start, 'e4')).toBe('e4, empty');
    const text = describePosition('6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1');
    expect(text).toBe(
      'Black to move. White: king g1, rook d1, pawns f2, g2 and h2. Black: king g8, pawns f7, g7 and h7.',
    );
    expect(describePosition('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1')).toContain('Checkmate.');
    expect(describePosition('not a fen')).toBe('The position could not be read.');
  });

  it('points out legal destinations while a piece is selected', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const dests = new Map([['e2', ['e3', 'e4']]]);
    expect(describeSquare(start, 'e4', { selected: 'e2', dests })).toBe(
      'e4, empty, legal destination',
    );
    expect(describeSquare(start, 'e5', { selected: 'e2', dests })).toBe('e5, empty');
    expect(describeSquare(start, 'e4', { selected: null, dests })).toBe('e4, empty');
  });

  it('reads a typed square in either case', () => {
    expect(squareFromKeys('e', '4')).toBe('e4');
    expect(squareFromKeys('E', '4')).toBe('e4');
    expect(squareFromKeys('i', '4')).toBeNull();
    expect(squareFromKeys('e', '9')).toBeNull();
  });
});

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { LongColor } from '@/chess/types';

const FILES = 'abcdefgh';

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const PLURALS: Record<PieceSymbol, string> = {
  p: 'pawns',
  n: 'knights',
  b: 'bishops',
  r: 'rooks',
  q: 'queens',
  k: 'kings',
};
const ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

/** The square the keyboard cursor starts on: the centre, from the viewer's side. */
export function defaultCursor(orientation: LongColor): Square {
  return orientation === 'white' ? 'e4' : 'd5';
}

/**
 * Moves the cursor one square in the direction of an arrow key, from the
 * viewer's perspective (ArrowUp goes away from the viewer). Returns the same
 * square at the edge of the board and null for keys that are not arrows.
 */
export function moveCursor(square: Square, key: string, orientation: LongColor): Square | null {
  const file = FILES.indexOf(square[0] ?? '');
  const rank = Number(square[1]) - 1;
  if (file < 0 || Number.isNaN(rank)) return null;
  const flip = orientation === 'black' ? -1 : 1;
  let df = 0;
  let dr = 0;
  switch (key) {
    case 'ArrowUp':
      dr = flip;
      break;
    case 'ArrowDown':
      dr = -flip;
      break;
    case 'ArrowLeft':
      df = -flip;
      break;
    case 'ArrowRight':
      df = flip;
      break;
    default:
      return null;
  }
  const nextFile = Math.min(7, Math.max(0, file + df));
  const nextRank = Math.min(7, Math.max(0, rank + dr));
  return `${FILES[nextFile]}${nextRank + 1}` as Square;
}

/** Position of a square on screen as a fraction of the board (0–1), for overlays. */
export function squareOffset(square: Square, orientation: LongColor): { x: number; y: number } {
  const file = FILES.indexOf(square[0] ?? 'a');
  const rank = Number(square[1]) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  return { x: col / 8, y: row / 8 };
}

/** "e4, white pawn" or "e4, empty". */
export function describeSquare(fen: string, square: Square): string {
  try {
    const piece = new Chess(fen).get(square);
    return piece
      ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}`
      : `${square}, empty`;
  } catch {
    return square;
  }
}

/**
 * A spoken description of the whole position: who is to move, then every
 * piece of each side grouped by type, e.g. "White: king g1, rooks a1 and f1".
 */
export function describePosition(fen: string): string {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return 'The position could not be read.';
  }
  const list = (color: Color) => {
    const groups = new Map<PieceSymbol, Square[]>();
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell?.color !== color) continue;
        groups.set(cell.type, [...(groups.get(cell.type) ?? []), cell.square]);
      }
    }
    const parts = ORDER.filter((t) => groups.has(t)).map((t) => {
      const squares = (groups.get(t) ?? []).sort();
      const name = squares.length === 1 ? PIECE_NAMES[t] : PLURALS[t];
      const joined =
        squares.length <= 1
          ? squares.join('')
          : `${squares.slice(0, -1).join(', ')} and ${squares[squares.length - 1]}`;
      return `${name} ${joined}`;
    });
    return parts.length ? parts.join(', ') : 'no pieces';
  };
  const turn = chess.turn() === 'w' ? 'White' : 'Black';
  const state = chess.isCheckmate()
    ? ' Checkmate.'
    : chess.isStalemate()
      ? ' Stalemate.'
      : chess.inCheck()
        ? ` ${turn} is in check.`
        : '';
  return `${turn} to move.${state} White: ${list('w')}. Black: ${list('b')}.`;
}

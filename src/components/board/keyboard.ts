import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { isPlacementField, parsePlacement } from '@/chess/geometry';
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

/** Whether a square is dark: a1 is dark, so file and rank indices of equal parity are dark. */
export function isDarkSquare(square: Square): boolean {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 0;
}

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

/** A square typed as two keys ("e" then "4", in either case), or null when it is not one. */
export function squareFromKeys(file: string, rank: string): Square | null {
  const name = `${file.toLowerCase()}${rank}`;
  return /^[a-h][1-8]$/.test(name) ? (name as Square) : null;
}

export interface DescribeSquareOptions {
  /** The square whose piece is selected, if any; its legal destinations are pointed out. */
  selected?: Square | null;
  dests?: ReadonlyMap<string, readonly string[]>;
}

/** "e4, white pawn" or "e4, empty" — plus ", legal destination" while a piece that can go there is selected. */
export function describeSquare(
  fen: string,
  square: Square,
  options: DescribeSquareOptions = {},
): string {
  // Read from the placement alone, so a board chess.js would refuse (no kings, as in Ghost
  // Knight) is described all the same.
  const piece = parsePlacement(fen).get(square);
  let text = piece
    ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}`
    : `${square}, empty`;
  if (options.selected && options.dests?.get(options.selected)?.includes(square)) {
    text += ', legal destination';
  }
  return text;
}

/**
 * A spoken description of the whole position: who is to move, then every
 * piece of each side grouped by type, e.g. "White: king g1, rooks a1 and f1".
 */
export function describePosition(fen: string): string {
  // chess.js only reads legal positions; the pieces are listed from the placement whatever it
  // holds (an arbiter's illegal move, a board without kings), and the checks come from chess.js
  // when it can read the position.
  let chess: Chess | null;
  try {
    chess = new Chess(fen);
  } catch {
    chess = null;
  }
  if (!isPlacementField(fen)) return 'The position could not be read.';
  const placement = parsePlacement(fen);
  const list = (color: Color) => {
    const groups = new Map<PieceSymbol, Square[]>();
    for (const [square, piece] of placement) {
      if (piece.color !== color) continue;
      groups.set(piece.type, [...(groups.get(piece.type) ?? []), square]);
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
  const turn = fen.split(' ')[1] === 'b' ? 'Black' : 'White';
  const state = !chess
    ? ''
    : chess.isCheckmate()
      ? ' Checkmate.'
      : chess.isStalemate()
        ? ' Stalemate.'
        : chess.inCheck()
          ? ` ${turn} is in check.`
          : '';
  return `${turn} to move.${state} White: ${list('w')}. Black: ${list('b')}.`;
}

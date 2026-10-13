import type { Square } from 'chess.js';

/**
 * How the pieces move on a bare board: attacks, lines and destinations read
 * straight from a FEN placement, without kings, turns or check. chess.js
 * plays legal chess and refuses anything else; the arcade also needs what it
 * refuses — a position with no kings (Ghost Knight's hunters) and the moves
 * the rules forbid (Arbiter's illegal moves) — so they are worked out here
 * from the movement of each piece alone.
 */

export type Side = 'w' | 'b';
export type Role = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  color: Side;
  type: Role;
}

/** The pieces of a position by square. */
export type Placement = Map<Square, Piece>;

const FILES = 'abcdefgh';

/** The square at a file and rank index (0–7), or null off the board. */
function toSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES.charAt(file)}${rank + 1}` as Square;
}

/** 0 for the a-file … 7 for the h-file. */
export function fileOf(square: Square): number {
  return square.charCodeAt(0) - 97;
}

/** 0 for the first rank … 7 for the eighth. */
export function rankOf(square: Square): number {
  return Number(square.charAt(1)) - 1;
}

/** Every square, a1 to h8 rank by rank. */
export const ALL_SQUARES: readonly Square[] = Array.from(
  { length: 64 },
  (_, i) => toSquare(i % 8, Math.floor(i / 8)) as Square,
);

/** Whether a FEN's placement field is well formed: eight ranks of eight squares each. */
export function isPlacementField(fen: string): boolean {
  const rows = (fen.split(' ')[0] ?? '').split('/');
  return (
    rows.length === 8 &&
    rows.every((row) => {
      if (!/^[pnbrqkPNBRQK1-8]+$/.test(row)) return false;
      let squares = 0;
      for (const ch of row) squares += /[1-8]/.test(ch) ? Number(ch) : 1;
      return squares === 8;
    })
  );
}

/** Reads the placement field of a FEN (the rest, if any, is ignored). */
export function parsePlacement(fen: string): Placement {
  const placement: Placement = new Map();
  const rows = (fen.split(' ')[0] ?? '').split('/');
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const lower = ch.toLowerCase();
      const square = toSquare(file, rank);
      if (square && 'pnbrqk'.includes(lower)) {
        placement.set(square, { color: ch === lower ? 'b' : 'w', type: lower as Role });
      }
      file += 1;
    }
  });
  return placement;
}

/** The placement field of a FEN for these pieces. */
export function placementField(placement: Placement): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = placement.get(toSquare(file, rank) as Square);
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

type Step = readonly [number, number];

const KNIGHT_STEPS: readonly Step[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING_STEPS: readonly Step[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const ROOK_LINES: readonly Step[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const BISHOP_LINES: readonly Step[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

/** The square `df` files and `dr` ranks away, or null off the board. */
export function offset(square: Square, df: number, dr: number): Square | null {
  return toSquare(fileOf(square) + df, rankOf(square) + dr);
}

/** The squares a knight on `square` jumps to. */
export function knightSquares(square: Square): Square[] {
  return KNIGHT_STEPS.map(([df, dr]) => offset(square, df, dr)).filter(
    (s): s is Square => s !== null,
  );
}

/** The squares around `square`, as a king steps. */
export function kingSquares(square: Square): Square[] {
  return KING_STEPS.map(([df, dr]) => offset(square, df, dr)).filter(
    (s): s is Square => s !== null,
  );
}

/** The lines a piece slides along, if it is a sliding piece. */
function linesOf(type: Role): readonly Step[] {
  if (type === 'r') return ROOK_LINES;
  if (type === 'b') return BISHOP_LINES;
  if (type === 'q') return [...ROOK_LINES, ...BISHOP_LINES];
  return [];
}

/** Whether a piece of this type slides (bishop, rook, queen). */
export function slides(type: Role): boolean {
  return type === 'b' || type === 'r' || type === 'q';
}

/** The direction (one step) from `a` towards `b` along a rank, file or diagonal; null if none. */
export function lineStep(a: Square, b: Square): Step | null {
  const df = fileOf(b) - fileOf(a);
  const dr = rankOf(b) - rankOf(a);
  if (df === 0 && dr === 0) return null;
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return null;
  return [Math.sign(df), Math.sign(dr)];
}

/** Squares strictly between two squares on one rank, file or diagonal; null when they share none. */
export function between(a: Square, b: Square): Square[] | null {
  const step = lineStep(a, b);
  if (!step) return null;
  const out: Square[] = [];
  let square = offset(a, step[0], step[1]);
  while (square && square !== b) {
    out.push(square);
    square = offset(square, step[0], step[1]);
  }
  return out;
}

/**
 * The squares the piece on `from` attacks — where it could capture, whoever
 * stands there. Lines stop at the first piece in the way, which is attacked.
 * Pawns attack diagonally forwards only.
 */
export function attacks(placement: Placement, from: Square, piece = placement.get(from)): Square[] {
  if (!piece) return [];
  switch (piece.type) {
    case 'n':
      return knightSquares(from);
    case 'k':
      return kingSquares(from);
    case 'p': {
      const forward = piece.color === 'w' ? 1 : -1;
      return [offset(from, -1, forward), offset(from, 1, forward)].filter(
        (s): s is Square => s !== null,
      );
    }
    default: {
      const out: Square[] = [];
      for (const [df, dr] of linesOf(piece.type)) {
        let square = offset(from, df, dr);
        while (square) {
          out.push(square);
          if (placement.has(square)) break;
          square = offset(square, df, dr);
        }
      }
      return out;
    }
  }
}

/** The squares of the pieces of side `by` that attack `square`. */
export function attackers(placement: Placement, square: Square, by: Side): Square[] {
  const out: Square[] = [];
  for (const [from, piece] of placement) {
    if (piece.color === by && from !== square && attacks(placement, from, piece).includes(square)) {
      out.push(from);
    }
  }
  return out;
}

/** Whether any piece of side `by` attacks `square`. */
export function isAttacked(placement: Placement, square: Square, by: Side): boolean {
  return attackers(placement, square, by).length > 0;
}

/** Where the king of side `color` stands, if there is one. */
export function kingSquare(placement: Placement, color: Side): Square | null {
  for (const [square, piece] of placement) {
    if (piece.type === 'k' && piece.color === color) return square;
  }
  return null;
}

/**
 * Where the piece on `from` can go by its own movement alone: no check, no
 * castling, no en passant and no promotion choice. A piece may land on an
 * empty square or take an enemy piece; pawns step forwards onto empty squares
 * (two from their starting rank) and take diagonally.
 */
export function reach(placement: Placement, from: Square): Square[] {
  const piece = placement.get(from);
  if (!piece) return [];
  if (piece.type !== 'p') {
    return attacks(placement, from, piece).filter((s) => placement.get(s)?.color !== piece.color);
  }
  const forward = piece.color === 'w' ? 1 : -1;
  const out: Square[] = [];
  const one = offset(from, 0, forward);
  if (one && !placement.has(one)) {
    out.push(one);
    const startRank = piece.color === 'w' ? 1 : 6;
    const two = offset(from, 0, 2 * forward);
    if (rankOf(from) === startRank && two && !placement.has(two)) out.push(two);
  }
  for (const target of attacks(placement, from, piece)) {
    const victim = placement.get(target);
    if (victim && victim.color !== piece.color) out.push(target);
  }
  return out;
}

/** The pieces moved: `from` to `to`, taking whatever stood there. A new placement. */
export function movePiece(
  placement: Placement,
  from: Square,
  to: Square,
  piece?: Piece,
): Placement {
  const next = new Map(placement);
  const moving = piece ?? next.get(from);
  next.delete(from);
  if (moving) next.set(to, moving);
  return next;
}

export const ROLE_NAMES: Record<Role, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** "white knight", "black queen". */
export function pieceName(piece: Piece): string {
  return `${piece.color === 'w' ? 'white' : 'black'} ${ROLE_NAMES[piece.type]}`;
}

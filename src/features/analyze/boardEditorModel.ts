import { Chess, type Color, type PieceSymbol, type Square, validateFen } from 'chess.js';
import type { Fen } from '@/chess/types';

export interface Piece {
  color: Color;
  type: PieceSymbol;
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const ROLE: Record<PieceSymbol, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

export interface EditorPosition {
  pieces: Map<Square, Piece>;
  turn: Color;
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean };
  /** Square a pawn may be captured on en passant, when the last move allows it. */
  enPassant: Square | null;
  /** Move counters carried over from the game the editor was opened from. */
  halfmove: number;
  fullmove: number;
}

/** Parses just the piece placement; tolerant of positions chess.js would reject. */
export function parseBoard(fen: Fen): EditorPosition {
  const [placement = '', turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] =
    fen.split(' ');
  const pieces = new Map<Square, Piece>();
  const rows = placement.split('/');
  rows.forEach((row, rowIndex) => {
    const rank = 8 - rowIndex;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const square = `${FILES[file] ?? 'a'}${rank}` as Square;
      const lower = ch.toLowerCase() as PieceSymbol;
      if ('kqrbnp'.includes(lower)) {
        pieces.set(square, { color: ch === lower ? 'b' : 'w', type: lower });
      }
      file++;
    }
  });
  return {
    pieces,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      K: castling.includes('K'),
      Q: castling.includes('Q'),
      k: castling.includes('k'),
      q: castling.includes('q'),
    },
    enPassant: /^[a-h][36]$/.test(ep) ? (ep as Square) : null,
    halfmove: Number.isInteger(Number(half)) && Number(half) >= 0 ? Number(half) : 0,
    fullmove: Number.isInteger(Number(full)) && Number(full) >= 1 ? Number(full) : 1,
  };
}

/**
 * Squares an en passant capture could land on: the side to move must have a
 * pawn able to take, and the enemy pawn must look as if it just moved two squares.
 */
export function availableEnPassant(pieces: Map<Square, Piece>, turn: Color): Square[] {
  const out: Square[] = [];
  const enemy: Color = turn === 'w' ? 'b' : 'w';
  // White to move: a black pawn on x5 that came from x7, so x6 and x7 are empty.
  const [pawnRank, target, origin, captureRank] = turn === 'w' ? [5, 6, 7, 5] : [4, 3, 2, 4];
  FILES.forEach((file, i) => {
    if (!has(pieces, `${file}${pawnRank}` as Square, enemy, 'p')) return;
    if (pieces.has(`${file}${target}` as Square) || pieces.has(`${file}${origin}` as Square)) {
      return;
    }
    const neighbours = [FILES[i - 1], FILES[i + 1]].filter((f): f is (typeof FILES)[number] => !!f);
    if (!neighbours.some((f) => has(pieces, `${f}${captureRank}` as Square, turn, 'p'))) return;
    out.push(`${file}${target}` as Square);
  });
  return out;
}

function has(pieces: Map<Square, Piece>, square: Square, color: Color, type: PieceSymbol): boolean {
  const p = pieces.get(square);
  return !!p && p.color === color && p.type === type;
}

/** Which castling rights are even possible given the king and rook placement. */
export function availableCastling(pieces: Map<Square, Piece>) {
  return {
    K: has(pieces, 'e1', 'w', 'k') && has(pieces, 'h1', 'w', 'r'),
    Q: has(pieces, 'e1', 'w', 'k') && has(pieces, 'a1', 'w', 'r'),
    k: has(pieces, 'e8', 'b', 'k') && has(pieces, 'h8', 'b', 'r'),
    q: has(pieces, 'e8', 'b', 'k') && has(pieces, 'a8', 'b', 'r'),
  };
}

export function toFen(position: EditorPosition): Fen {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = position.pieces.get(`${file}${rank}` as Square);
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  const allowed = availableCastling(position.pieces);
  const castling =
    (['K', 'Q', 'k', 'q'] as const)
      .filter((right) => position.castling[right] && allowed[right])
      .join('') || '-';
  const ep =
    position.enPassant &&
    availableEnPassant(position.pieces, position.turn).includes(position.enPassant)
      ? position.enPassant
      : '-';
  return `${rows.join('/')} ${position.turn} ${castling} ${ep} ${position.halfmove} ${position.fullmove}`;
}

/** Too many pawns, too many pieces, or more promoted pieces than pawns that could have promoted. */
export function pieceCountError(pieces: Map<Square, Piece>): string | null {
  const start: Record<PieceSymbol, number> = { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 };
  for (const color of ['w', 'b'] as const) {
    const counts: Record<PieceSymbol, number> = { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 };
    for (const piece of pieces.values()) if (piece.color === color) counts[piece.type] += 1;
    const side = color === 'w' ? 'White' : 'Black';
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (counts.p > 8) return `${side} has ${counts.p} pawns; eight is the most a side can have.`;
    if (total > 16) return `${side} has ${total} pieces; sixteen is the most a side can have.`;
    const promoted = (['q', 'r', 'b', 'n'] as const).reduce(
      (sum, type) => sum + Math.max(0, counts[type] - start[type]),
      0,
    );
    const missingPawns = 8 - counts.p;
    if (promoted > missingPawns) {
      return `${side} has ${promoted} promoted piece${promoted === 1 ? '' : 's'} but only ${missingPawns} pawn${missingPawns === 1 ? '' : 's'} missing.`;
    }
  }
  return null;
}

/** Validates a FEN the way a human would expect, with a readable message. */
export function validatePosition(fen: Fen): string | null {
  const counts = pieceCountError(parseBoard(fen).pieces);
  if (counts) return counts;
  const check = validateFen(fen);
  if (!check.ok) {
    const error = check.error ?? 'Invalid position';
    if (/king/i.test(error)) return 'Each side needs exactly one king.';
    if (/pawn/i.test(error)) return 'Pawns cannot stand on the first or last rank.';
    return error;
  }
  // The side that just moved may not be in check.
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    if (new Chess(parts.join(' ')).inCheck()) {
      return `${parts[1] === 'w' ? 'White' : 'Black'} is in check but it is not their move.`;
    }
  } catch {
    // ignore: the flipped position failed to load for an unrelated reason
  }
  return null;
}

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
}

/** Parses just the piece placement; tolerant of positions chess.js would reject. */
export function parseBoard(fen: Fen): EditorPosition {
  const [placement = '', turn = 'w', castling = '-'] = fen.split(' ');
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
  };
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
  return `${rows.join('/')} ${position.turn} ${castling} - 0 1`;
}

/** Validates a FEN the way a human would expect, with a readable message. */
export function validatePosition(fen: Fen): string | null {
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

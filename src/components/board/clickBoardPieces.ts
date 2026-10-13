import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { ClickBoardPiece, PieceRole } from './ClickBoard';

const ROLES: Record<PieceSymbol, PieceRole> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

/** The pieces of a position, for a ClickBoard; none for a FEN chess.js rejects. */
export function piecesFromFen(fen: string): Map<Square, ClickBoardPiece> {
  const map = new Map<Square, ClickBoardPiece>();
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return map;
  }
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      map.set(cell.square, {
        color: cell.color === 'w' ? 'white' : 'black',
        role: ROLES[cell.type],
      });
    }
  }
  return map;
}

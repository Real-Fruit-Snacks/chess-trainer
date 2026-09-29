import { Chess, DEFAULT_POSITION, SQUARES, type Move, type Square, validateFen } from 'chess.js';
import type { Fen, LongColor, MoveInput, PromotionPiece, San, ShortColor, Uci } from './types';

export const START_FEN: Fen = DEFAULT_POSITION;

export function toLongColor(color: ShortColor): LongColor {
  return color === 'w' ? 'white' : 'black';
}

export function toShortColor(color: LongColor): ShortColor {
  return color === 'white' ? 'w' : 'b';
}

export function opposite(color: LongColor): LongColor {
  return color === 'white' ? 'black' : 'white';
}

/** Whose turn it is in a FEN, as a chessground colour. */
export function turnOf(fen: Fen): LongColor {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

export function isValidFen(fen: string): boolean {
  return validateFen(fen).ok;
}

/** Legal destinations for every piece of the side to move, in chessground's format. */
export function legalDests(chess: Chess): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>();
  for (const square of SQUARES) {
    const moves = chess.moves({ square, verbose: true });
    if (moves.length) {
      dests.set(
        square,
        moves.map((m) => m.to),
      );
    }
  }
  return dests;
}

export function parseUci(uci: Uci): MoveInput {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? (uci[4] as PromotionPiece) : undefined;
  return promotion ? { from, to, promotion } : { from, to };
}

export function toUci(move: Pick<Move, 'from' | 'to'> & { promotion?: string }): Uci {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/** True when moving a pawn from `from` to `to` would be a promotion in this position. */
export function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from);
  if (piece?.type !== 'p') return false;
  const rank = to[1];
  return (piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1');
}

/** Attempts a move; returns the Move on success or null if illegal (never throws). */
export function tryMove(chess: Chess, input: MoveInput | San): Move | null {
  try {
    return chess.move(input);
  } catch {
    return null;
  }
}

/** Converts a UCI move to SAN in the given position without mutating state. */
export function uciToSan(fen: Fen, uci: Uci): San | null {
  const chess = new Chess(fen);
  const move = tryMove(chess, parseUci(uci));
  return move ? move.san : null;
}

/** Converts a whole UCI line (e.g. an engine PV) to SAN, stopping at the first illegal move. */
export function uciLineToSan(fen: Fen, line: Uci[]): San[] {
  const chess = new Chess(fen);
  const sans: San[] = [];
  for (const uci of line) {
    const move = tryMove(chess, parseUci(uci));
    if (!move) break;
    sans.push(move.san);
  }
  return sans;
}

export function sanToUci(fen: Fen, san: San): Uci | null {
  const chess = new Chess(fen);
  const move = tryMove(chess, san);
  return move ? toUci(move) : null;
}

/** The square of the king that is currently in check, if any. */
export function checkedKingSquare(chess: Chess): Square | null {
  if (!chess.inCheck()) return null;
  const squares = chess.findPiece({ type: 'k', color: chess.turn() });
  return squares[0] ?? null;
}

export interface GameStatus {
  over: boolean;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  reason:
    | 'checkmate'
    | 'stalemate'
    | 'insufficient material'
    | 'threefold repetition'
    | 'fifty-move rule'
    | null;
  /** Colour that delivered mate, if any. */
  winner: LongColor | null;
}

export function gameStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'black' : 'white';
    return { over: true, result: winner === 'white' ? '1-0' : '0-1', reason: 'checkmate', winner };
  }
  if (chess.isStalemate()) {
    return { over: true, result: '1/2-1/2', reason: 'stalemate', winner: null };
  }
  if (chess.isInsufficientMaterial()) {
    return { over: true, result: '1/2-1/2', reason: 'insufficient material', winner: null };
  }
  if (chess.isThreefoldRepetition()) {
    return { over: true, result: '1/2-1/2', reason: 'threefold repetition', winner: null };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', winner: null };
  }
  return { over: false, result: '*', reason: null, winner: null };
}

/** Material balance from White's point of view, in pawns. */
export function materialBalance(chess: Chess): number {
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let total = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const v = values[piece.type] ?? 0;
      total += piece.color === 'w' ? v : -v;
    }
  }
  return total;
}

/** Move number and side, e.g. "12." or "12..." for display. */
export function moveLabel(plyIndex: number, startFen: Fen = START_FEN): string {
  const parts = startFen.split(' ');
  const startMove = Number(parts[5] ?? 1);
  const startsWithBlack = parts[1] === 'b';
  const ply = plyIndex + (startsWithBlack ? 1 : 0);
  const moveNumber = startMove + Math.floor(ply / 2);
  return ply % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`;
}

/** Unicode figurines for inline text. */
export const PIECE_GLYPHS: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

export function pieceName(symbol: string): string {
  const names: Record<string, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  return names[symbol.toLowerCase()] ?? symbol;
}

/**
 * The board's side of a live game's view: the position its moves lead to. Kept
 * apart from liveView.ts so that the bar in the shell, which imports that,
 * never pulls chess.js in. A Chess960 game is played on chessops
 * (src/chess/chess960.ts): castling is the king onto its own rook, in its
 * destinations and its moves alike.
 */
import { Chess, type Move, type Square } from 'chess.js';
import { Chess960Game, type Chess960Move, chess960Number } from '@/chess/chess960';
import { isPromotionMove, legalDests, parseUci, tryMove } from '@/chess/helpers';
import type { ChessKind, Side } from './types';

export interface LivePosition {
  fen: string;
  /** The moves as they were played: SAN for the move list, flags for the sounds. */
  history: (Move | Chess960Move)[];
  lastMove: [Square, Square] | null;
  /** The side to move is in check. */
  check: boolean;
  turn: Side;
  /** Legal destinations of the side to move, for the board (Chess960 castling onto the rook). */
  dests: Map<Square, Square[]>;
  /** The game after the moves (read only: the move sounds ask it about check). */
  chess: Pick<Chess, 'inCheck' | 'isCheckmate'>;
  /** Whether moving from `from` to `to` would promote a pawn of the side to move. */
  isPromotion(from: Square, to: Square): boolean;
}

/**
 * Replays a game's moves (UCI, from `startFen` or the initial position) by the
 * rules of `game`: Chess960's for a Chess960 game, chess.js's for the others. A
 * move that does not fit stops the replay there: the source decides what is
 * legal, and the board shows the last position that makes sense rather than
 * none.
 */
export function replayMoves(
  moves: readonly string[],
  startFen: string | null = null,
  game: ChessKind = 'chess',
): LivePosition {
  if (game === 'chess960') return replayChess960(moves, startFen);
  let chess: Chess;
  try {
    chess = startFen ? new Chess(startFen) : new Chess();
  } catch {
    chess = new Chess();
  }
  const history: Move[] = [];
  for (const uci of moves) {
    const move = tryMove(chess, parseUci(uci));
    if (!move) break;
    history.push(move);
  }
  const last = history[history.length - 1];
  return {
    fen: chess.fen(),
    history,
    lastMove: last ? [last.from, last.to] : null,
    check: chess.inCheck(),
    turn: chess.turn() === 'w' ? 'white' : 'black',
    dests: legalDests(chess),
    chess,
    isPromotion: (from, to) => isPromotionMove(chess, from, to),
  };
}

function replayChess960(moves: readonly string[], startFen: string | null): LivePosition {
  const game = (startFen ? Chess960Game.from(startFen) : null) ?? new Chess960Game();
  for (const uci of moves) {
    if (!game.move(uci)) break;
  }
  const history = game.history();
  const last = history[history.length - 1];
  return {
    fen: game.fen(),
    history,
    lastMove: last ? [last.from, last.to] : null,
    check: game.inCheck(),
    turn: game.turn(),
    dests: game.dests(),
    chess: { inCheck: () => game.inCheck(), isCheckmate: () => game.isCheckmate() },
    isPromotion: (from, to) => game.isPromotion(from, to),
  };
}

/** "Chess960 · position 274": a Chess960 game's start, by its number ("Chess960" without one). */
export function chess960Label(startFen: string | null): string {
  const n = startFen ? chess960Number(startFen) : null;
  return n === null ? 'Chess960' : `Chess960 · position ${n}`;
}

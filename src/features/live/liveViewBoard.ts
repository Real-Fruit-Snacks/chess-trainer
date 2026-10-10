/**
 * The board's side of a live game's view: the position its moves lead to. Kept
 * apart from liveView.ts so that the bar in the shell, which imports that,
 * never pulls chess.js in.
 */
import { Chess, type Move, type Square } from 'chess.js';
import { legalDests, parseUci, tryMove } from '@/chess/helpers';
import type { Side } from './types';

export interface LivePosition {
  fen: string;
  /** The moves as chess.js played them: SAN for the move list, flags for the sounds. */
  history: Move[];
  lastMove: [Square, Square] | null;
  /** The side to move is in check. */
  check: boolean;
  turn: Side;
  /** Legal destinations of the side to move, for the board. */
  dests: Map<Square, Square[]>;
  /** The game after the moves (read only: the move sounds ask it about check). */
  chess: Chess;
}

/**
 * Replays a game's moves (UCI, from the initial position). A move that does
 * not fit stops the replay there: the source decides what is legal, and the
 * board shows the last position that makes sense rather than none.
 */
export function replayMoves(moves: readonly string[]): LivePosition {
  const chess = new Chess();
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
  };
}

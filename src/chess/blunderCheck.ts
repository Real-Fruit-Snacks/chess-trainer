import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { toUci, tryMove } from './helpers';
import {
  CAPTURE,
  EP_CAPTURE,
  PROMOTION,
  QuickBoard,
  type QuickMove,
  quickInput,
  quickUci,
  squareIndex,
} from './quickBoard';
import type { Fen, MoveInput, San, Uci } from './types';

/**
 * The blunder check: before a move is played, the questions a strong player
 * asks out of habit — what checks, captures and threats does it allow? — asked
 * by the board. It needs no engine and answers at once:
 *
 *  - a move that lets the opponent mate at once is held back;
 *  - a move that loses material to a sequence of captures (two pawns' worth or
 *    more, counted with exchanges and recaptures) is held back too — but only
 *    when another move loses less, so a fork or a lost position, where every
 *    move costs something, is never nagged about.
 *
 * Deliberately simple: quiet threats, pins that only bite later and longer
 * mates are the coach's and the review's job. A sacrifice is held back like a
 * blunder, which is why the learner can always play the move anyway.
 *
 * The searching runs on `QuickBoard`, which makes and takes back moves without
 * building SAN or FEN: it runs before every move, on the main thread, so it
 * has to answer in a few milliseconds even in a sharp position on a phone.
 * chess.js only plays the move asked about and spells the answer for the warning.
 */

/** Piece values by QuickBoard piece type: none, pawn, knight, bishop, rook, queen, king. */
const VALUE = [0, 1, 3, 3, 5, 9, 0];
const valueOf = (type: number) => VALUE[type] ?? 0;

/** A material warning needs the move to lose at least this much (pawns) against another move. */
export const BLUNDER_MIN_LOSS = 2;
/** Captures looked at in a row, both sides together. */
const CAPTURE_DEPTH = 8;

export interface BlunderMove {
  uci: Uci;
  san: San;
  from: Square;
  to: Square;
}

export interface BlunderWarning {
  kind: 'mate' | 'material';
  /** The move that was held back. */
  move: BlunderMove;
  /** The opponent's answer that punishes it: the mate, or the first capture. */
  reply: BlunderMove;
  /** Material lost against the best other move, in pawns (0 for a mate). */
  loss: number;
  /** Material warnings: the piece the answer takes. */
  captured?: PieceSymbol;
}

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

interface Capture {
  move: QuickMove;
  /** Material the capture wins at once: the piece taken plus any promotion. */
  won: number;
  /** The capturing piece's value, for trying the cheapest attacker first. */
  by: number;
}

/** The answers to a move: are there any, does one mate, and what can be taken. */
interface Replies {
  any: boolean;
  /** The first mating answer, in chess.js's move order. */
  mate: QuickMove | null;
  captures: Capture[];
}

/** Material a move wins at once: what it takes plus any promotion. */
function gainOf(move: QuickMove): number {
  return valueOf(move.captured) + (move.promotion ? valueOf(move.promotion) - 1 : 0);
}

/** Captures and promotions, the biggest gain first, then the cheapest piece making it. */
function ranked(moves: QuickMove[]): Capture[] {
  const list = moves.map((move) => ({ move, won: gainOf(move), by: valueOf(move.piece) }));
  list.sort((x, y) => y.won - x.won || x.by - y.by);
  return list;
}

/** One move generation, read three ways. */
function replies(board: QuickBoard): Replies {
  const moves = board.moves();
  let mate: QuickMove | null = null;
  for (const move of moves) {
    board.make(move);
    const mates = board.inCheck() && !board.hasMove();
    board.unmake();
    if (mates) {
      mate = move;
      break;
    }
  }
  return {
    any: moves.length > 0,
    mate,
    captures: ranked(moves.filter((m) => m.flags & (CAPTURE | EP_CAPTURE | PROMOTION))),
  };
}

/**
 * Material the side to move can win with captures from here, the other side
 * answering with captures; either may stop at any point (alpha-beta over
 * captures only — a quiescence search with material as the only measure).
 * Fail-soft: a result at or above `beta` is a lower bound, at or below
 * `alpha` an upper bound.
 */
function captureGain(
  board: QuickBoard,
  depth: number,
  alpha: number,
  beta: number,
  list?: Capture[],
): number {
  let best = 0;
  if (depth === 0 || best >= beta) return best;
  if (best > alpha) alpha = best;
  for (const capture of list ?? ranked(board.captures())) {
    // A capture cannot end up winning more than it takes at once.
    if (capture.won <= alpha) continue;
    board.make(capture.move);
    const score =
      capture.won - captureGain(board, depth - 1, capture.won - beta, capture.won - alpha);
    board.unmake();
    if (score > best) {
      best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  }
  return best;
}

/** Whether captures win the side to move at least `target` (a null-window search: quick). */
function capturesWin(board: QuickBoard, target: number, list?: Capture[]): boolean {
  return captureGain(board, CAPTURE_DEPTH, target - 1, target, list) >= target;
}

/** The first capture of the best capture sequence, with what the sequence wins. */
function bestCapture(
  board: QuickBoard,
  list: Capture[],
): { capture: Capture; gain: number } | null {
  let best: { capture: Capture; gain: number } | null = null;
  for (const capture of list) {
    if (capture.won <= (best?.gain ?? 0)) continue;
    board.make(capture.move);
    const gain = capture.won - captureGain(board, CAPTURE_DEPTH - 1, -Infinity, Infinity);
    board.unmake();
    if (gain > (best?.gain ?? 0)) best = { capture, gain };
  }
  return best;
}

/** An answer, spelled by chess.js for the warning (`chess` stands after the move held back). */
function describe(
  chess: Chess,
  move: QuickMove,
): { move: BlunderMove; captured: PieceSymbol | undefined } | null {
  const made = tryMove(chess, quickInput(move));
  if (!made) return null;
  chess.undo();
  return {
    move: { uci: toUci(made), san: made.san, from: made.from, to: made.to },
    captured: made.captured,
  };
}

/**
 * Whether some other move on `board` (the learner to move) does at least
 * `threshold` in material without allowing mate at once. Captures and moves
 * of the piece on `threatened` are tried first, so the answer usually comes early.
 */
function betterMoveExists(
  board: QuickBoard,
  played: Uci,
  threshold: number,
  threatened: number,
): boolean {
  const rank = (m: QuickMove) =>
    (m.captured || m.promotion ? 0 : 2) - (m.from === threatened ? 1 : 0);
  const moves = board
    .moves()
    .filter((m) => quickUci(m) !== played)
    .sort((a, b) => rank(a) - rank(b));
  for (const candidate of moves) {
    board.make(candidate);
    try {
      const answers = replies(board);
      if (!answers.any) {
        // Mate is as good as it gets; stalemate is not a way out worth pointing to.
        if (board.inCheck()) return true;
        continue;
      }
      if (answers.mate) continue;
      if (threshold === -Infinity) return true;
      // net = won − what the answers win ≥ threshold ⇔ the answers win less than won − threshold + 1.
      if (!capturesWin(board, gainOf(candidate) - threshold + 1, answers.captures)) return true;
    } finally {
      board.unmake();
    }
  }
  return false;
}

/**
 * Checks a move before it is played in `fen`. Returns the warning to show,
 * or null when the move is fine (or illegal, or ends the game).
 */
export function checkBlunder(fen: Fen, input: MoveInput): BlunderWarning | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  const move = tryMove(chess, input);
  if (!move) return null;
  const held: BlunderMove = { uci: toUci(move), san: move.san, from: move.from, to: move.to };
  const board = QuickBoard.fromFen(fen);
  const played = board.moves().find((m) => quickUci(m) === held.uci);
  if (!played) return null;
  board.make(played);
  const answers = replies(board);
  // A mate, a stalemate or a draw by rule: the game is over and there is nothing to check.
  if (!answers.any || chess.isDraw()) return null;

  if (answers.mate) {
    const reply = describe(chess, answers.mate);
    board.unmake();
    // When every move allows mate there is no better move to point the learner to.
    if (!reply || !betterMoveExists(board, held.uci, -Infinity, -1)) return null;
    return { kind: 'mate', move: held, reply: reply.move, loss: 0 };
  }

  // The quick question first — do the answers win two pawns more than the move took? —
  // and only for a move that fails it, the full search for what and how.
  const won = gainOf(played);
  if (!capturesWin(board, won + BLUNDER_MIN_LOSS, answers.captures)) return null;
  const best = bestCapture(board, answers.captures);
  if (!best) return null;
  const net = won - best.gain;
  const reply = describe(chess, best.capture.move);
  board.unmake();
  if (!reply) return null;
  // Moving the piece the answer takes is the first thing to try: from where it stood before
  // the move when it is the piece just moved, from its square when it was left behind.
  const threatened = reply.move.to === held.to ? held.from : reply.move.to;
  if (!betterMoveExists(board, held.uci, net + BLUNDER_MIN_LOSS, squareIndex(threatened))) {
    return null;
  }
  return {
    kind: 'material',
    move: held,
    reply: reply.move,
    loss: -net,
    ...(reply.captured ? { captured: reply.captured } : {}),
  };
}

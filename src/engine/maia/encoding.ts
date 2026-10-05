import { Chess } from 'chess.js';
import { toUci } from '@/chess/helpers';
import type { Fen, San, Uci } from '@/chess/types';

/**
 * Maia-3's view of a position and of a move, as in the upstream code (and the
 * Maia platform's own browser client):
 *
 *  - the board is always seen from the side to move: when Black is to move it
 *    is mirrored top to bottom and the colours swapped, so the mover is
 *    "White" moving up the board;
 *  - the input is 64 squares × 12 one-hot piece channels (a1 = 0 … h8 = 63;
 *    channels P N B R Q K for the mover, then p n b r q k), nothing else —
 *    no castling rights or en passant, which the move list takes care of;
 *  - the output scores a vocabulary of 4,352 moves in that mirrored frame:
 *    every from-square × to-square (64 × 64), then 256 promotions indexed by
 *    file from, file to and piece (q r b n).
 *
 * Plus the two ratings — the mover's and the opponent's — as plain numbers.
 */

export const MAIA_BOARD_SIZE = 64 * 12;
export const MAIA_VOCABULARY_SIZE = 4352;
const PIECES = 'PNBRQKpnbrqk';
const PROMOTIONS = 'qrbn';

/** A square's index in the mover's frame: a1 = 0 … h8 = 63, ranks mirrored when Black moves. */
function frameSquare(square: string, black: boolean): number {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square.charAt(1)) - 1;
  return (black ? 7 - rank : rank) * 8 + file;
}

/** The model's input for a position: 64 × 12 one-hot piece channels, from the mover's side. */
export function maiaTokens(fen: Fen): Float32Array {
  const [placement = '', turn = 'w'] = fen.trim().split(/\s+/);
  const black = turn === 'b';
  const tokens = new Float32Array(MAIA_BOARD_SIZE);
  placement.split('/').forEach((row, i) => {
    // FEN lists the eighth rank first.
    const rank = 7 - i;
    let file = 0;
    for (const char of row) {
      if (char >= '1' && char <= '8') {
        file += Number(char);
        continue;
      }
      const piece = PIECES.indexOf(char);
      if (piece < 0) throw new Error(`Not a piece: ${char}`);
      // Mirrored for Black: its pieces become the mover's (channels 0–5) on the opposite rank.
      const channel = black ? (piece + 6) % 12 : piece;
      const square = (black ? 7 - rank : rank) * 8 + file;
      tokens[square * 12 + channel] = 1;
      file++;
    }
  });
  return tokens;
}

/** A legal move's place in the model's vocabulary (`black`: Black is the side to move). */
export function maiaMoveIndex(uci: Uci, black: boolean): number {
  const from = frameSquare(uci.slice(0, 2), black);
  const to = frameSquare(uci.slice(2, 4), black);
  const promotion = uci.charAt(4);
  if (!promotion) return from * 64 + to;
  return 4096 + (from % 8) * 32 + (to % 8) * 4 + PROMOTIONS.indexOf(promotion);
}

export interface MaiaMove {
  uci: Uci;
  san: San;
  /** How likely a player of the rating is to play it (the legal moves sum to 1). */
  probability: number;
}

/** What the model expects from the side to move: its chances, as players of the rating fare. */
export interface MaiaValue {
  win: number;
  draw: number;
  loss: number;
}

/** Softmax over `values` (largest first is not required). */
function softmax(values: readonly number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * The legal moves of `fen` with the probability the model gives each, most
 * likely first: its scores for the vocabulary, kept to the legal moves and
 * normalised. Empty when the game is over.
 */
export function maiaPolicy(fen: Fen, logits: ArrayLike<number>): MaiaMove[] {
  const chess = new Chess(fen);
  const black = chess.turn() === 'b';
  const legal = chess.moves({ verbose: true }).map((m) => {
    const uci = toUci(m);
    return {
      uci,
      san: m.san,
      logit: logits[maiaMoveIndex(uci, black)] ?? Number.NEGATIVE_INFINITY,
    };
  });
  if (legal.length === 0) return [];
  const probabilities = softmax(legal.map((m) => m.logit));
  return legal
    .map((m, i) => ({ uci: m.uci, san: m.san, probability: probabilities[i] ?? 0 }))
    .sort((a, b) => b.probability - a.probability);
}

/** The value head's loss / draw / win scores (in that order) as chances. */
export function maiaValue(logits: ArrayLike<number>): MaiaValue {
  const [loss = 0, draw = 0, win = 0] = softmax([logits[0] ?? 0, logits[1] ?? 0, logits[2] ?? 0]);
  return { win, draw, loss };
}

/**
 * Moves the model gives less than this are left out of the draw: the long tail
 * of moves hardly any player of the rating would consider. Everything above it
 * stays, the plausible mistakes included — that is what makes the opponent
 * play like a person of the rating rather than like the best of them.
 */
export const SAMPLE_FLOOR = 0.02;

/**
 * Picks the move to play the way a player of the rating might: at random, in
 * proportion to how often such players choose each move (the likeliest move
 * is always in the draw). Null when there is no move.
 */
export function sampleHumanMove(
  moves: readonly MaiaMove[],
  random: () => number = Math.random,
): MaiaMove | null {
  const kept = moves.filter((m, i) => i === 0 || m.probability >= SAMPLE_FLOOR);
  const total = kept.reduce((sum, m) => sum + m.probability, 0);
  let r = random() * total;
  for (const move of kept) {
    r -= move.probability;
    if (r <= 0) return move;
  }
  return kept[kept.length - 1] ?? null;
}

export interface ThinkContext {
  /** Half-moves played so far. */
  ply: number;
  /** The opponent's time left on the clock, or null without one. */
  clockMs: number | null;
}

/** Below this the opponent moves at once, as anyone short of time would. */
const HURRY_MS = 10_000;

/**
 * How long the human-like opponent takes over a move: an obvious move (a
 * recapture, the one sensible reply) comes quickly, a position with many
 * candidates takes longer, the opening goes faster, and with a clock it never
 * spends more than a small slice of what it has left.
 */
export function humanThinkMs(
  moves: readonly MaiaMove[],
  context: ThinkContext,
  random: () => number = Math.random,
): number {
  const top = moves[0]?.probability ?? 1;
  let base = 300 + 1200 * (1 - top);
  if (context.ply < 10) base *= 0.5;
  let ms = base * (1 + random());
  if (context.clockMs !== null) {
    ms = Math.min(ms, context.clockMs / 40);
    if (context.clockMs < HURRY_MS) ms = Math.min(ms, 300);
  }
  return Math.max(0, Math.round(ms));
}

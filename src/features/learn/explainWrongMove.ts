import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';
import { staticExchange } from '@/features/analyze/commentary';
import type { Fen } from '@/chess/types';

/**
 * What the coach can say about a wrong move from the board alone, for the
 * moves a lesson does not answer itself: the mate it allows, the stalemate it
 * gives, or the material it drops (the opponent's best capture, followed
 * through every capture and recapture that comes after it). Null when the
 * board shows nothing that plain; the lesson's own words serve then.
 */
export interface BoardAnswer {
  text: string;
  /** The opponent's reply that shows it, played after the move. */
  refute: string | null;
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
/** Worse than any material count: the side to move is mated. */
const MATED = -1_000;
/** How many captures deep an exchange is followed. */
const CAPTURE_DEPTH = 6;

const sideName = (color: Color) => (color === 'w' ? 'White' : 'Black');

/** What a move wins on the spot: the piece it takes, and what a promotion adds. */
function gainOf(move: Move): number {
  return (
    (move.captured ? VALUE[move.captured] : 0) + (move.promotion ? VALUE[move.promotion] - 1 : 0)
  );
}

/** Biggest gain first, then the cheapest piece making it. */
function byGain(a: Move, b: Move): number {
  return gainOf(b) - gainOf(a) || VALUE[a.piece] - VALUE[b.piece];
}

const play = (chess: Chess, move: Move) =>
  chess.move({ from: move.from, to: move.to, promotion: move.promotion });

/** The opponent's move that mates at once, if there is one. */
function mateInOne(chess: Chess): Move | null {
  for (const reply of chess.moves({ verbose: true })) {
    play(chess, reply);
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) return reply;
  }
  return null;
}

/**
 * What the side to move can win from here by captures alone: it may always
 * stop capturing (scoring 0), except in check, where it must answer the check
 * and being mated scores MATED. Alpha-beta over captures and promotions.
 */
function captureGain(chess: Chess, alpha: number, beta: number, depth: number): number {
  const moves = chess.moves({ verbose: true });
  const inCheck = chess.inCheck();
  if (moves.length === 0) return inCheck ? MATED : 0;
  const mustAnswer = inCheck && depth > 0;
  let best = mustAnswer ? MATED : 0;
  if (!mustAnswer) {
    if (best >= beta || depth <= 0) return best;
    alpha = Math.max(alpha, best);
  }
  const candidates = mustAnswer
    ? moves
    : moves.filter((m) => m.captured !== undefined || m.promotion !== undefined);
  for (const move of candidates.sort(byGain)) {
    const gain = gainOf(move);
    play(chess, move);
    const score = gain - captureGain(chess, gain - beta, gain - alpha, depth - 1);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * The opponent's capture (or promotion) that wins most once every capture and
 * recapture after it is played out, with what it wins in the end and whether
 * the mover can take nothing back. Captures that walk into a mate in one do
 * not count: taking would be the mistake then.
 */
function bestCapture(chess: Chess): { move: Move; net: number; unanswered: boolean } | null {
  let best: { move: Move; net: number; unanswered: boolean } | null = null;
  const captures = chess
    .moves({ verbose: true })
    .filter((m) => m.captured !== undefined || m.promotion !== undefined);
  for (const move of captures.sort(byGain)) {
    play(chess, move);
    const mated = mateInOne(chess) !== null;
    const back = mated ? 0 : captureGain(chess, -Infinity, Infinity, CAPTURE_DEPTH);
    chess.undo();
    if (mated) continue;
    const net = gainOf(move) - back;
    if (!best || net > best.net) best = { move, net, unanswered: back <= 0 };
  }
  return best;
}

export function explainWrongMove(fen: Fen, san: string): BoardAnswer | null {
  const chess = new Chess(fen);
  let played: Move;
  try {
    played = chess.move(san);
  } catch {
    return null;
  }
  const them = sideName(chess.turn());
  if (chess.isStalemate()) {
    return {
      text: `That is stalemate: ${them} has no legal move and is not in check, so the game is a draw.`,
      refute: null,
    };
  }
  if (chess.isGameOver()) return null;

  const mate = mateInOne(chess);
  if (mate) {
    return { text: `Careful: that allows ${mate.san}, and it is checkmate.`, refute: mate.san };
  }

  const best = bestCapture(chess);
  // What the move took itself makes up for what it loses: a trade is no blunder.
  const took = gainOf(played);
  if (!best || best.net - took <= 0) return null;
  const { move } = best;
  const capture = move.san;
  if (!move.captured) return { text: `That lets ${them} promote: ${capture}.`, refute: capture };
  // Is the material won right there, in the exchange on that square? Otherwise it comes
  // from what the captures uncover, and only the first of them is named.
  const square = move.to;
  const there =
    !move.flags.includes('e') && staticExchange(chess.fen(), square, chess.turn()) >= best.net;
  if (!there) {
    return {
      text: `That loses material: ${them} wins it with a series of captures, starting with ${capture}.`,
      refute: capture,
    };
  }
  const name = NAME[move.captured];
  // Won outright: nothing takes back at all. Otherwise the exchange still wins material
  // (taking back loses more), and the piece is said to be short of defenders.
  play(chess, move);
  const defended = chess.moves({ verbose: true }).some((m) => m.to === square && m.captured);
  chess.undo();
  const outright = !defended && best.unanswered && best.net >= VALUE[move.captured];
  if (square === played.to) {
    return {
      text:
        outright && took === 0
          ? `The ${name} is unprotected on ${square}: ${them} simply takes it with ${capture}.`
          : `${them} wins material with ${capture}: the ${name} on ${square} cannot be held.`,
      refute: capture,
    };
  }
  return {
    text: outright
      ? `That leaves your ${name} on ${square} unprotected: ${them} takes it with ${capture}.`
      : `That leaves your ${name} on ${square} short of defenders: ${them} wins material with ${capture}.`,
    refute: capture,
  };
}

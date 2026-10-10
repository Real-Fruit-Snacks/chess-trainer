/**
 * The rules of a live game, on chess.js: moves in UCI ("e2e4", "e7e8q"), how a
 * game ends by itself, and who can still mate when the other side's flag falls.
 */
import { Chess } from 'chess.js';

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * Plays a move given in UCI on `chess`: the move as chess.js describes it, or
 * null when it is not a legal move (or not a move at all).
 * @param {Chess} chess
 * @param {unknown} uci
 */
export function playUci(chess, uci) {
  if (typeof uci !== 'string' || !UCI.test(uci)) return null;
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci[4] } : {}),
    });
  } catch {
    return null;
  }
}

/**
 * The game after `moves` from the initial position; null when one of them is
 * not legal (a stored game is never like that, but nothing is taken on trust).
 * @param {readonly string[]} moves
 */
export function replay(moves) {
  const chess = new Chess();
  for (const uci of moves) {
    if (!playUci(chess, uci)) return null;
  }
  return chess;
}

/**
 * How the game stands after its last move: over by itself (mate, stalemate,
 * a dead position, threefold repetition, fifty moves), or null.
 * @param {Chess} chess
 * @returns {{ result: '1-0' | '0-1' | '1/2-1/2', reason: string } | null}
 */
export function endOf(chess) {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'repetition' };
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', reason: 'fifty-moves' };
  return null;
}

/** Whether a square ("a1"-style) is a light one: a1 is dark, h1 light. */
const lightSquare = (/** @type {string} */ square) =>
  (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0;

/**
 * Whether `color` ('w' or 'b') cannot mate by any series of legal moves: the
 * rule for a flag that falls (the game is then drawn, not lost). A bare king
 * cannot; nor can a king and one minor piece against a bare king, nor bishops
 * all on one colour of square against a king with at most bishops on that same
 * colour. Anything else could, with the other side's help.
 * @param {Chess} chess
 * @param {'w' | 'b'} color
 */
export function cannotMate(chess, color) {
  /** @type {{ type: string, square: string }[]} */
  const own = [];
  /** @type {{ type: string, square: string }[]} */
  const theirs = [];
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type === 'k') continue;
      (piece.color === color ? own : theirs).push(piece);
    }
  }
  if (own.some((p) => p.type === 'q' || p.type === 'r' || p.type === 'p')) return false;
  if (own.length === 0) return true;
  if (own.length === 1 && theirs.length === 0) return true;
  if (own.every((p) => p.type === 'b')) {
    const shade = lightSquare(/** @type {{ square: string }} */ (own[0]).square);
    const oneShade = (p) => p.type === 'b' && lightSquare(p.square) === shade;
    return own.every(oneShade) && theirs.every(oneShade);
  }
  return false;
}

import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const COLOR_NAMES: Record<Color, string> = { w: 'White', b: 'Black' };

function load(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function placement(fen: string): string {
  return fen.split(' ')[0] ?? '';
}

/**
 * Replays `from`→`to` on `before` and returns the chess.js move when it really
 * leads to `after`; null when the two positions are not consecutive (stepping
 * back, jumping through a game, a new puzzle), where a guess from the previous
 * board would describe a capture or a piece that never was.
 */
function replay(before: string, after: string, from: Square, to: Square): Move | null {
  const chess = load(before);
  if (!chess) return null;
  const promoted = load(after)?.get(to)?.type;
  const move = chess
    .moves({ square: from, verbose: true })
    .find((m) => m.to === to && (!m.promotion || m.promotion === promoted));
  if (!move) return null;
  return placement(move.after) === placement(after) ? move : null;
}

/** The words for a replayed move, without the mover: "knight g1 to f3", "queen takes pawn on f7". */
function wordsFor(move: Move, verb: 'plays' | ''): string {
  if (move.isKingsideCastle()) return 'castles kingside';
  if (move.isQueensideCastle()) return 'castles queenside';
  const piece = PIECE_NAMES[move.piece];
  let text: string;
  if (move.captured) {
    text = `${piece} takes ${PIECE_NAMES[move.captured]} on ${move.to}`;
    if (move.isEnPassant()) text += ' en passant';
  } else {
    text = `${verb ? `${verb} ` : ''}${piece} ${move.from} to ${move.to}`;
  }
  if (move.promotion) text += `, promotes to ${PIECE_NAMES[move.promotion]}`;
  return text;
}

function outcome(position: Chess): string {
  if (position.isCheckmate()) return ', checkmate';
  if (position.inCheck()) return ', check';
  if (position.isStalemate()) return ', stalemate';
  return '';
}

/**
 * Describes the move that took the board from `before` to `after` in plain
 * words for screen readers, e.g. "White plays knight g1 to f3, check." The
 * move is replayed on `before` and that account is used only when it really
 * produces `after`; otherwise (a step back, a jump, a new puzzle) the move is
 * described from `after` alone, so the text never invents a capture.
 *
 * Returns null when there is no move or no piece stands on its destination.
 */
export function describeMove(
  before: string | null,
  after: string,
  move: readonly [string, string] | null | undefined,
): string | null {
  if (!move) return null;
  const [from, to] = move as [Square, Square];
  const next = load(after);
  if (!next) return null;
  const moved = next.get(to);
  if (!moved) return null;
  const mover = COLOR_NAMES[moved.color];
  const replayed = before ? replay(before, after, from, to) : null;

  let text: string;
  if (replayed) {
    text = `${mover} ${wordsFor(replayed, 'plays')}`;
  } else if (moved.type === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
    text = `${mover} castles ${to.charCodeAt(0) > from.charCodeAt(0) ? 'kingside' : 'queenside'}`;
  } else {
    text = `${mover} plays ${PIECE_NAMES[moved.type]} ${from} to ${to}`;
  }
  return `${text}${outcome(next)}.`;
}

/**
 * A move list entry in words, from the position it is played in: "Knight g1 to
 * f3", "Queen takes pawn on f7, checkmate", "Castles kingside". Null when the
 * move is not legal there.
 */
export function describeSan(fen: string, san: string): string | null {
  const chess = load(fen);
  if (!chess) return null;
  let move: Move;
  try {
    move = chess.move(san);
  } catch {
    return null;
  }
  const words = wordsFor(move, '');
  return words.charAt(0).toUpperCase() + words.slice(1) + outcome(chess);
}

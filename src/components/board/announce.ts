import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

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

/**
 * Describes the move that took the board from `before` to `after` in plain
 * words for screen readers, e.g. "White plays knight to f3, check." The
 * description is derived from the two positions and the squares, so it
 * works for every board in the app without each feature having to report
 * its own moves.
 *
 * Returns null when the positions do not describe a single move.
 */
export function describeMove(
  before: string | null,
  after: string,
  move: readonly [string, string] | null | undefined,
): string | null {
  if (!move) return null;
  const [from, to] = move;
  const next = load(after);
  if (!next) return null;
  const moved = next.get(to as Square);
  if (!moved) return null;
  const mover = COLOR_NAMES[moved.color];
  const prev = before ? load(before) : null;
  const wasPiece = prev?.get(from as Square) ?? null;
  const captured = prev?.get(to as Square) ?? null;

  let text: string;
  const fromFile = from.charCodeAt(0);
  const toFile = to.charCodeAt(0);
  if (wasPiece?.type === 'k' && Math.abs(fromFile - toFile) === 2) {
    text = `${mover} castles ${toFile > fromFile ? 'kingside' : 'queenside'}`;
  } else {
    const pieceName = PIECE_NAMES[wasPiece?.type ?? moved.type];
    const promoted = wasPiece?.type === 'p' && moved.type !== 'p';
    const enPassant =
      wasPiece?.type === 'p' && !captured && fromFile !== toFile && moved.type === 'p';
    if (captured && captured.color !== moved.color) {
      text = `${mover} ${pieceName} takes ${PIECE_NAMES[captured.type]} on ${to}`;
    } else if (enPassant) {
      text = `${mover} pawn takes pawn on ${to} en passant`;
    } else {
      text = `${mover} plays ${pieceName} ${from} to ${to}`;
    }
    if (promoted) text += `, promotes to ${PIECE_NAMES[moved.type]}`;
  }

  if (next.isCheckmate()) text += ', checkmate';
  else if (next.inCheck()) text += ', check';
  else if (next.isStalemate()) text += ', stalemate';
  return `${text}.`;
}

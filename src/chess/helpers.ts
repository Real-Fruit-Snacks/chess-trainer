import { Chess, SQUARES, type Move, type Square, validateFen } from 'chess.js';
import { START_FEN } from './startFen';
import type { Fen, LongColor, MoveInput, PromotionPiece, San, ShortColor, Uci } from './types';

export { START_FEN };

export function toLongColor(color: ShortColor): LongColor {
  return color === 'w' ? 'white' : 'black';
}

export function opposite(color: LongColor): LongColor {
  return color === 'white' ? 'black' : 'white';
}

/** Whose turn it is in a FEN, as a chessground colour. */
export function turnOf(fen: Fen): LongColor {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/**
 * Whether `fen` describes a legal position once repaired by `normalizeFen`,
 * so 4-field FENs and EPDs count as valid. Callers that load the FEN should
 * load `sanitizeFen(fen)` (or let `GameTree`/`useChess` normalise it).
 */
export function isValidFen(fen: string): boolean {
  return validateFen(normalizeFen(fen)).ok;
}

/** The piece letter on `square` in a FEN placement field, or null for an empty square. */
function pieceAt(placement: string, square: string): string | null {
  const ranks = placement.split('/');
  if (ranks.length !== 8) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = ranks[8 - Number(square[1])];
  if (!rank || file < 0 || file > 7) return null;
  let col = 0;
  for (const ch of rank) {
    const empty = Number(ch);
    if (Number.isInteger(empty)) {
      if (file < col + empty) return null;
      col += empty;
    } else {
      if (col === file) return ch;
      col++;
    }
  }
  return null;
}

/**
 * Repairs the parts of a FEN that chess.js does not check against the board:
 * castling rights whose king or rook has left its square (a diagram tool's
 * `KQkq` with the king on e2 would otherwise offer phantom castling), an en
 * passant square with no pawn that could have just made the double step, and
 * missing move counters (4- and 5-field FENs, as in EPD). The placement and
 * side to move are returned as given; validate the result with `isValidFen`.
 */
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return fen.trim();
  const [placement = '', turn = 'w'] = parts;
  let castling = parts[2] ?? '-';
  let ep = parts[3] ?? '-';
  const halfmove = parts[4] ?? '0';
  const fullmove = parts[5] ?? '1';

  const RIGHTS: Record<
    string,
    [king: string, kingSquare: string, rook: string, rookSquare: string]
  > = {
    K: ['K', 'e1', 'R', 'h1'],
    Q: ['K', 'e1', 'R', 'a1'],
    k: ['k', 'e8', 'r', 'h8'],
    q: ['k', 'e8', 'r', 'a8'],
  };
  const kept = [...castling]
    .filter((flag) => {
      const right = RIGHTS[flag];
      if (!right) return false;
      return pieceAt(placement, right[1]) === right[0] && pieceAt(placement, right[3]) === right[2];
    })
    .join('');
  castling = kept || '-';

  if (ep !== '-') {
    const file = ep[0] ?? '';
    const rank = ep[1] ?? '';
    const possible =
      /^[a-h]$/.test(file) &&
      pieceAt(placement, ep) === null &&
      ((rank === '3' &&
        turn === 'b' &&
        pieceAt(placement, `${file}4`) === 'P' &&
        pieceAt(placement, `${file}2`) === null) ||
        (rank === '6' &&
          turn === 'w' &&
          pieceAt(placement, `${file}5`) === 'p' &&
          pieceAt(placement, `${file}7`) === null));
    if (!possible) ep = '-';
  }

  return `${placement} ${turn} ${castling} ${ep} ${halfmove} ${fullmove}`;
}

/** A user-supplied FEN made consistent (see `normalizeFen`), or null when it is not a position. */
export function sanitizeFen(fen: string): string | null {
  const normalized = normalizeFen(fen);
  return isValidFen(normalized) ? normalized : null;
}

export interface LegalDestsOptions {
  /**
   * Also list the rook's square as a destination of the king when castling that
   * way is legal, so a king dropped on its rook castles (Chessground's `rookCastle`).
   */
  rookCastle?: boolean;
}

/** Legal destinations for every piece of the side to move, in chessground's format. */
export function legalDests(chess: Chess, options: LegalDestsOptions = {}): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>();
  for (const square of SQUARES) {
    const moves = chess.moves({ square, verbose: true });
    if (moves.length) {
      const targets = moves.map((m) => m.to);
      if (options.rookCastle) {
        for (const move of moves) {
          if (move.isKingsideCastle()) targets.push(`h${move.to[1]}` as Square);
          else if (move.isQueensideCastle()) targets.push(`a${move.to[1]}` as Square);
        }
      }
      dests.set(square, targets);
    }
  }
  return dests;
}

/** Adds the rook squares to the king's destinations when its castling moves are among them. */
export function withRookCastleDests(fen: Fen, dests: Map<Square, Square[]>): Map<Square, Square[]> {
  const placement = fen.split(' ')[0] ?? '';
  let out: Map<Square, Square[]> | null = null;
  for (const [kingSquare, king, rank] of [
    ['e1', 'K', '1'],
    ['e8', 'k', '8'],
  ] as const) {
    const targets = dests.get(kingSquare);
    if (!targets || pieceAt(placement, kingSquare) !== king) continue;
    const extra: Square[] = [];
    if (targets.includes(`g${rank}`) && !targets.includes(`h${rank}`)) extra.push(`h${rank}`);
    if (targets.includes(`c${rank}`) && !targets.includes(`a${rank}`)) extra.push(`a${rank}`);
    if (extra.length) {
      out ??= new Map(dests);
      out.set(kingSquare, [...targets, ...extra]);
    }
  }
  return out ?? dests;
}

/**
 * The destination to report when a king is dropped on its own rook to castle
 * (`e1` → `h1` means `e1` → `g1`); any other move is returned unchanged.
 */
export function castlingKingDest(fen: Fen, from: Square, to: Square): Square {
  const placement = fen.split(' ')[0] ?? '';
  const king = pieceAt(placement, from);
  if (king !== 'K' && king !== 'k') return to;
  const rank = from[1] ?? '';
  if (!from.startsWith('e') || !to.endsWith(rank)) return to;
  const rook = pieceAt(placement, to);
  if (rook !== (king === 'K' ? 'R' : 'r')) return to;
  if (to.startsWith('h')) return `g${rank}` as Square;
  if (to.startsWith('a')) return `c${rank}` as Square;
  return to;
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
    const move = chess.move(input);
    // chess.js reads "--" as a null move (the turn passes): no board or engine here can play that.
    if (move.san === '--') {
      chess.undo();
      return null;
    }
    return move;
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

// Lowercase only: "B2c3" is a rank-disambiguated bishop move, not coordinates.
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
// A pawn reaching the last rank with no piece named: "e8", "dxe8", "e7e8".
const PROMOTION_SAN_RE = /^(?:[a-h]x)?[a-h][18][+#]?$/;
const PROMOTION_UCI_RE = /^[a-h][27][a-h][18]$/;

/**
 * Whether typed text is a promotion that leaves the piece out ("e8", "dxe1",
 * "e7e8"). Such a move needs "=Q", "=R", "=B" or "=N" unless auto-queen is on.
 */
export function isPromotionShorthand(notation: string): boolean {
  const trimmed = notation.trim();
  return PROMOTION_SAN_RE.test(trimmed) || PROMOTION_UCI_RE.test(trimmed);
}

export interface TryNotationOptions {
  /** Complete a promotion typed without a piece ("e8", "e7e8") as a queen. */
  autoQueen?: boolean;
}

/**
 * Plays a move typed by the user, as SAN ("Nf3", "exd8=Q", "O-O") or coordinates
 * ("g1f3", "e7e8q"); null when illegal. Forgiving about case: "nf3", "a8=q" and
 * "o-o" are read as the moves they mean, but a pawn move such as "b3" or "bxc3"
 * is always tried first. With `autoQueen`, "e8" and "e7e8" promote to a queen.
 */
export function tryNotation(
  chess: Chess,
  notation: string,
  options: TryNotationOptions = {},
): Move | null {
  const trimmed = notation.trim();
  if (UCI_RE.test(trimmed)) {
    const input = parseUci(trimmed);
    if (!input.promotion && options.autoQueen && isPromotionMove(chess, input.from, input.to)) {
      return tryMove(chess, { ...input, promotion: 'q' });
    }
    return tryMove(chess, input);
  }
  const castled = trimmed
    .replace(/^[oO0]-[oO0]-[oO0]/, 'O-O-O')
    .replace(/^[oO0]-[oO0](?!-)/, 'O-O');
  const promoted = castled.replace(
    /=([qrbn])([+#]?)$/,
    (_, p: string, s: string) => `=${p.toUpperCase()}${s}`,
  );
  const move = tryMove(chess, promoted);
  if (move) return move;
  // A lowercase piece letter: "nf3", "qxf7", "kd2", "bxc3" when no pawn can take on c3.
  if (/^[kqrbn]/.test(promoted)) {
    const upper = tryMove(chess, promoted.charAt(0).toUpperCase() + promoted.slice(1));
    if (upper) return upper;
  }
  if (options.autoQueen && PROMOTION_SAN_RE.test(promoted)) {
    return tryMove(chess, promoted.replace(/([a-h][18])([+#]?)$/, '$1=Q$2'));
  }
  return null;
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

/**
 * Whether `color` could still deliver mate by some sequence of legal moves —
 * the test for a flag fall: when the side with time left cannot mate, the game
 * is drawn rather than won (FIDE 6.9). A queen, rook or pawn can always mate;
 * a lone minor piece only with the defender's own men to box its king in;
 * bishops alone that all stand on one square colour never can.
 */
export function canStillMate(chess: Chess, color: LongColor): boolean {
  const mine: { type: string; square: Square }[] = [];
  let defenders = 0;
  const side = color === 'white' ? 'w' : 'b';
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type === 'k') continue;
      if (piece.color === side) mine.push(piece);
      else defenders++;
    }
  }
  if (mine.some((p) => p.type === 'p' || p.type === 'r' || p.type === 'q')) return true;
  if (mine.length === 0) return false;
  // The defender's own pieces can block its king's escape squares.
  if (defenders > 0) return true;
  if (mine.length === 1) return false;
  const shade = (square: Square) => (square.charCodeAt(0) + Number(square[1])) % 2;
  const bishops = mine.filter((p) => p.type === 'b');
  if (bishops.length === mine.length && new Set(bishops.map((b) => shade(b.square))).size === 1) {
    return false;
  }
  return true;
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

/**
 * The position with the other side to move (a "null move"), for asking what
 * that side threatens: the en passant square goes, as it belongs to the move
 * just made. Null when the side passing is in check (its king could simply be
 * taken) or the result is not a position chess.js accepts.
 */
export function passMove(fen: Fen): Fen | null {
  const parts = fen.split(' ');
  if (parts.length < 4) return null;
  const passer = parts[1] === 'b' ? 'b' : 'w';
  parts[1] = passer === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const flipped = parts.join(' ');
  try {
    const chess = new Chess(flipped);
    const king = chess.findPiece({ type: 'k', color: passer })[0];
    if (!king || chess.isAttacked(king, chess.turn())) return null;
    return flipped;
  } catch {
    return null;
  }
}

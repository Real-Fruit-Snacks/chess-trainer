import type { Color, PieceSymbol, Square } from 'chess.js';
import { Chess as Position } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { SquareSet } from 'chessops/squareSet';
import type { CastlingSide, NormalMove, Role } from 'chessops/types';
import {
  charToRole,
  kingCastlesTo,
  makeSquare,
  opposite,
  parseSquare,
  roleToChar,
  squareFile,
  squareRank,
} from 'chessops/util';
import type { GameStatus } from './helpers';
import { START_FEN } from './startFen';
import type { Fen, LongColor, MoveInput, PromotionPiece, San, Uci } from './types';

/**
 * Chess960 (Fischer random chess) on chessops: for a Chess960 position, what
 * chess.js gives for standard chess — the legal moves for a board, a move with
 * its SAN and the position after it, and the end of the game (mate,
 * stalemate, insufficient material, threefold repetition, fifty moves) —
 * plus the 960 start positions by number (Scharnagl's numbering, in which 518
 * is the classical position) and a random one.
 *
 * Castling is the king moving onto its own rook: that is how a board drops
 * it (chessground with `rookCastle`) and how Stockfish writes it with
 * `UCI_Chess960` on ("e1h1"). Standard-style UCI that can only mean castling
 * (the king going straight to its castling square, "e1g1") is read too. SAN
 * stays O-O and O-O-O.
 *
 * FENs are written in X-FEN: KQkq while the castling rooks are the outermost
 * ones on their side of the king, the rook's file otherwise ("Bb"). chessops
 * and Stockfish read both that and Shredder-FEN ("HAha").
 *
 * No React and no DOM: the board pages, the game review and the online game
 * all build on these few functions and `Chess960Game`.
 */

/** The number of the classical start position (RNBQKBNR) in the standard numbering. */
export const CLASSICAL_CHESS960 = 518;

/** How many start positions there are: numbered 0 to 959. */
export const CHESS960_POSITIONS = 960;

/** The knights' places among the five squares left after the bishops and the queen. */
const KNIGHT_PLACES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
  [3, 4],
];

function isPositionNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n < CHESS960_POSITIONS;
}

/** The indices of the still empty squares of a back rank being filled. */
function emptyFiles(rank: readonly (string | null)[]): number[] {
  return rank.flatMap((piece, file) => (piece ? [] : [file]));
}

/**
 * White's pieces on the first rank of start position `n` (0–959), from the a-file
 * to the h-file: "RNBQKBNR" for 518, "BBQNNRKR" for 0. Throws a RangeError for
 * any other number.
 */
export function chess960BackRank(n: number): string {
  if (!isPositionNumber(n)) throw new RangeError(`There is no Chess960 position ${n}.`);
  const rank: (string | null)[] = Array.from({ length: 8 }, () => null);
  let rest = n;
  // The light-squared bishop on b, d, f or h; the dark-squared one on a, c, e or g.
  rank[(rest % 4) * 2 + 1] = 'B';
  rest = Math.floor(rest / 4);
  rank[(rest % 4) * 2] = 'B';
  rest = Math.floor(rest / 4);
  const forQueen = emptyFiles(rank)[rest % 6];
  if (forQueen !== undefined) rank[forQueen] = 'Q';
  rest = Math.floor(rest / 6);
  const forKnights = emptyFiles(rank);
  for (const place of KNIGHT_PLACES[rest] ?? []) {
    const file = forKnights[place];
    if (file !== undefined) rank[file] = 'N';
  }
  // The king between the rooks on the three squares left.
  const [left, middle, right] = emptyFiles(rank);
  if (left !== undefined) rank[left] = 'R';
  if (middle !== undefined) rank[middle] = 'K';
  if (right !== undefined) rank[right] = 'R';
  return rank.join('');
}

/**
 * The number (0–959) of a first rank such as "RNBQKBNR", or null when it is no
 * Chess960 start: two bishops on squares of both colours, the king between
 * the rooks, a queen and two knights.
 */
export function chess960NumberOfBackRank(backRank: string): number | null {
  if (!/^[KQRBN]{8}$/.test(backRank)) return null;
  const files = [...backRank];
  const bishops = files.flatMap((piece, file) => (piece === 'B' ? [file] : []));
  const light = bishops.find((file) => file % 2 === 1);
  const dark = bishops.find((file) => file % 2 === 0);
  if (bishops.length !== 2 || light === undefined || dark === undefined) return null;
  const withoutBishops = files.flatMap((piece, file) => (piece === 'B' ? [] : [file]));
  const queen = withoutBishops.findIndex((file) => files[file] === 'Q');
  const rest = withoutBishops.filter((file) => files[file] !== 'Q');
  const knights = rest.flatMap((file, index) => (files[file] === 'N' ? [index] : []));
  const pair = KNIGHT_PLACES.findIndex(([a, b]) => a === knights[0] && b === knights[1]);
  if (queen < 0 || knights.length !== 2 || pair < 0) return null;
  const n = pair * 96 + queen * 16 + (dark / 2) * 4 + (light - 1) / 2;
  // The king between the rooks, and nothing else out of place.
  return chess960BackRank(n) === backRank ? n : null;
}

/** The FEN of start position `n` (0–959). Throws a RangeError for any other number. */
export function chess960StartFen(n: number): Fen {
  const white = chess960BackRank(n);
  return `${white.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${white} w KQkq - 0 1`;
}

/** A start position chosen at random, with its number. */
export function randomChess960(random: () => number = Math.random): { number: number; fen: Fen } {
  const n = Math.min(
    CHESS960_POSITIONS - 1,
    Math.max(0, Math.floor(random() * CHESS960_POSITIONS)),
  );
  return { number: n, fen: chess960StartFen(n) };
}

/* ------------------------------------------------------------------ */
/* Positions                                                           */
/* ------------------------------------------------------------------ */

/** A position chessops can play, or null when the FEN is none (or a variant's, with pockets). */
function load(fen: string): Position | null {
  const text = fen.trim();
  if (!text) return null;
  const setup = parseFen(text).unwrap(
    (value) => value,
    () => null,
  );
  if (!setup || setup.pockets || setup.remainingChecks) return null;
  return Position.fromSetup(setup).unwrap(
    (position) => position,
    () => null,
  );
}

function fenOf(pos: Position): Fen {
  return makeFen(pos.toSetup());
}

/** What counts for a repetition: the pieces, the side to move, castling and en passant rights. */
function repetitionKey(pos: Position): string {
  return makeFen(pos.toSetup(), { epd: true });
}

/**
 * The FEN of a Chess960 position as the app keeps it (X-FEN), or null when the
 * text is not a legal position. 4- and 5-field FENs are completed; castling
 * rights whose rook is missing or whose king has left the back rank are
 * dropped, and so is an en passant square no pawn can take on.
 */
export function normalizeChess960Fen(fen: string): Fen | null {
  const pos = load(fen);
  return pos ? fenOf(pos) : null;
}

/**
 * Whether a FEN can only be a Chess960 position: a castling right given by
 * the rook's file (Shredder-FEN "HAha", X-FEN "Bb"), which standard chess
 * never needs, or one of the 959 start positions other than the classical one,
 * with its castling rights. (KQkq with the king elsewhere is left to standard
 * chess, which drops such rights as stale: a diagram tool writes them too.)
 */
export function isChess960Fen(fen: string): boolean {
  const castling = fen.trim().split(/\s+/)[2] ?? '-';
  if (castling === '-') return false;
  if (/[A-Ha-h]/.test(castling)) return normalizeChess960Fen(fen) !== null;
  const n = chess960Number(fen);
  return n !== null && n !== CLASSICAL_CHESS960;
}

/**
 * The number (0–959) of the start position a FEN shows — the pieces as they
 * start, White to move, every castling right — or null when it shows none.
 */
export function chess960Number(fen: Fen): number | null {
  const normal = normalizeChess960Fen(fen);
  if (!normal) return null;
  const [placement = ''] = normal.split(' ');
  const white = placement.split('/')[7] ?? '';
  const n = chess960NumberOfBackRank(white);
  if (n === null) return null;
  const start = chess960StartFen(n).split(' ').slice(0, 4).join(' ');
  return normal.split(' ').slice(0, 4).join(' ') === start ? n : null;
}

/** The pieces of chessops as chess.js names them. */
function symbolOf(role: Role): PieceSymbol {
  return roleToChar(role);
}

function colorOf(color: 'white' | 'black'): Color {
  return color === 'white' ? 'w' : 'b';
}

function squareName(square: number): Square {
  return makeSquare(square);
}

/** Legal destinations of the side to move, for chessground: castling is the king onto its rook. */
function destsOf(pos: Position): Map<Square, Square[]> {
  return chessgroundDests(pos, { chess960: true });
}

/** A pawn reaching its last rank, which needs a promotion piece. */
function promotes(pos: Position, from: number, to: number): boolean {
  return pos.board.pawn.has(from) && SquareSet.backranks().has(to);
}

/**
 * A board or UCI move made ready to play: the king going straight to its
 * castling square, two or more files away (standard UCI's "e1g1"), becomes the
 * king onto its rook. A king one step from that square moves there normally.
 */
function asChess960Move(pos: Position, move: NormalMove): NormalMove {
  const piece = pos.board.get(move.from);
  if (piece?.role !== 'king' || piece.color !== pos.turn || move.promotion) return move;
  if (pos.board[pos.turn].has(move.to)) return move;
  if (squareRank(move.from) !== squareRank(move.to)) return move;
  if (Math.abs(squareFile(move.to) - squareFile(move.from)) < 2) return move;
  for (const side of ['a', 'h'] as const) {
    const rook = pos.castles.rook[pos.turn][side];
    if (rook !== undefined && kingCastlesTo(pos.turn, side) === move.to) {
      return { from: move.from, to: rook };
    }
  }
  return move;
}

/**
 * Whether a move is legal as given: its destination among the piece's moves
 * (a castling king's is its rook) and a promotion piece exactly when a pawn
 * reaches its last rank. Stricter than chessops' `isLegal`, which would also
 * castle a king sent two squares the wrong way.
 */
function isLegal(pos: Position, move: NormalMove): boolean {
  if (move.promotion === 'king' || move.promotion === 'pawn') return false;
  if (promotes(pos, move.from, move.to) !== (move.promotion !== undefined)) return false;
  return pos.dests(move.from).has(move.to);
}

/** The castling side of a legal move: the king onto its own rook. */
function castlingSideOf(pos: Position, move: NormalMove): CastlingSide | null {
  if (!pos.board.king.has(move.from) || !pos.board[pos.turn].has(move.to)) return null;
  return move.to > move.from ? 'h' : 'a';
}

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function moveFromUci(uci: string): NormalMove | null {
  if (!UCI_RE.test(uci)) return null;
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  if (from === undefined || to === undefined) return null;
  const promotion = uci[4] ? charToRole(uci[4]) : undefined;
  return promotion ? { from, to, promotion } : { from, to };
}

function moveFromInput(input: MoveInput): NormalMove | null {
  const from = parseSquare(input.from);
  const to = parseSquare(input.to);
  if (from === undefined || to === undefined) return null;
  const promotion = input.promotion ? charToRole(input.promotion) : undefined;
  return promotion ? { from, to, promotion } : { from, to };
}

/**
 * SAN as a board player or a PGN may write it: canonical SAN first, then the
 * spellings chessops does not take — "0-0", long algebraic ("Ng1-f3", "e2e4").
 */
function moveFromSan(pos: Position, text: string): NormalMove | null {
  const san = text
    .trim()
    .replace(/[!?]+$/, '')
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O');
  const parsed = parseSan(pos, san);
  if (parsed && 'from' in parsed) return parsed;
  const long = /^([KQRBN]?)([a-h][1-8])[-x]?([a-h][1-8])(?:=?([QRBNqrbn]))?[+#]?$/.exec(san);
  if (!long) return null;
  const move = moveFromUci(`${long[2] ?? ''}${long[3] ?? ''}${(long[4] ?? '').toLowerCase()}`);
  if (!move) return null;
  // The piece named must be the one on the square: "Ng1-f3" is no bishop move.
  const role = pos.board.getRole(move.from);
  const named = long[1] === '' || long[1] === undefined ? 'P' : long[1];
  if (role && named !== roleToChar(role).toUpperCase()) return null;
  return asChess960Move(pos, move);
}

/** Reads a move given as squares, UCI or SAN; null when it is not one. */
function readMove(pos: Position, input: MoveInput | string): NormalMove | null {
  if (typeof input !== 'string') {
    const move = moveFromInput(input);
    return move ? asChess960Move(pos, move) : null;
  }
  const text = input.trim();
  const uci = moveFromUci(text);
  if (uci) return asChess960Move(pos, uci);
  return moveFromSan(pos, text);
}

/** A move played in a Chess960 game, shaped like a chess.js move where the two agree. */
export interface Chess960Move {
  color: Color;
  piece: PieceSymbol;
  from: Square;
  /** Where the move goes; for castling, the castling rook's square (the king "takes" its rook). */
  to: Square;
  promotion?: PromotionPiece;
  captured?: PieceSymbol;
  /**
   * chess.js's flags: n (a quiet move), b (a pawn's double step), e (en passant),
   * c (a capture), p (a promotion), k (O-O) and q (O-O-O).
   */
  flags: string;
  san: San;
  /** The move in UCI as Stockfish writes it with `UCI_Chess960` on: castling as "e1h1". */
  uci: Uci;
  /** O-O ('h', towards the h-file) or O-O-O ('a'), for a castling move. */
  castle?: CastlingSide;
  /** The position before the move. */
  before: Fen;
  /** The position after the move. */
  after: Fen;
}

/** Plays a legal move on `pos` and describes it. */
function playOn(pos: Position, move: NormalMove): Chess960Move {
  const before = fenOf(pos);
  const mover = pos.turn;
  const piece = pos.board.get(move.from);
  const side = castlingSideOf(pos, move);
  const enPassant =
    piece?.role === 'pawn' &&
    squareFile(move.from) !== squareFile(move.to) &&
    !pos.board.occupied.has(move.to);
  const target = side ? undefined : pos.board.get(move.to);
  const captured: PieceSymbol | undefined = enPassant
    ? 'p'
    : target
      ? symbolOf(target.role)
      : undefined;
  const san = makeSan(pos, move);
  pos.play(move);
  let flags = '';
  if (side) flags = side === 'h' ? 'k' : 'q';
  else {
    if (enPassant) flags += 'e';
    else if (captured) flags += 'c';
    if (piece?.role === 'pawn' && Math.abs(move.to - move.from) === 16) flags += 'b';
    if (move.promotion) flags += 'p';
    if (!flags) flags = 'n';
  }
  const from = squareName(move.from);
  const to = squareName(move.to);
  const promotion = move.promotion ? (symbolOf(move.promotion) as PromotionPiece) : undefined;
  return {
    color: colorOf(mover),
    piece: piece ? symbolOf(piece.role) : 'p',
    from,
    to,
    ...(promotion ? { promotion } : {}),
    ...(captured ? { captured } : {}),
    flags,
    san,
    uci: `${from}${to}${promotion ?? ''}`,
    ...(side ? { castle: side } : {}),
    before,
    after: fenOf(pos),
  };
}

/** The status of a position, given whether it has now come up three times. */
function statusOf(pos: Position, threefold: boolean): GameStatus {
  const ctx = pos.ctx();
  if (pos.isCheckmate(ctx)) {
    const winner: LongColor = opposite(pos.turn);
    return { over: true, result: winner === 'white' ? '1-0' : '0-1', reason: 'checkmate', winner };
  }
  if (pos.isStalemate(ctx)) {
    return { over: true, result: '1/2-1/2', reason: 'stalemate', winner: null };
  }
  if (pos.isInsufficientMaterial()) {
    return { over: true, result: '1/2-1/2', reason: 'insufficient material', winner: null };
  }
  if (threefold) {
    return { over: true, result: '1/2-1/2', reason: 'threefold repetition', winner: null };
  }
  if (pos.halfmoves >= 100) {
    return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', winner: null };
  }
  return { over: false, result: '*', reason: null, winner: null };
}

function checkedKingOf(pos: Position): Square | null {
  if (!pos.isCheck()) return null;
  const king = pos.board.kingOf(pos.turn);
  return king === undefined ? null : squareName(king);
}

/** A position seen on its own, without the moves that led to it. */
export interface Chess960Position {
  fen: Fen;
  turn: LongColor;
  /** Legal destinations, for chessground (castling as the king onto its rook). */
  dests: Map<Square, Square[]>;
  inCheck: boolean;
  checkedKing: Square | null;
  /** The move number of the side to move. */
  moveNumber: number;
  /** Mate, stalemate, insufficient material or fifty moves (repetition needs the game). */
  status: GameStatus;
}

/** A Chess960 position's state, or null when the FEN is no legal position. */
export function chess960Position(fen: Fen): Chess960Position | null {
  const pos = load(fen);
  if (!pos) return null;
  return {
    fen: fenOf(pos),
    turn: pos.turn,
    dests: destsOf(pos),
    inCheck: pos.isCheck(),
    checkedKing: checkedKingOf(pos),
    moveNumber: pos.fullmoves,
    status: statusOf(pos, false),
  };
}

/**
 * The position with the other side to move (a "null move"), for asking what
 * that side threatens: the en passant square goes. Null when the side passing
 * is in check (its king could simply be taken). The Chess960 `passMove`.
 */
export function passChess960(fen: Fen): Fen | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return null;
  parts[1] = parts[1] === 'b' ? 'w' : 'b';
  parts[3] = '-';
  // chessops refuses a position whose side not to move is in check: exactly the case.
  return normalizeChess960Fen(parts.join(' '));
}

/**
 * Whether anyone may still castle in a position. Without castling rights,
 * Chess960 and standard chess play the same: chess.js reads such a position
 * as it is (the drills, which play by standard chess, can take it).
 */
export function hasCastlingRights(fen: Fen): boolean {
  const castling = fen.trim().split(/\s+/)[2];
  return castling !== undefined && castling !== '-';
}

/** Legal destinations for chessground in a Chess960 position (none for a FEN that is no position). */
export function chess960Dests(fen: Fen): Map<Square, Square[]> {
  const pos = load(fen);
  return pos ? destsOf(pos) : new Map<Square, Square[]>();
}

/**
 * Plays a move — squares from a board, UCI ("e1h1" or "e1g1" for castling) or
 * SAN ("O-O", "Nf3") — in a Chess960 position. Null when the position or the
 * move is not legal (never throws).
 */
export function playChess960(fen: Fen, input: MoveInput | string): Chess960Move | null {
  const pos = load(fen);
  if (!pos) return null;
  const move = readMove(pos, input);
  return move && isLegal(pos, move) ? playOn(pos, move) : null;
}

export interface Chess960NotationOptions {
  /** Complete a promotion typed without its piece ("e8", "e7e8") as a queen. */
  autoQueen?: boolean;
}

/**
 * Plays a move typed by a person, forgiving as the standard-chess helper is
 * (`tryNotation`): "nf3", "o-o", "0-0-0", "a8=q", "e7e8"; with `autoQueen` a
 * promotion without its piece becomes a queen. Null when illegal.
 */
export function playChess960Typed(
  fen: Fen,
  text: string,
  options: Chess960NotationOptions = {},
): Chess960Move | null {
  const pos = load(fen);
  if (!pos) return null;
  const trimmed = text.trim();
  const attempt = (candidate: string): Chess960Move | null => {
    const move = readMove(pos, candidate);
    return move && isLegal(pos, move) ? playOn(pos, move) : null;
  };
  const uci = moveFromUci(trimmed);
  if (uci) {
    if (!uci.promotion && options.autoQueen && promotes(pos, uci.from, uci.to)) {
      return attempt(`${trimmed}q`);
    }
    return attempt(trimmed);
  }
  const castled = trimmed
    .replace(/^[oO0]-[oO0]-[oO0]/, 'O-O-O')
    .replace(/^[oO0]-[oO0](?!-)/, 'O-O');
  const promoted = castled.replace(
    /=([qrbn])([+#]?)$/,
    (_, piece: string, suffix: string) => `=${piece.toUpperCase()}${suffix}`,
  );
  const played = attempt(promoted);
  if (played) return played;
  // A lowercase piece letter: "nf3", "qxf7", "kd2" — a pawn move such as "b3" was tried first.
  if (/^[kqrbn]/.test(promoted)) {
    const upper = attempt(promoted.charAt(0).toUpperCase() + promoted.slice(1));
    if (upper) return upper;
  }
  if (options.autoQueen && /^(?:[a-h]x)?[a-h][18][+#]?$/.test(promoted)) {
    return attempt(promoted.replace(/([a-h][18])([+#]?)$/, '$1=Q$2'));
  }
  return null;
}

/** Whether moving from `from` to `to` would promote a pawn in this position. */
export function isChess960Promotion(fen: Fen, from: Square, to: Square): boolean {
  const pos = load(fen);
  const a = parseSquare(from);
  const b = parseSquare(to);
  if (!pos || a === undefined || b === undefined) return false;
  return pos.board.getColor(a) === pos.turn && promotes(pos, a, b);
}

/** SAN of a UCI move (an engine's, in either castling form) in a Chess960 position. */
export function chess960UciToSan(fen: Fen, uci: Uci): San | null {
  return playChess960(fen, uci)?.san ?? null;
}

/** An engine line in SAN, up to the first move that is not legal. */
export function chess960LineToSan(fen: Fen, line: readonly Uci[]): San[] {
  const sans: San[] = [];
  let at = fen;
  for (const uci of line) {
    const move = playChess960(at, uci);
    if (!move) break;
    sans.push(move.san);
    at = move.after;
  }
  return sans;
}

/** The engine's UCI (castling as king takes rook) for a SAN move. */
export function chess960SanToUci(fen: Fen, san: San): Uci | null {
  return playChess960(fen, san)?.uci ?? null;
}

/* ------------------------------------------------------------------ */
/* Games                                                               */
/* ------------------------------------------------------------------ */

/** The Seven Tag Roster, in its order, with the values chess.js writes when one is unknown. */
const ROSTER: readonly [string, string][] = [
  ['Event', '?'],
  ['Site', '?'],
  ['Date', '????.??.??'],
  ['Round', '?'],
  ['White', '?'],
  ['Black', '?'],
  ['Result', '*'],
];

/**
 * The tags that make a PGN a Chess960 game: `[Variant "Chess960"]` and its
 * start position, which every Chess960 game names (the classical one too).
 */
export function chess960Headers(startFen: Fen): Record<string, string> {
  return { Variant: 'Chess960', SetUp: '1', FEN: startFen };
}

/** Whether a PGN's Variant tag names Chess960 ("Chess960", "Chess 960", "Fischerandom"…). */
export function isChess960Variant(variant: string | undefined): boolean {
  const name =
    variant
      ?.trim()
      .toLowerCase()
      .replace(/[\s_-]/g, '') ?? '';
  return (
    name === 'chess960' ||
    name === '960' ||
    name === 'fischerandom' ||
    name === 'fischerrandom' ||
    name === 'fischerrandomchess'
  );
}

/**
 * Whether a game is Chess960: its Variant tag says so (as Lichess, chess.com
 * and the app write it), or its start position can only be a Chess960 one
 * (see `isChess960Fen`).
 */
export function isChess960Game(headers: Record<string, string>, startFen?: Fen): boolean {
  if (isChess960Variant(headers.Variant)) return true;
  const fen = startFen ?? headers.FEN;
  return fen ? isChess960Fen(fen) : false;
}

function quoteTag(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * A Chess960 game: the moves from a start position, with what chess.js keeps
 * for standard chess — the history, repetitions, the game's end — and a
 * PGN with the Chess960 tags. A move that is not legal is refused (null).
 */
export class Chess960Game {
  readonly startFen: Fen;
  private positions: Position[];
  private keys: string[];
  private moves: Chess960Move[] = [];

  /** Throws when `startFen` is not a legal position; see `Chess960Game.from`. */
  constructor(startFen: Fen = START_FEN) {
    const start = load(startFen);
    if (!start) throw new Error(`Not a position: ${startFen}`);
    this.startFen = fenOf(start);
    this.positions = [start];
    this.keys = [repetitionKey(start)];
  }

  /** A game from `fen`, or null when it is not a legal position. */
  static from(fen: Fen): Chess960Game | null {
    try {
      return new Chess960Game(fen);
    } catch {
      return null;
    }
  }

  private get pos(): Position {
    return this.positions[this.positions.length - 1] ?? (this.positions[0] as Position);
  }

  fen(): Fen {
    return fenOf(this.pos);
  }

  turn(): LongColor {
    return this.pos.turn;
  }

  /** The moves played from the start, oldest first. */
  history(): Chess960Move[] {
    return [...this.moves];
  }

  /** Legal destinations of the side to move, for chessground. */
  dests(): Map<Square, Square[]> {
    return destsOf(this.pos);
  }

  /** Plays a move (squares, UCI or SAN); null, and nothing played, when it is not legal. */
  move(input: MoveInput | string): Chess960Move | null {
    const next = this.pos.clone();
    const move = readMove(next, input);
    if (!move || !isLegal(next, move)) return null;
    const played = playOn(next, move);
    this.positions.push(next);
    this.keys.push(repetitionKey(next));
    this.moves.push(played);
    return played;
  }

  /** Takes the last move back; null at the start. */
  undo(): Chess960Move | null {
    const last = this.moves.pop();
    if (!last) return null;
    this.positions.pop();
    this.keys.pop();
    return last;
  }

  /** The piece on a square, as chess.js gives it. */
  pieceAt(square: Square): { color: Color; type: PieceSymbol } | null {
    const at = parseSquare(square);
    const piece = at === undefined ? undefined : this.pos.board.get(at);
    return piece ? { color: colorOf(piece.color), type: symbolOf(piece.role) } : null;
  }

  /** Whether moving from `from` to `to` would promote a pawn of the side to move. */
  isPromotion(from: Square, to: Square): boolean {
    return isChess960Promotion(this.fen(), from, to);
  }

  inCheck(): boolean {
    return this.pos.isCheck();
  }

  /** The square of the king in check, if any. */
  checkedKing(): Square | null {
    return checkedKingOf(this.pos);
  }

  /** The current position has come up three times (or more) in this game. */
  isThreefoldRepetition(): boolean {
    const key = this.keys[this.keys.length - 1];
    return this.keys.filter((k) => k === key).length >= 3;
  }

  status(): GameStatus {
    return statusOf(this.pos, this.isThreefoldRepetition());
  }

  isGameOver(): boolean {
    return this.status().over;
  }

  isCheckmate(): boolean {
    return this.pos.isCheckmate();
  }

  /** How many legal moves the side to move has. */
  legalMoveCount(): number {
    let count = 0;
    for (const [from, targets] of this.pos.allDests()) {
      for (const to of targets) {
        // A promotion is four moves, one per piece.
        count += promotes(this.pos, from, to) ? 4 : 1;
      }
    }
    return count;
  }

  /**
   * The game in PGN: the Seven Tag Roster (with `headers` over chess.js's
   * defaults), the other tags given, then Variant, SetUp and FEN.
   */
  pgn(headers: Record<string, string> = {}): string {
    const tags: Record<string, string> = {};
    for (const [key, unknown] of ROSTER) tags[key] = headers[key] ?? unknown;
    const own = chess960Headers(this.startFen);
    for (const [key, value] of Object.entries(headers)) {
      if (!(key in tags) && !(key in own)) tags[key] = value;
    }
    Object.assign(tags, own);
    const header = Object.entries(tags)
      .map(([key, value]) => `[${key} "${quoteTag(value)}"]`)
      .join('\n');
    const [, turn = 'w', , , , full = '1'] = this.startFen.split(' ');
    let number = Number(full) || 1;
    let white = turn === 'w';
    const words: string[] = [];
    for (const [index, move] of this.moves.entries()) {
      if (white) words.push(`${number}.`);
      else if (index === 0) words.push(`${number}...`);
      words.push(move.san);
      if (!white) number += 1;
      white = !white;
    }
    words.push(tags.Result ?? '*');
    return `${header}\n\n${words.join(' ')}`;
  }
}

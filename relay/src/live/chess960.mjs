/**
 * Chess960 (Fischer random chess) in the game rooms, on chessops: the 960
 * start positions by number, as the app numbers them (Scharnagl's numbering,
 * in which 518 is the classical position), and a game the referee plays the
 * way it plays chess on chess.js (rules.mjs): moves in UCI, taken back one at
 * a time, and the endings — mate, stalemate, insufficient material, threefold
 * repetition, fifty moves — and who could still mate when a flag falls.
 *
 * Castling is the king taking its own rook ("e1h1"), as the app's board sends
 * it. A move is legal only when its square is among the piece's destinations
 * (chessops' `dests`, in which a castling king's is its rook): chessops would
 * otherwise take any king move of two files for castling.
 */
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { SquareSet } from 'chessops/squareSet';
import { charToRole, makeSquare, parseSquare, roleToChar } from 'chessops/util';

/** How many start positions there are: numbered 0 to 959. */
export const CHESS960_POSITIONS = 960;

/** The knights' places among the five squares left after the bishops and the queen. */
const KNIGHT_PLACES = [
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

/** Whether `n` numbers a start position (0–959). @param {unknown} n @returns {n is number} */
export function isChess960Position(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < CHESS960_POSITIONS;
}

/**
 * White's first rank in start position `n`, from the a-file to the h-file:
 * "RNBQKBNR" for 518, "BBQNNRKR" for 0 (the app's `chess960BackRank`).
 * @param {number} n
 */
export function chess960BackRank(n) {
  if (!isChess960Position(n)) throw new RangeError(`There is no Chess960 position ${n}.`);
  /** @type {(string | null)[]} */
  const rank = Array.from({ length: 8 }, () => null);
  const empty = () => rank.flatMap((piece, file) => (piece ? [] : [file]));
  let rest = n;
  // The light-squared bishop on b, d, f or h; the dark-squared one on a, c, e or g.
  rank[(rest % 4) * 2 + 1] = 'B';
  rest = Math.floor(rest / 4);
  rank[(rest % 4) * 2] = 'B';
  rest = Math.floor(rest / 4);
  rank[/** @type {number} */ (empty()[rest % 6])] = 'Q';
  rest = Math.floor(rest / 6);
  const forKnights = empty();
  for (const place of /** @type {number[]} */ (KNIGHT_PLACES[rest])) {
    rank[/** @type {number} */ (forKnights[place])] = 'N';
  }
  // The king between the rooks, on the three squares left.
  const [left, middle, right] = /** @type {number[]} */ (empty());
  rank[/** @type {number} */ (left)] = 'R';
  rank[/** @type {number} */ (middle)] = 'K';
  rank[/** @type {number} */ (right)] = 'R';
  return rank.join('');
}

/** The FEN of start position `n` (0–959), as the app writes it. @param {number} n */
export function chess960StartFen(n) {
  const white = chess960BackRank(n);
  return `${white.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${white} w KQkq - 0 1`;
}

/** A start position's number drawn at random, each of the 960 as likely. */
export function randomChess960Position() {
  // 65,280 is 68 × 960: a draw above it would favour the low numbers, so it is drawn again.
  const draw = new Uint16Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    const value = /** @type {number} */ (draw[0]);
    if (value < 65_280) return value % CHESS960_POSITIONS;
  }
}

/** @typedef {import('chessops/chess').Chess} Position */
/** @typedef {import('chessops/types').NormalMove} NormalMove */

/** The position a FEN gives, or null when it is not a legal one. @param {string} fen */
function load(fen) {
  const setup = parseFen(fen.trim()).unwrap(
    (value) => value,
    () => null,
  );
  if (!setup) return null;
  return Chess.fromSetup(setup).unwrap(
    (position) => position,
    () => null,
  );
}

/** What counts for a repetition: the pieces, the side to move, castling and en passant. */
const repetitionKey = (/** @type {Position} */ pos) => makeFen(pos.toSetup(), { epd: true });

/**
 * A move as the board and the room write it ({from, to, promotion}), when it
 * is legal in `pos`: its square among the piece's destinations (the rook's,
 * for castling), and a promotion piece exactly when a pawn reaches the last rank.
 * @param {Position} pos
 * @param {{ from: string, to: string, promotion?: string }} input
 * @returns {NormalMove | null}
 */
function legalMove(pos, input) {
  const from = parseSquare(input.from);
  const to = parseSquare(input.to);
  if (from === undefined || to === undefined) return null;
  const promotion = input.promotion ? charToRole(input.promotion) : undefined;
  if (input.promotion && !['queen', 'rook', 'bishop', 'knight'].includes(promotion ?? '')) {
    return null;
  }
  const promotes = pos.board.pawn.has(from) && SquareSet.backranks().has(to);
  if (promotes !== (promotion !== undefined)) return null;
  if (!pos.dests(from).has(to)) return null;
  return promotion ? { from, to, promotion } : { from, to };
}

/**
 * A Chess960 game from its start position, with the few things the referee
 * asks of chess.js's: `move` (null when the move is not legal), `undo`,
 * `turn`, `board`, and how the game stands.
 */
export class Chess960Game {
  /**
   * @param {string} startFen a legal position (it throws for anything else)
   */
  constructor(startFen) {
    const start = load(startFen);
    if (!start) throw new Error(`Not a position: ${startFen}`);
    /** @type {Position[]} */
    this.positions = [start];
    /** @type {string[]} */
    this.keys = [repetitionKey(start)];
  }

  /** The position now. */
  get pos() {
    return /** @type {Position} */ (this.positions[this.positions.length - 1]);
  }

  /**
   * Plays a move; null, and nothing played, when it is not legal.
   * @param {{ from: string, to: string, promotion?: string }} input
   * @returns {{ color: 'w' | 'b', from: string, to: string, promotion?: string, san: string } | null}
   */
  move(input) {
    const pos = this.pos;
    const move = legalMove(pos, input);
    if (!move) return null;
    const san = makeSan(pos, move);
    const next = pos.clone();
    next.play(move);
    this.positions.push(next);
    this.keys.push(repetitionKey(next));
    return {
      color: pos.turn === 'white' ? 'w' : 'b',
      from: makeSquare(move.from),
      to: makeSquare(move.to),
      ...(move.promotion ? { promotion: roleToChar(move.promotion) } : {}),
      san,
    };
  }

  /** Takes the last move back (nothing at the start). */
  undo() {
    if (this.positions.length <= 1) return null;
    this.positions.pop();
    this.keys.pop();
    return true;
  }

  /** @returns {'w' | 'b'} */
  turn() {
    return this.pos.turn === 'white' ? 'w' : 'b';
  }

  fen() {
    return makeFen(this.pos.toSetup());
  }

  /**
   * The pieces as chess.js's `board()` gives them: the eighth rank first, each
   * from the a-file, an empty square null.
   * @returns {({ square: string, type: string, color: 'w' | 'b' } | null)[][]}
   */
  board() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      const row = [];
      for (let file = 0; file < 8; file++) {
        const square = rank * 8 + file;
        const piece = this.pos.board.get(square);
        row.push(
          piece
            ? {
                square: makeSquare(square),
                type: roleToChar(piece.role),
                color: /** @type {'w' | 'b'} */ (piece.color === 'white' ? 'w' : 'b'),
              }
            : null,
        );
      }
      rows.push(row);
    }
    return rows;
  }

  isCheck() {
    return this.pos.isCheck();
  }

  isCheckmate() {
    return this.pos.isCheckmate();
  }

  isStalemate() {
    return this.pos.isStalemate();
  }

  isInsufficientMaterial() {
    return this.pos.isInsufficientMaterial();
  }

  /** The position now has come up three times (or more) in this game. */
  isThreefoldRepetition() {
    const key = this.keys[this.keys.length - 1];
    return this.keys.filter((k) => k === key).length >= 3;
  }

  isDrawByFiftyMoves() {
    return this.pos.halfmoves >= 100;
  }
}

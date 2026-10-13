import type { PieceSymbol, Square } from 'chess.js';
import type { MoveInput, PromotionPiece, Uci } from './types';

/**
 * A small, fast move generator for searches chess.js is too slow for (the
 * blunder check's capture search): an 0x88 board where a move made and taken
 * back costs a few array writes — no SAN, FEN or move objects with history.
 *
 * It follows chess.js exactly: the same rules (castling rights as the FEN
 * gives them, an en passant square only after a double step next to an enemy
 * pawn) and the same move order (squares a8 to h1, each piece's directions in
 * chess.js's order, promotions N B R Q, castling last), so a search over
 * either visits the same moves in the same order. Positions come from FEN;
 * make and unmake are exact inverses.
 */

const WHITE = 0;
const BLACK = 8;
type Side = typeof WHITE | typeof BLACK;

const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;

/** Move flags, numbered as chess.js numbers them. */
const NORMAL = 1;
export const CAPTURE = 2;
const BIG_PAWN = 4;
export const EP_CAPTURE = 8;
export const PROMOTION = 16;
const KSIDE_CASTLE = 32;
const QSIDE_CASTLE = 64;

const SYMBOLS: readonly PieceSymbol[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const TYPES: Readonly<Record<string, number>> = {
  p: PAWN,
  n: KNIGHT,
  b: BISHOP,
  r: ROOK,
  q: QUEEN,
  k: KING,
};

/** Push, double step, then the two captures, as chess.js lists them. */
const PAWN_OFFSETS: Readonly<Record<Side, readonly [number, number, number, number]>> = {
  [WHITE]: [-16, -32, -17, -15],
  [BLACK]: [16, 32, 17, 15],
};
const KNIGHT_OFFSETS: readonly number[] = [-18, -33, -31, -14, 18, 33, 31, 14];
const BISHOP_OFFSETS: readonly number[] = [-17, -15, 17, 15];
const ROOK_OFFSETS: readonly number[] = [-16, 1, 16, -1];
const ROYAL_OFFSETS: readonly number[] = [-17, -16, -15, 1, 17, 16, 15, -1];
/** Directions by piece type (pawns have their own). */
const PIECE_OFFSETS: readonly (readonly number[])[] = [
  [],
  [],
  KNIGHT_OFFSETS,
  BISHOP_OFFSETS,
  ROOK_OFFSETS,
  ROYAL_OFFSETS,
  ROYAL_OFFSETS,
];
const PROMOTIONS: readonly number[] = [KNIGHT, BISHOP, ROOK, QUEEN];

const onBoard = (square: number) => (square & 0x88) === 0;
const other = (side: Side): Side => (side === WHITE ? BLACK : WHITE);

/** A move on the 0x88 board; piece types are the numbers above, 0 for none. */
export interface QuickMove {
  from: number;
  to: number;
  piece: number;
  captured: number;
  promotion: number;
  flags: number;
}

interface Undo {
  move: QuickMove;
  /** What stood on the target square (nothing for en passant and castling). */
  target: number;
  castlingW: number;
  castlingB: number;
  ep: number;
  kingW: number;
  kingB: number;
}

/** The square's name: 0 is a8, 119 is h1. */
export function squareName(square: number): Square {
  return `${'abcdefgh'.charAt(square & 7)}${8 - (square >> 4)}` as Square;
}

/** The 0x88 index of a square name. */
export function squareIndex(square: Square): number {
  return (8 - Number(square.charAt(1))) * 16 + (square.charCodeAt(0) - 97);
}

function pieceSymbol(type: number): PieceSymbol {
  return SYMBOLS[type - 1] ?? 'p';
}

export function quickUci(move: QuickMove): Uci {
  const promotion = move.promotion ? pieceSymbol(move.promotion) : '';
  return `${squareName(move.from)}${squareName(move.to)}${promotion}`;
}

/** The move as chess.js takes it. */
export function quickInput(move: QuickMove): MoveInput {
  const from = squareName(move.from);
  const to = squareName(move.to);
  return move.promotion
    ? { from, to, promotion: pieceSymbol(move.promotion) as PromotionPiece }
    : { from, to };
}

export class QuickBoard {
  /** Piece codes: type plus 8 for Black; 0 is an empty square. */
  private readonly board = new Uint8Array(128);
  private turn: Side = WHITE;
  private castlingW = 0;
  private castlingB = 0;
  private ep = -1;
  private kingW = -1;
  private kingB = -1;
  private readonly history: Undo[] = [];

  /** Reads a FEN that chess.js accepts (it is not checked again here). */
  static fromFen(fen: string): QuickBoard {
    const quick = new QuickBoard();
    const [placement = '', turn = 'w', castling = '-', ep = '-'] = fen.trim().split(/\s+/);
    let square = 0;
    for (const char of placement) {
      if (char === '/') {
        square += 8;
      } else if (char >= '1' && char <= '8') {
        square += Number(char);
      } else {
        const type = TYPES[char.toLowerCase()];
        if (type === undefined) throw new Error(`Not a piece: ${char}`);
        const side: Side = char === char.toLowerCase() ? BLACK : WHITE;
        quick.board[square] = side | type;
        if (type === KING) {
          if (side === WHITE) quick.kingW = square;
          else quick.kingB = square;
        }
        square++;
      }
    }
    quick.turn = turn === 'b' ? BLACK : WHITE;
    if (castling.includes('K')) quick.castlingW |= KSIDE_CASTLE;
    if (castling.includes('Q')) quick.castlingW |= QSIDE_CASTLE;
    if (castling.includes('k')) quick.castlingB |= KSIDE_CASTLE;
    if (castling.includes('q')) quick.castlingB |= QSIDE_CASTLE;
    quick.ep = /^[a-h][36]$/.test(ep) ? squareIndex(ep as Square) : -1;
    return quick;
  }

  /** The legal moves of the side to move, in chess.js's order. */
  moves(): QuickMove[] {
    return this.legal(this.pseudoMoves(false));
  }

  /** The legal captures and promotions only, in the same order. */
  captures(): QuickMove[] {
    return this.legal(this.pseudoMoves(true));
  }

  /** Whether the side to move is in check. */
  inCheck(): boolean {
    return this.kingAttacked(this.turn);
  }

  /** Whether the side to move has a legal move (stops at the first). */
  hasMove(): boolean {
    const us = this.turn;
    for (const move of this.pseudoMoves(false)) {
      this.make(move);
      const legal = !this.kingAttacked(us);
      this.unmake();
      if (legal) return true;
    }
    return false;
  }

  make(move: QuickMove): void {
    const board = this.board;
    const us = this.turn;
    this.history.push({
      move,
      target: board[move.to] ?? 0,
      castlingW: this.castlingW,
      castlingB: this.castlingB,
      ep: this.ep,
      kingW: this.kingW,
      kingB: this.kingB,
    });
    board[move.to] = board[move.from] ?? 0;
    board[move.from] = 0;
    if (move.flags & EP_CAPTURE) board[us === BLACK ? move.to - 16 : move.to + 16] = 0;
    if (move.promotion) board[move.to] = us | move.promotion;
    if (move.piece === KING) {
      if (us === WHITE) {
        this.kingW = move.to;
        this.castlingW = 0;
      } else {
        this.kingB = move.to;
        this.castlingB = 0;
      }
      if (move.flags & KSIDE_CASTLE) {
        board[move.to - 1] = board[move.to + 1] ?? 0;
        board[move.to + 1] = 0;
      } else if (move.flags & QSIDE_CASTLE) {
        board[move.to + 1] = board[move.to - 2] ?? 0;
        board[move.to - 2] = 0;
      }
    }
    // A move from one's own corner (the rook leaving) or onto the other side's corner (the
    // rook taken) ends castling on that wing.
    if (us === WHITE) {
      if (move.from === 112) this.castlingW &= ~QSIDE_CASTLE;
      else if (move.from === 119) this.castlingW &= ~KSIDE_CASTLE;
      if (move.to === 0) this.castlingB &= ~QSIDE_CASTLE;
      else if (move.to === 7) this.castlingB &= ~KSIDE_CASTLE;
    } else {
      if (move.from === 0) this.castlingB &= ~QSIDE_CASTLE;
      else if (move.from === 7) this.castlingB &= ~KSIDE_CASTLE;
      if (move.to === 112) this.castlingW &= ~QSIDE_CASTLE;
      else if (move.to === 119) this.castlingW &= ~KSIDE_CASTLE;
    }
    this.ep = -1;
    if (move.flags & BIG_PAWN) {
      const enemyPawn = other(us) | PAWN;
      const left = move.to - 1;
      const right = move.to + 1;
      if (
        (onBoard(left) && board[left] === enemyPawn) ||
        (onBoard(right) && board[right] === enemyPawn)
      ) {
        this.ep = us === BLACK ? move.to - 16 : move.to + 16;
      }
    }
    this.turn = other(us);
  }

  unmake(): void {
    const undo = this.history.pop();
    if (!undo) return;
    const { move } = undo;
    const board = this.board;
    const us = other(this.turn);
    this.turn = us;
    this.castlingW = undo.castlingW;
    this.castlingB = undo.castlingB;
    this.ep = undo.ep;
    this.kingW = undo.kingW;
    this.kingB = undo.kingB;
    // The piece goes back as it was: a promoted piece becomes the pawn again.
    board[move.from] = us | move.piece;
    board[move.to] = undo.target;
    if (move.flags & EP_CAPTURE) {
      board[us === BLACK ? move.to - 16 : move.to + 16] = other(us) | PAWN;
    } else if (move.flags & KSIDE_CASTLE) {
      board[move.to + 1] = board[move.to - 1] ?? 0;
      board[move.to - 1] = 0;
    } else if (move.flags & QSIDE_CASTLE) {
      board[move.to - 2] = board[move.to + 1] ?? 0;
      board[move.to + 1] = 0;
    }
  }

  /** Whether `side`'s king stands attacked. */
  private kingAttacked(side: Side): boolean {
    const king = side === WHITE ? this.kingW : this.kingB;
    return king !== -1 && this.attacked(other(side), king);
  }

  /** Whether any piece of `by` attacks `square`. */
  private attacked(by: Side, square: number): boolean {
    const board = this.board;
    // A pawn attacks diagonally forward: White's towards a8 (lower indices), Black's towards h1.
    const pawn = by | PAWN;
    const back = by === WHITE ? 15 : -15;
    if (onBoard(square + back) && board[square + back] === pawn) return true;
    const back2 = by === WHITE ? 17 : -17;
    if (onBoard(square + back2) && board[square + back2] === pawn) return true;
    const knight = by | KNIGHT;
    for (const offset of KNIGHT_OFFSETS) {
      const from = square + offset;
      if (onBoard(from) && board[from] === knight) return true;
    }
    const queen = by | QUEEN;
    const bishop = by | BISHOP;
    for (const offset of BISHOP_OFFSETS) {
      for (let from = square + offset; onBoard(from); from += offset) {
        const piece = board[from];
        if (!piece) continue;
        if (piece === bishop || piece === queen) return true;
        break;
      }
    }
    const rook = by | ROOK;
    for (const offset of ROOK_OFFSETS) {
      for (let from = square + offset; onBoard(from); from += offset) {
        const piece = board[from];
        if (!piece) continue;
        if (piece === rook || piece === queen) return true;
        break;
      }
    }
    const king = by | KING;
    for (const offset of ROYAL_OFFSETS) {
      const from = square + offset;
      if (onBoard(from) && board[from] === king) return true;
    }
    return false;
  }

  /** The moves that do not leave the mover's king attacked (all of them without a king). */
  private legal(moves: QuickMove[]): QuickMove[] {
    const us = this.turn;
    if ((us === WHITE ? this.kingW : this.kingB) === -1) return moves;
    const out: QuickMove[] = [];
    for (const move of moves) {
      this.make(move);
      if (!this.kingAttacked(us)) out.push(move);
      this.unmake();
    }
    return out;
  }

  /** Pseudo-legal moves in chess.js's order; `capturesOnly` keeps captures and promotions. */
  private pseudoMoves(capturesOnly: boolean): QuickMove[] {
    const board = this.board;
    const us = this.turn;
    const them = other(us);
    const moves: QuickMove[] = [];
    const add = (from: number, to: number, piece: number, captured: number, flags: number) => {
      const row = to >> 4;
      if (piece === PAWN && (row === 0 || row === 7)) {
        for (const promotion of PROMOTIONS) {
          moves.push({ from, to, piece, captured, promotion, flags: flags | PROMOTION });
        }
      } else {
        moves.push({ from, to, piece, captured, promotion: 0, flags });
      }
    };
    for (let from = 0; from <= 119; from++) {
      if (!onBoard(from)) {
        from += 7;
        continue;
      }
      const code = board[from] ?? 0;
      if (code === 0 || (code & BLACK) !== us) continue;
      const type = code & 7;
      if (type === PAWN) {
        const [push, double, left, right] = PAWN_OFFSETS[us];
        const single = from + push;
        if (onBoard(single) && board[single] === 0) {
          const row = single >> 4;
          if (!capturesOnly || row === 0 || row === 7) add(from, single, PAWN, 0, NORMAL);
          const twice = from + double;
          const home = us === WHITE ? 6 : 1;
          if (!capturesOnly && from >> 4 === home && board[twice] === 0) {
            add(from, twice, PAWN, 0, BIG_PAWN);
          }
        }
        for (const to of [from + left, from + right]) {
          if (!onBoard(to)) continue;
          const target = board[to] ?? 0;
          if (target !== 0 && (target & BLACK) === them) add(from, to, PAWN, target & 7, CAPTURE);
          else if (to === this.ep) add(from, to, PAWN, PAWN, EP_CAPTURE);
        }
        continue;
      }
      const slides = type !== KNIGHT && type !== KING;
      for (const offset of PIECE_OFFSETS[type] ?? []) {
        for (let to = from + offset; onBoard(to); to += offset) {
          const target = board[to] ?? 0;
          if (target === 0) {
            if (!capturesOnly) add(from, to, type, 0, NORMAL);
          } else {
            if ((target & BLACK) !== us) add(from, to, type, target & 7, CAPTURE);
            break;
          }
          if (!slides) break;
        }
      }
    }
    if (!capturesOnly) this.castlingMoves(moves);
    return moves;
  }

  private castlingMoves(moves: QuickMove[]): void {
    const board = this.board;
    const us = this.turn;
    const them = other(us);
    const rights = us === WHITE ? this.castlingW : this.castlingB;
    const king = us === WHITE ? this.kingW : this.kingB;
    // Rights only mean something with the king at home (a FEN may say otherwise).
    if (!rights || king !== (us === WHITE ? 116 : 4)) return;
    const safe = (a: number, b: number, c: number) =>
      !this.attacked(them, a) && !this.attacked(them, b) && !this.attacked(them, c);
    if (rights & KSIDE_CASTLE && !board[king + 1] && !board[king + 2]) {
      if (safe(king, king + 1, king + 2)) {
        moves.push({
          from: king,
          to: king + 2,
          piece: KING,
          captured: 0,
          promotion: 0,
          flags: KSIDE_CASTLE,
        });
      }
    }
    if (rights & QSIDE_CASTLE && !board[king - 1] && !board[king - 2] && !board[king - 3]) {
      if (safe(king, king - 1, king - 2)) {
        moves.push({
          from: king,
          to: king - 2,
          piece: KING,
          captured: 0,
          promotion: 0,
          flags: QSIDE_CASTLE,
        });
      }
    }
  }
}

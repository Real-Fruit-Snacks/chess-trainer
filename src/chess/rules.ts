import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import {
  Chess960Game,
  chess960LineToSan,
  chess960Position,
  chess960SanToUci,
  chess960UciToSan,
  isChess960Promotion,
  normalizeChess960Fen,
  passChess960,
  playChess960,
  playChess960Typed,
} from './chess960';
import {
  checkedKingSquare,
  gameStatus,
  type GameStatus,
  isPromotionMove,
  legalDests,
  passMove,
  sanitizeFen,
  sanToUci,
  toLongColor,
  toUci,
  tryMove,
  tryNotation,
  uciLineToSan,
  uciToSan,
} from './helpers';
import type { Fen, LongColor, MoveInput, San, Uci } from './types';

/**
 * The rules a game is played by: standard chess (chess.js) or Chess960
 * (chessops, see chess960.ts), which differ in castling alone. The analysis
 * board, its tree and the game review ask `rulesFor(variant)` instead of
 * chess.js, so a Chess960 game goes through them unchanged. Standard chess
 * behaves exactly as the chess.js helpers do.
 */
export type Variant = 'standard' | 'chess960';

/** A move played, as both rule sets describe it (the fields chess.js's moves share). */
export interface PlayedMove {
  color: Color;
  piece: PieceSymbol;
  from: Square;
  /** Where the move goes: in Chess960, castling goes to the castling rook's square. */
  to: Square;
  promotion?: PieceSymbol;
  captured?: PieceSymbol;
  /** chess.js's flags (n, b, e, c, p, k, q), for the move sounds. */
  flags: string;
  san: San;
  /** The move as the engine writes it in this variant (Chess960 castling: "e1h1"). */
  uci: Uci;
  before: Fen;
  after: Fen;
}

/** A position on its own, as a board shows it. */
export interface PositionInfo {
  turn: LongColor;
  /** Legal destinations for chessground (Chess960 castling: the king onto its rook). */
  dests: Map<Square, Square[]>;
  inCheck: boolean;
  checkedKing: Square | null;
  /** The move number of the side to move. */
  moveNumber: number;
  /** Mate, stalemate, insufficient material or fifty moves; a repetition needs the game. */
  status: GameStatus;
}

/** A game replayed move by move, repetitions counted (the game review walks one). */
export interface GameReplay {
  fen(): Fen;
  turn(): LongColor;
  /** Plays a move (SAN, UCI or squares); null when it is not legal here. */
  play(input: MoveInput | string): PlayedMove | null;
  isGameOver(): boolean;
  isCheckmate(): boolean;
  /** How many legal moves the side to move has. */
  legalMoveCount(): number;
}

export interface ChessRules {
  readonly variant: Variant;
  /** The FEN this variant keeps for a pasted or handed-over position, or null when it is none. */
  readFen(fen: string): Fen | null;
  /** The state of a legal position (throws, as chess.js does, for one that is not). */
  position(fen: Fen): PositionInfo;
  /** Plays a move — squares, UCI or SAN — in `fen`; null when illegal (never throws). */
  play(fen: Fen, input: MoveInput | string): PlayedMove | null;
  /** A move typed by a person ("nf3", "o-o", "e7e8"); `autoQueen` completes promotions. */
  playTyped(fen: Fen, text: string, options?: { autoQueen?: boolean }): PlayedMove | null;
  /** Whether a pawn of the side to move would promote going from `from` to `to`. */
  isPromotion(fen: Fen, from: Square, to: Square): boolean;
  uciToSan(fen: Fen, uci: Uci): San | null;
  /** An engine line in SAN, up to its first move that is not legal. */
  lineToSan(fen: Fen, line: readonly Uci[]): San[];
  sanToUci(fen: Fen, san: San): Uci | null;
  /** The position with the other side to move; null when the side passing is in check. */
  passMove(fen: Fen): Fen | null;
  replay(startFen: Fen): GameReplay;
}

/** A chess.js move as both rule sets describe it. */
function described(move: Move): PlayedMove {
  return {
    color: move.color,
    piece: move.piece,
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion } : {}),
    ...(move.captured ? { captured: move.captured } : {}),
    flags: move.flags,
    san: move.san,
    uci: toUci(move),
    before: move.before,
    after: move.after,
  };
}

/** chess.js reads a string as SAN, or as coordinates ("e2e4") in its forgiving mode. */
function playStandard(chess: Chess, input: MoveInput | string): PlayedMove | null {
  const move = tryMove(chess, input);
  return move ? described(move) : null;
}

const STANDARD: ChessRules = {
  variant: 'standard',
  readFen: (fen) => sanitizeFen(fen),
  position: (fen) => {
    const chess = new Chess(fen);
    return {
      turn: toLongColor(chess.turn()),
      dests: legalDests(chess),
      inCheck: chess.inCheck(),
      checkedKing: checkedKingSquare(chess),
      moveNumber: chess.moveNumber(),
      status: gameStatus(chess),
    };
  },
  play: (fen, input) => {
    try {
      return playStandard(new Chess(fen), input);
    } catch {
      return null;
    }
  },
  playTyped: (fen, text, options = {}) => {
    try {
      const move = tryNotation(new Chess(fen), text, options);
      return move ? described(move) : null;
    } catch {
      return null;
    }
  },
  isPromotion: (fen, from, to) => isPromotionMove(new Chess(fen), from, to),
  uciToSan,
  lineToSan: (fen, line) => uciLineToSan(fen, [...line]),
  sanToUci,
  passMove,
  replay: (startFen) => {
    const chess = new Chess(startFen);
    return {
      fen: () => chess.fen(),
      turn: () => toLongColor(chess.turn()),
      play: (input) => playStandard(chess, input),
      isGameOver: () => chess.isGameOver(),
      isCheckmate: () => chess.isCheckmate(),
      legalMoveCount: () => chess.moves().length,
    };
  },
};

const CHESS960: ChessRules = {
  variant: 'chess960',
  readFen: normalizeChess960Fen,
  position: (fen) => {
    const info = chess960Position(fen);
    if (!info) throw new Error(`Not a position: ${fen}`);
    return info;
  },
  play: playChess960,
  playTyped: playChess960Typed,
  isPromotion: isChess960Promotion,
  uciToSan: chess960UciToSan,
  lineToSan: chess960LineToSan,
  sanToUci: chess960SanToUci,
  passMove: passChess960,
  replay: (startFen) => {
    const game = new Chess960Game(startFen);
    return {
      fen: () => game.fen(),
      turn: () => game.turn(),
      play: (input) => game.move(input),
      isGameOver: () => game.isGameOver(),
      isCheckmate: () => game.isCheckmate(),
      legalMoveCount: () => game.legalMoveCount(),
    };
  },
};

/** The rules of a variant. */
export function rulesFor(variant: Variant): ChessRules {
  return variant === 'chess960' ? CHESS960 : STANDARD;
}

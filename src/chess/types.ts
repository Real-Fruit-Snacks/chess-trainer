import type { Color as ChessJsColor, Square } from 'chess.js';

/** chess.js colour: 'w' | 'b' */
export type ShortColor = ChessJsColor;
/** chessground colour: 'white' | 'black' */
export type LongColor = 'white' | 'black';

export type { Square };

/** A move in UCI/long algebraic form, e.g. "e2e4" or "e7e8q". */
export type Uci = string;
/** A move in Standard Algebraic Notation, e.g. "Nf3" or "exd8=Q+". */
export type San = string;
/** Forsyth–Edwards Notation for a full position. */
export type Fen = string;

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type GameTermination =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient'
  | 'threefold'
  | 'fifty-move'
  | 'resignation'
  | 'timeout'
  | null;

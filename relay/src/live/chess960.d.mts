/** Types for chess960.mjs, for TypeScript callers: the relay's tests and the app. */

export const CHESS960_POSITIONS: number;
export function isChess960Position(n: unknown): n is number;
export function chess960BackRank(n: number): string;
export function chess960StartFen(n: number): string;
export function randomChess960Position(): number;

/** A move played, as much of chess.js's description as the referee uses. */
export interface Chess960Played {
  color: 'w' | 'b';
  from: string;
  /** Castling: the rook's square (the king takes its own rook). */
  to: string;
  promotion?: string;
  san: string;
}

export class Chess960Game {
  constructor(startFen: string);
  move(input: { from: string; to: string; promotion?: string }): Chess960Played | null;
  undo(): true | null;
  turn(): 'w' | 'b';
  fen(): string;
  board(): ({ square: string; type: string; color: 'w' | 'b' } | null)[][];
  isCheck(): boolean;
  isCheckmate(): boolean;
  isStalemate(): boolean;
  isInsufficientMaterial(): boolean;
  isThreefoldRepetition(): boolean;
  isDrawByFiftyMoves(): boolean;
}

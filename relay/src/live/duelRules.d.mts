/** Types for duelRules.mjs, for TypeScript callers: the app (its duels) and the relay's tests. */

export type Seat = 'white' | 'black';

export interface RacePuzzle {
  id: string;
  fen: string;
  /** Space-separated UCI: the move that sets the puzzle, then the solution, as Lichess has them. */
  moves: string;
  rating: number;
}

export interface ArbiterItem {
  /** The position the round's replay starts from. */
  fen: string;
  /** Moves of the game played before it (for the move numbers). */
  ply: number;
  /** The real moves shown before the illegal one, in UCI. */
  lead: string[];
  illegal: { from: string; to: string; kind: string; promotion?: string };
  /** The classic game it comes from: one of `CLASSIC_GAME_IDS`. */
  game: string;
}

export interface JudgeItem {
  fen: string;
  /** The engine's evaluation, in centipawns from White's side. */
  cp: number;
  /** The classic game it comes from: one of `CLASSIC_GAME_IDS`. */
  game: string;
  ply: number;
}

/** The classic games a duel's round may come from: the ids of the app's own. */
export const CLASSIC_GAME_IDS: readonly string[];

export interface RaceResult {
  ok: boolean;
  ms: number;
}

export interface ArbiterResult {
  call: 'caught' | 'false' | 'missed';
  ms: number;
}

export interface JudgeResult {
  guess: number;
}

export type DuelResult = RaceResult | ArbiterResult | JudgeResult;
export interface Points {
  white: number;
  black: number;
}
export interface RoundOutcome {
  winner: Seat | 'shared' | null;
  points: Points;
}

export function duelContent(
  game: string,
  opts: object,
  items: unknown,
): RacePuzzle[] | ArbiterItem[] | JudgeItem[] | null;
export function duelReport(game: string, msg: Record<string, unknown>): DuelResult | null;
export function timedReport(
  msg: Record<string, unknown>,
): { index: number; ok: boolean; ms: number } | null;
export function publicResult(game: string, result: DuelResult): DuelResult | { locked: true };

export const SCALE_MAX: number;
export const SPOT_ON: number;
export const CLOSE: number;
export const POINTS_PER_PAWN: number;
export const EQUAL_BAND: number;
export function toScale(cp: number): number;
export function judgeGuess(
  guess: number,
  cp: number,
): { points: number; verdict: 'spot on' | 'close' | 'right side' | 'wrong side'; truth: number };

export function raceRound(
  format: string,
  white: RaceResult | null,
  black: RaceResult | null,
): RoundOutcome;
export function arbiterRound(
  white: ArbiterResult | null,
  black: ArbiterResult | null,
): RoundOutcome;
export function judgeRound(
  white: JudgeResult | null,
  black: JudgeResult | null,
  cp: number,
): RoundOutcome;
export function duelResult(
  game: string,
  score: Points,
  played: number,
  left: number,
): '1-0' | '0-1' | '1/2-1/2' | null;
export function timedResult(
  white: { solved: number; strikes: number },
  black: { solved: number; strikes: number },
): '1-0' | '0-1' | '1/2-1/2';

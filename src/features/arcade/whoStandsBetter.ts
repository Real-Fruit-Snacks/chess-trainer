import { shuffle } from '@/lib/random';
import type { EvalPosition } from './positions';

/** "Who Stands Better?": judge ten quiet positions on a ±5 pawn scale. */
export const ROUND_SIZE = 10;
export const SCALE_MAX = 5;
/** The slider moves in tenths of a pawn. */
export const SCALE_STEP = 0.1;
/** Within this many pawns of the engine is spot on. */
export const SPOT_ON = 0.3;
/** Within this many pawns is close (and keeps a streak going). */
export const CLOSE = 1;
/** Points lost per pawn of error. */
export const POINTS_PER_PAWN = 30;
/** Evaluations closer to zero than this are equal: neither side stands better. */
export const EQUAL_BAND = 0.3;

/** Picks a round: at most two positions from any one game, in random order. */
export function pickRound(
  positions: readonly EvalPosition[],
  random: () => number = Math.random,
  size = ROUND_SIZE,
): EvalPosition[] {
  const perGame = new Map<string, number>();
  const round: EvalPosition[] = [];
  for (const position of shuffle(positions, random)) {
    const used = perGame.get(position.gameId) ?? 0;
    if (used >= 2) continue;
    perGame.set(position.gameId, used + 1);
    round.push(position);
    if (round.length === size) break;
  }
  return round;
}

/** Rounds to the slider's tenths, without floating-point dust (0.30000000000000004). */
function tenths(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Centipawns as pawns on the slider's scale (tenths, at most ±SCALE_MAX). */
export function toScale(cp: number): number {
  return Math.max(-SCALE_MAX, Math.min(SCALE_MAX, tenths(cp / 100)));
}

export type Verdict = 'spot on' | 'close' | 'right side' | 'wrong side';

export interface Judgement {
  points: number;
  verdict: Verdict;
  /** The truth on the slider's scale. */
  truth: number;
}

function side(value: number): -1 | 0 | 1 {
  if (value >= EQUAL_BAND) return 1;
  if (value <= -EQUAL_BAND) return -1;
  return 0;
}

/**
 * Points for a guess: 100 when exact, POINTS_PER_PAWN fewer per pawn of
 * error, and nothing at all for calling the wrong side better. Spot on is
 * within SPOT_ON of the engine, close within CLOSE.
 */
export function judge(guess: number, cp: number): Judgement {
  const truth = toScale(cp);
  const diff = tenths(Math.abs(guess - truth));
  if (side(guess) !== 0 && side(truth) !== 0 && side(guess) !== side(truth)) {
    return { points: 0, verdict: 'wrong side', truth };
  }
  const points = Math.max(0, Math.round(100 - diff * POINTS_PER_PAWN));
  const verdict: Verdict = diff <= SPOT_ON ? 'spot on' : diff <= CLOSE ? 'close' : 'right side';
  return { points, verdict, truth };
}

/** Streak bonus: ten extra points for every consecutive close call after the second. */
export function streakBonus(streak: number): number {
  return Math.min(30, Math.max(0, streak - 2) * 10);
}

export function describeScale(value: number): string {
  const size = tenths(Math.abs(value));
  if (size < EQUAL_BAND) return 'Equal';
  const who = value > 0 ? 'White' : 'Black';
  if (size >= 3) return `${who} is winning (${size.toFixed(1)})`;
  if (size >= 1.5) return `${who} is clearly better (${size.toFixed(1)})`;
  if (size >= 0.75) return `${who} is better (${size.toFixed(1)})`;
  return `${who} is slightly better (${size.toFixed(1)})`;
}

/**
 * The line under a finished round, against the best from before it (the
 * store already holds this round's score by then).
 */
export function describeRoundBest(score: number, bestBefore: number | null): string {
  if (bestBefore === null) return `Your first round: ${score} points to beat next time.`;
  if (score > bestBefore) return `A new best — up from ${bestBefore}.`;
  if (score === bestBefore) return `That equals your best, ${bestBefore}.`;
  return `Your best is ${bestBefore}.`;
}

export interface RoundSummary {
  score: number;
  max: number;
  spotOn: number;
  wrongSide: number;
}

export function summarizeRound(judgements: readonly Judgement[]): RoundSummary {
  let score = 0;
  let streak = 0;
  for (const j of judgements) {
    score += j.points;
    streak = j.verdict === 'spot on' || j.verdict === 'close' ? streak + 1 : 0;
    score += streakBonus(streak);
  }
  return {
    score,
    max: judgements.length * 100,
    spotOn: judgements.filter((j) => j.verdict === 'spot on').length,
    wrongSide: judgements.filter((j) => j.verdict === 'wrong side').length,
  };
}

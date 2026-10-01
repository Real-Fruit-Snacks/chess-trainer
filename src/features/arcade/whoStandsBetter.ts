import { shuffle } from '@/lib/random';
import type { EvalPosition } from './positions';

/** "Who Stands Better?": judge ten quiet positions on a ±5 pawn scale. */
export const ROUND_SIZE = 10;
export const SCALE_MAX = 5;
export const SCALE_STEP = 0.5;

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

/** Centipawns as pawns on the slider's scale. */
export function toScale(cp: number): number {
  const pawns = Math.round(cp / 100 / SCALE_STEP) * SCALE_STEP;
  return Math.max(-SCALE_MAX, Math.min(SCALE_MAX, pawns));
}

export type Verdict = 'spot on' | 'close' | 'right side' | 'wrong side';

export interface Judgement {
  points: number;
  verdict: Verdict;
  /** The truth on the slider's scale. */
  truth: number;
}

function side(value: number): -1 | 0 | 1 {
  if (value > 0.5) return 1;
  if (value < -0.5) return -1;
  return 0;
}

/**
 * Points for a guess: 100 when spot on, 25 fewer per pawn of error, and
 * nothing at all for calling the wrong side better.
 */
export function judge(guess: number, cp: number): Judgement {
  const truth = toScale(cp);
  const diff = Math.abs(guess - truth);
  if (side(guess) !== 0 && side(truth) !== 0 && side(guess) !== side(truth)) {
    return { points: 0, verdict: 'wrong side', truth };
  }
  const points = Math.max(0, Math.round(100 - diff * 25));
  const verdict: Verdict = diff <= 0.5 ? 'spot on' : diff <= 1.5 ? 'close' : 'right side';
  return { points, verdict, truth };
}

/** Streak bonus: ten extra points for every consecutive close call after the second. */
export function streakBonus(streak: number): number {
  return Math.min(30, Math.max(0, streak - 2) * 10);
}

export function describeScale(value: number): string {
  if (Math.abs(value) <= 0.25) return 'Equal';
  const who = value > 0 ? 'White' : 'Black';
  const size = Math.abs(value);
  if (size >= 3) return `${who} is winning (${size.toFixed(1)})`;
  if (size >= 1.5) return `${who} is clearly better (${size.toFixed(1)})`;
  if (size >= 0.75) return `${who} is better (${size.toFixed(1)})`;
  return `${who} is slightly better (${size.toFixed(1)})`;
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

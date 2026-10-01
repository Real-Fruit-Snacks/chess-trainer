import { pickRandom } from '@/lib/random';
import { type EvalPosition, fortressTier, type FortressTier } from './positions';

/**
 * Fortress: hold a clearly worse position. The evaluation is the health bar;
 * at FALLEN_CP or worse the position has fallen. Hold for HOLD_MOVES of your
 * own moves (or reach a draw) and it counts.
 */
export const HOLD_MOVES = 20;
export const LIVES = 3;
/** Evaluation (your point of view, centipawns) at which the position is lost. */
export const FALLEN_CP = -600;
/** Grading depth after each pair of moves. */
export const GRADE_DEPTH = 12;

/** Health between 0 (fallen) and 1 (equal or better). */
export function health(cp: number): number {
  return Math.max(0, Math.min(1, (cp - FALLEN_CP) / -FALLEN_CP));
}

/** Which tier the next position should come from, after `held` positions. */
export function tierForHeld(held: number): FortressTier {
  if (held < 2) return 1;
  if (held < 4) return 2;
  return 3;
}

/** A position of the wanted tier not used yet this run (any tier when that one is exhausted). */
export function pickFortressPosition(
  pool: readonly EvalPosition[],
  tier: FortressTier,
  used: ReadonlySet<string>,
  random: () => number = Math.random,
): EvalPosition | undefined {
  const fresh = pool.filter((p) => !used.has(p.id));
  const ofTier = fresh.filter((p) => fortressTier(p) === tier);
  return pickRandom(ofTier.length ? ofTier : fresh, random);
}

export function describeTier(tier: FortressTier): string {
  return tier === 1 ? 'A pawn or so down' : tier === 2 ? 'Clearly worse' : 'On the brink';
}

export function fortressScoreDetail(held: number, levelName: string): string {
  return `Held ${held} position${held === 1 ? '' : 's'} against ${levelName}`;
}

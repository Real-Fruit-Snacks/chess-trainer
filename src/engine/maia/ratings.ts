/**
 * The ratings the human-like opponent plays at, in steps of a hundred (the
 * range the Maia-3 models were trained and evaluated over). Kept apart from
 * the model code, which brings chess.js along: the settings store reads these
 * at start-up.
 */
export const HUMAN_MIN_RATING = 600;
export const HUMAN_MAX_RATING = 2600;
export const HUMAN_RATING_STEP = 100;
export const DEFAULT_HUMAN_RATING = 1200;
export const HUMAN_RATINGS: readonly number[] = Array.from(
  { length: (HUMAN_MAX_RATING - HUMAN_MIN_RATING) / HUMAN_RATING_STEP + 1 },
  (_, i) => HUMAN_MIN_RATING + i * HUMAN_RATING_STEP,
);

export function isHumanRating(value: unknown): value is number {
  return typeof value === 'number' && HUMAN_RATINGS.includes(value);
}

/** The rating one step up or down, kept within the range. */
export function stepHumanRating(rating: number, steps: number): number {
  const next = rating + steps * HUMAN_RATING_STEP;
  return Math.min(HUMAN_MAX_RATING, Math.max(HUMAN_MIN_RATING, next));
}

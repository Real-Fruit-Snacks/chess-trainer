/**
 * Blind puzzles: the board stays on the starting position while the line is
 * played out in notation only, so the whole combination has to be held in the
 * head — calculation, not recognition. The lengths and levels, shared by the
 * trainer, the settings and the progress store (and so free of chess.js, which
 * the app's first screen does not need); the line itself is in blindLine.ts.
 */

/** How deep a blind puzzle goes: the Lichess length tags (two, three, four or more moves). */
export type BlindDepth = 'short' | 'long' | 'veryLong';

export const BLIND_DEPTHS: readonly BlindDepth[] = ['short', 'long', 'veryLong'];

export const BLIND_DEPTH_LABELS: Record<BlindDepth, string> = {
  short: '2 moves',
  long: '3 moves',
  veryLong: '4+ moves',
};

export function isBlindDepth(value: unknown): value is BlindDepth {
  return typeof value === 'string' && (BLIND_DEPTHS as readonly string[]).includes(value);
}

/** The lowest and highest level a depth can reach (the bundled puzzles span 400–3000). */
export const BLIND_MIN_LEVEL = 400;
export const BLIND_MAX_LEVEL = 2900;
/** A clean solve raises the level of its depth by this much… */
export const BLIND_STEP_UP = 40;
/** …and a miss lowers it by this much. A solve after peeking leaves it where it is. */
export const BLIND_STEP_DOWN = 60;

/**
 * Seeing the board for a puzzle is worth a few hundred points: a depth starts
 * this far below the learner's puzzle rating, further for the longer lines.
 */
const START_OFFSET: Record<BlindDepth, number> = { short: 300, long: 450, veryLong: 600 };

const clampLevel = (level: number) =>
  Math.min(BLIND_MAX_LEVEL, Math.max(BLIND_MIN_LEVEL, Math.round(level)));

/** Where a depth starts for a learner with this puzzle rating. */
export function startingBlindLevel(puzzleRating: number, depth: BlindDepth): number {
  const rating = Number.isFinite(puzzleRating) ? puzzleRating : 1500;
  return clampLevel(rating - START_OFFSET[depth]);
}

/** The level a depth's next puzzle is chosen around: its own, once it has one. */
export function blindLevel(
  levels: Partial<Record<BlindDepth, number>>,
  depth: BlindDepth,
  puzzleRating: number,
): number {
  const own = levels[depth];
  return typeof own === 'number' && Number.isFinite(own)
    ? clampLevel(own)
    : startingBlindLevel(puzzleRating, depth);
}

/** The level after an attempt: up after a clean solve, down after a miss. */
export function nextBlindLevel(
  level: number,
  outcome: 'solved' | 'failed',
  peeked: boolean,
): number {
  if (outcome === 'failed') return clampLevel(level - BLIND_STEP_DOWN);
  return peeked ? clampLevel(level) : clampLevel(level + BLIND_STEP_UP);
}

/**
 * How much a puzzle attempt is worth as a Glicko-2 score (0–1).
 *
 * - A fail is 0.
 * - A clean solve is 1, reduced when it was slow for the puzzle's size and
 *   difficulty (a puzzle rating measures tactics *and* the speed of seeing
 *   them, as on the big puzzle sites) — never below `SLOW_FLOOR`.
 * - Hints cost credit according to how much they gave away: the piece to move
 *   (level 1) or the whole move (level 2).
 * - A puzzle seen before says less about strength, so its update is blended
 *   in at `REPEAT_WEIGHT`.
 */

export type HintLevel = 0 | 1 | 2;

/** Credit for a solve by the most revealing hint used. */
export const HINT_CREDIT: Record<HintLevel, number> = { 0: 1, 1: 0.6, 2: 0.25 };
/** The slowest solve still earns this fraction of the credit. */
export const SLOW_FLOOR = 0.75;
/** Solves slower than this multiple of the expected time get the floor. */
export const SLOW_MULTIPLE = 3;
/** Fraction of the rating update applied for a puzzle attempted before. */
export const REPEAT_WEIGHT = 0.25;

/**
 * A reasonable solving time for a puzzle: a few seconds to take the position
 * in, then longer per move the harder the puzzle is. 2 moves at 1500 → 30 s.
 */
export function expectedSolveMs(puzzleRating: number, solverMoves: number): number {
  const moves = Math.max(1, Math.round(solverMoves));
  const perMove = 5000 + Math.max(0, puzzleRating) * 5;
  return 5000 + moves * perMove;
}

/** 1 up to the expected time, then linearly down to `SLOW_FLOOR` at `SLOW_MULTIPLE` × expected. */
export function timeFactor(durationMs: number, expectedMs: number): number {
  if (!(durationMs > 0) || !(expectedMs > 0)) return 1;
  const ratio = durationMs / expectedMs;
  if (ratio <= 1) return 1;
  if (ratio >= SLOW_MULTIPLE) return SLOW_FLOOR;
  return 1 - ((ratio - 1) / (SLOW_MULTIPLE - 1)) * (1 - SLOW_FLOOR);
}

export interface AttemptForScore {
  outcome: 'solved' | 'failed';
  hintLevel: HintLevel;
  durationMs: number;
  puzzleRating: number;
  solverMoves: number;
}

/** The Glicko score of an attempt (see the module comment). */
export function attemptScore(attempt: AttemptForScore): number {
  if (attempt.outcome === 'failed') return 0;
  const credit = HINT_CREDIT[attempt.hintLevel];
  const speed = timeFactor(
    attempt.durationMs,
    expectedSolveMs(attempt.puzzleRating, attempt.solverMoves),
  );
  return Math.round(credit * speed * 1000) / 1000;
}

/**
 * The score a rated attempt is finally worth. A correct solve, however slow
 * or hint-assisted, never scores below what the rating system expected of the
 * player, so solving a puzzle never costs rating points (a miss is still 0).
 */
export function ratedSolveScore(
  outcome: 'solved' | 'failed',
  score: number,
  expected: number,
): number {
  if (outcome === 'failed') return 0;
  const floor = Number.isFinite(expected) ? Math.min(1, Math.max(0, expected)) : 0;
  return Math.max(score, floor);
}

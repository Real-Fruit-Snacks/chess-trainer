import { describe, expect, it } from 'vitest';
import {
  attemptScore,
  expectedSolveMs,
  HINT_CREDIT,
  ratedSolveScore,
  SLOW_FLOOR,
  SLOW_MULTIPLE,
  timeFactor,
} from './puzzleScore';

describe('puzzle score', () => {
  it('expects longer solves for bigger and harder puzzles', () => {
    expect(expectedSolveMs(1500, 2)).toBe(30_000);
    expect(expectedSolveMs(1500, 1)).toBeLessThan(expectedSolveMs(1500, 3));
    expect(expectedSolveMs(800, 2)).toBeLessThan(expectedSolveMs(2200, 2));
    expect(expectedSolveMs(1000, 0)).toBe(expectedSolveMs(1000, 1));
  });

  it('keeps full credit up to the expected time and floors slow solves', () => {
    expect(timeFactor(10_000, 30_000)).toBe(1);
    expect(timeFactor(30_000, 30_000)).toBe(1);
    expect(timeFactor(60_000, 30_000)).toBeCloseTo(1 - (1 - SLOW_FLOOR) / 2);
    expect(timeFactor(30_000 * SLOW_MULTIPLE, 30_000)).toBe(SLOW_FLOOR);
    expect(timeFactor(10 * 60_000, 30_000)).toBe(SLOW_FLOOR);
    // Unknown duration (0) never penalises.
    expect(timeFactor(0, 30_000)).toBe(1);
  });

  it('scores fails, hints and speed', () => {
    const base = {
      outcome: 'solved' as const,
      durationMs: 10_000,
      puzzleRating: 1500,
      solverMoves: 2,
    };
    expect(attemptScore({ ...base, outcome: 'failed', hintLevel: 0 })).toBe(0);
    expect(attemptScore({ ...base, hintLevel: 0 })).toBe(1);
    expect(attemptScore({ ...base, hintLevel: 1 })).toBe(HINT_CREDIT[1]);
    expect(attemptScore({ ...base, hintLevel: 2 })).toBe(HINT_CREDIT[2]);
    expect(attemptScore({ ...base, hintLevel: 0, durationMs: 120_000 })).toBe(SLOW_FLOOR);
    expect(attemptScore({ ...base, hintLevel: 1, durationMs: 120_000 })).toBeCloseTo(
      HINT_CREDIT[1] * SLOW_FLOOR,
      3,
    );
  });

  it('never lets a correct rated solve score below what was expected of the player', () => {
    // A slow or hint-assisted solve keeps its reduced credit when that is above
    // the expected score, and is lifted to the expected score when below.
    expect(ratedSolveScore('solved', 0.75, 0.5)).toBe(0.75);
    expect(ratedSolveScore('solved', 0.25, 0.6)).toBe(0.6);
    expect(ratedSolveScore('solved', 0.75, 0.9)).toBe(0.9);
    // A miss is still a miss, and a broken expectation cannot lift anything.
    expect(ratedSolveScore('failed', 0.75, 0.9)).toBe(0);
    expect(ratedSolveScore('solved', 0.75, Number.NaN)).toBe(0.75);
    expect(ratedSolveScore('solved', 0.75, 7)).toBe(1);
  });
});

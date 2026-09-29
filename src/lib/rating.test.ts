import { describe, expect, it } from 'vitest';
import { expectedScore, kFactor, RATING_MAX, RATING_MIN, ratingBand, updateRating } from './rating';

describe('rating', () => {
  it('expected score is symmetric and 0.5 for equal ratings', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
    expect(expectedScore(1700, 1500) + expectedScore(1500, 1700)).toBeCloseTo(1);
    expect(expectedScore(1900, 1500)).toBeGreaterThan(0.9);
  });

  it('uses a larger K-factor while provisional', () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(15));
    expect(kFactor(15)).toBeGreaterThan(kFactor(100));
  });

  it('gains rating on a solve and loses on a fail', () => {
    const solve = updateRating(1200, 1200, 1, 50);
    const fail = updateRating(1200, 1200, 0, 50);
    expect(solve.delta).toBeGreaterThan(0);
    expect(fail.delta).toBeLessThan(0);
    expect(solve.delta).toBe(-fail.delta);
  });

  it('rewards beating harder puzzles more than easy ones', () => {
    const hard = updateRating(1200, 1600, 1, 50);
    const easy = updateRating(1200, 800, 1, 50);
    expect(hard.delta).toBeGreaterThan(easy.delta);
  });

  it('gives half credit for a hinted solve', () => {
    const full = updateRating(1200, 1200, 1, 50);
    const half = updateRating(1200, 1200, 0.5, 50);
    expect(half.delta).toBe(0);
    expect(full.delta).toBeGreaterThan(half.delta);
  });

  it('clamps to the allowed range', () => {
    expect(updateRating(RATING_MIN, 3000, 0, 0).after).toBe(RATING_MIN);
    expect(updateRating(RATING_MAX, 100, 1, 0).after).toBe(RATING_MAX);
  });

  it('labels rating bands', () => {
    expect(ratingBand(500)).toBe('Beginner');
    expect(ratingBand(1500)).toBe('Club');
    expect(ratingBand(2700)).toBe('Master');
  });
});

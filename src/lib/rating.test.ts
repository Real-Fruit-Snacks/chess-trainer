import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_PUZZLES,
  DEFAULT_PUZZLE_RD,
  formatRating,
  RATING_MAX,
  RATING_MIN,
  ratingBand,
  SELF_ASSESSED_RD,
  STARTING_RATINGS,
} from './rating';
import { INITIAL_RD, PROVISIONAL_RD } from './glicko';

describe('rating presentation', () => {
  it('labels rating bands', () => {
    expect(ratingBand(500)).toBe('Beginner');
    expect(ratingBand(1500)).toBe('Club');
    expect(ratingBand(2700)).toBe('Master');
  });

  it('formats ratings for display', () => {
    expect(formatRating(1247.4)).toBe('1,247');
    expect(formatRating(RATING_MIN)).toBe('100');
    expect(formatRating(RATING_MAX)).toBe('3,500');
  });

  it('keeps the onboarding constants consistent', () => {
    // A self-assessment is trusted more than nothing, less than a calibrated result.
    expect(SELF_ASSESSED_RD).toBeLessThan(INITIAL_RD);
    expect(SELF_ASSESSED_RD).toBeGreaterThan(PROVISIONAL_RD);
    expect(CALIBRATION_PUZZLES).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_PUZZLE_RD).toBeGreaterThan(0);
    const ratings = STARTING_RATINGS.map((o) => o.rating);
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
  });
});

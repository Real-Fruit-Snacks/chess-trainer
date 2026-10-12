import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_PUZZLES,
  DEFAULT_PUZZLE_RD,
  formatRating,
  formatRatingChange,
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

  it('shows a change as the difference of the rounded ratings, never with decimals', () => {
    expect(formatRatingChange(1431, 1446.3100785634942)).toBe('+15');
    expect(formatRatingChange(1441.0002, 1425.125675719823)).toBe('-16');
    // 1425.4 → 1435.6 shows as 1425 → 1436: the column says +11, though the change is 10.2.
    expect(formatRatingChange(1425.4, 1435.6)).toBe('+11');
    expect(formatRatingChange(1500.2, 1499.9)).toBe('·');
    expect(formatRatingChange(1500, Number.NaN)).toBe('·');
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

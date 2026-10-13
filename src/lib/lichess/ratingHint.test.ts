import { describe, expect, it } from 'vitest';
import type { LichessPerf, LichessRatings } from './auth';
import { maiaRatingFromLichess } from './ratingHint';

const perf = (rating: number, prov = false): LichessPerf => ({ rating, rd: 60, games: 50, prov });

function ratings(overrides: Partial<LichessRatings>): LichessRatings {
  return {
    puzzle: null,
    bullet: null,
    blitz: null,
    rapid: null,
    classical: null,
    at: 0,
    ...overrides,
  };
}

describe('a human-like opponent rating from Lichess', () => {
  it('takes rapid, then blitz, then classical, a settled one first', () => {
    expect(maiaRatingFromLichess(ratings({ rapid: perf(1649), blitz: perf(1400) }))).toEqual({
      rating: 1600,
      perf: 'rapid',
      lichess: 1649,
    });
    expect(maiaRatingFromLichess(ratings({ rapid: perf(1650, true), blitz: perf(1451) }))).toEqual({
      rating: 1500,
      perf: 'blitz',
      lichess: 1451,
    });
    expect(maiaRatingFromLichess(ratings({ classical: perf(1980, true) }))?.rating).toBe(2000);
  });

  it('stays within the opponent’s range, and needs a game rating', () => {
    expect(maiaRatingFromLichess(ratings({ blitz: perf(2950) }))?.rating).toBe(2600);
    expect(maiaRatingFromLichess(ratings({ blitz: perf(420) }))?.rating).toBe(600);
    expect(maiaRatingFromLichess(ratings({ puzzle: perf(2000), bullet: perf(1800) }))).toBeNull();
    expect(maiaRatingFromLichess(null)).toBeNull();
  });
});

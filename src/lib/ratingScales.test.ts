import { describe, expect, it } from 'vitest';
import { approximateGameRatings, ESTIMATE_SPREAD, FIDE_FLOOR, formatRange } from './ratingScales';

describe('rating scale estimates', () => {
  it('orders the scales as the published comparisons do', () => {
    const club = approximateGameRatings(1500);
    expect(club.lichess.centre).toBe(1200);
    expect(club.chesscom.centre).toBe(950);
    expect(club.fide).toBeNull(); // below the FIDE floor
    expect(club.lichess.high - club.lichess.low).toBe(2 * ESTIMATE_SPREAD);
    const strong = approximateGameRatings(2100);
    expect(strong.lichess.centre).toBeGreaterThan(strong.chesscom.centre);
    expect(strong.chesscom.centre).toBeGreaterThan(strong.fide?.centre ?? 0);
  });

  it('is monotonic and converges towards the top', () => {
    let previous = approximateGameRatings(400);
    for (let r = 450; r <= 3200; r += 50) {
      const next = approximateGameRatings(r);
      expect(next.lichess.centre).toBeGreaterThanOrEqual(previous.lichess.centre);
      expect(next.chesscom.centre).toBeGreaterThanOrEqual(previous.chesscom.centre);
      previous = next;
    }
    const top = approximateGameRatings(2900);
    expect(2900 - top.lichess.centre).toBeLessThan(
      1500 - approximateGameRatings(1500).lichess.centre,
    );
  });

  it('has no FIDE estimate below the FIDE floor', () => {
    expect(approximateGameRatings(900).fide).toBeNull();
    const fide = approximateGameRatings(1800).fide;
    expect(fide).not.toBeNull();
    expect(fide?.centre ?? 0).toBeGreaterThanOrEqual(FIDE_FLOOR);
  });

  it('formats ranges', () => {
    expect(formatRange({ low: 1050, high: 1350, centre: 1200 })).toBe('1,050–1,350');
  });
});

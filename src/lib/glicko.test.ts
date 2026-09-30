import { describe, expect, it } from 'vitest';
import {
  blend,
  expectedScore,
  formatRatingWithRd,
  inflate,
  isProvisional,
  MAX_RD,
  MIN_RD,
  newRating,
  PROVISIONAL_RD,
  rate,
  RATING_MAX,
  RATING_MIN,
} from './glicko';

describe('Glicko-2', () => {
  it('reproduces the worked example from Glickman’s paper', () => {
    // A 1500 player (RD 200, volatility 0.06) beats a 1400 (RD 30) and loses to
    // a 1550 (RD 100) and a 1700 (RD 300): the paper gives 1464.06, 151.52, 0.05999.
    const next = rate({ rating: 1500, rd: 200, volatility: 0.06 }, [
      { rating: 1400, rd: 30, score: 1 },
      { rating: 1550, rd: 100, score: 0 },
      { rating: 1700, rd: 300, score: 0 },
    ]);
    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.rd).toBeCloseTo(151.52, 1);
    expect(next.volatility).toBeCloseTo(0.05999, 4);
  });

  it('moves a new player far and a settled player a little', () => {
    const fresh = rate(newRating(1200), [{ rating: 1200, rd: 80, score: 1 }]);
    const settled = rate({ rating: 1200, rd: 60, volatility: 0.06 }, [
      { rating: 1200, rd: 80, score: 1 },
    ]);
    expect(fresh.rating - 1200).toBeGreaterThan(100);
    expect(settled.rating - 1200).toBeGreaterThan(5);
    expect(settled.rating - 1200).toBeLessThan(15);
    // A result makes a new rating much more certain; a settled one sits at the
    // equilibrium (about 60) where one result per period balances the volatility.
    expect(fresh.rd).toBeLessThan(300);
    expect(settled.rd).toBeGreaterThan(58);
    expect(settled.rd).toBeLessThan(62);
  });

  it('gains for solves, loses for fails, and cares about the puzzle’s reliability', () => {
    const player = { rating: 1500, rd: 80, volatility: 0.06 };
    const solve = rate(player, [{ rating: 1500, rd: 80, score: 1 }]);
    const fail = rate(player, [{ rating: 1500, rd: 80, score: 0 }]);
    expect(solve.rating).toBeGreaterThan(1500);
    expect(fail.rating).toBeLessThan(1500);
    expect(solve.rating - 1500).toBeCloseTo(1500 - fail.rating, 5);
    const vague = rate(player, [{ rating: 1500, rd: 300, score: 1 }]);
    expect(vague.rating - 1500).toBeLessThan(solve.rating - 1500);
    const hard = rate(player, [{ rating: 1900, rd: 80, score: 1 }]);
    const easy = rate(player, [{ rating: 1100, rd: 80, score: 1 }]);
    expect(hard.rating - 1500).toBeGreaterThan(easy.rating - 1500);
  });

  it('converges on a player’s true strength', () => {
    // Simulate a 1800 player against puzzles near the estimate, with deterministic outcomes.
    let player = newRating(1000);
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 200; i++) {
      const puzzle = { rating: player.rating + (random() - 0.5) * 300, rd: 80 };
      const p = 1 / (1 + Math.pow(10, (puzzle.rating - 1800) / 400));
      player = rate(player, [{ ...puzzle, score: random() < p ? 1 : 0 }]);
    }
    expect(Math.abs(player.rating - 1800)).toBeLessThan(120);
    expect(player.rd).toBeLessThan(PROVISIONAL_RD);
  });

  it('grows the deviation with inactivity and without results', () => {
    const settled = { rating: 1500, rd: 60, volatility: 0.06 };
    expect(inflate(settled, 0).rd).toBe(60);
    expect(inflate(settled, 30).rd).toBeGreaterThan(60);
    expect(inflate(settled, 365).rd).toBeGreaterThanOrEqual(PROVISIONAL_RD - 5);
    expect(inflate(settled, 10_000).rd).toBe(MAX_RD);
    expect(rate(settled, []).rd).toBeGreaterThan(60);
    expect(rate(settled, []).rating).toBe(1500);
  });

  it('clamps rating and deviation', () => {
    const floor = rate({ rating: RATING_MIN, rd: 350, volatility: 0.06 }, [
      { rating: 3000, rd: 50, score: 0 },
    ]);
    expect(floor.rating).toBe(RATING_MIN);
    const ceiling = rate({ rating: RATING_MAX, rd: 350, volatility: 0.06 }, [
      { rating: 200, rd: 50, score: 1 },
    ]);
    expect(ceiling.rating).toBe(RATING_MAX);
    expect(
      rate({ rating: 1500, rd: 10, volatility: 0.06 }, [{ rating: 1500, rd: 50, score: 1 }]).rd,
    ).toBe(MIN_RD);
    // Solving forever does not make the deviation collapse or drift: it stays near the equilibrium.
    let steady = { rating: 1500, rd: 45, volatility: 0.06 };
    for (let i = 0; i < 50; i++) {
      steady = rate(steady, [{ rating: steady.rating, rd: 50, score: 1 }]);
    }
    expect(steady.rd).toBeGreaterThan(50);
    expect(steady.rd).toBeLessThan(70);
  });

  it('blends partial updates and formats ratings', () => {
    const before = { rating: 1500, rd: 100, volatility: 0.06 };
    const after = { rating: 1540, rd: 80, volatility: 0.061 };
    expect(blend(before, after, 0.25)).toEqual({ rating: 1510, rd: 95, volatility: 0.06025 });
    expect(blend(before, after, 2)).toEqual(after);
    expect(isProvisional({ rd: PROVISIONAL_RD })).toBe(true);
    expect(isProvisional({ rd: 60 })).toBe(false);
    expect(formatRatingWithRd({ rating: 1419.6, rd: 59.7, volatility: 0.06 })).toBe('1,420 ± 60');
    expect(expectedScore(newRating(1500, 60), { rating: 1500, rd: 60 })).toBeCloseTo(0.5, 5);
    expect(expectedScore(newRating(1900, 60), { rating: 1500, rd: 60 })).toBeGreaterThan(0.85);
  });
});

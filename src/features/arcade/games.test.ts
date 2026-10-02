import { describe, expect, it } from 'vitest';
import { ARCADE_GAMES, describeArcadeBest, getArcadeGame } from './games';

const empty = { arcade: {}, dailyOpening: null, oddsLadder: { rung: 0, best: 0, results: {} } };

describe('arcade registry', () => {
  it('lists nine distinct games with routes', () => {
    expect(ARCADE_GAMES).toHaveLength(9);
    expect(new Set(ARCADE_GAMES.map((g) => g.id)).size).toBe(9);
    expect(getArcadeGame('simul')?.icon).toBe('boards');
    expect(getArcadeGame('fortress')?.name).toBe('Fortress');
    expect(getArcadeGame('nope')).toBeUndefined();
  });

  it('describes the best result of each kind of game', () => {
    const fortress = getArcadeGame('fortress');
    const daily = getArcadeGame('daily-opening');
    const odds = getArcadeGame('odds-ladder');
    if (!fortress || !daily || !odds) throw new Error('missing games');
    expect(describeArcadeBest(fortress, empty)).toBeNull();
    expect(
      describeArcadeBest(fortress, {
        ...empty,
        arcade: { fortress: { best: 3, plays: 2, lastAt: 1, detail: 'Held 3 positions' } },
      }),
    ).toBe('Held 3 positions · 2 plays');
    expect(describeArcadeBest(daily, empty)).toBeNull();
    expect(
      describeArcadeBest(daily, {
        ...empty,
        dailyOpening: {
          date: '2026-10-01',
          guesses: [],
          result: null,
          streak: 2,
          bestStreak: 5,
          history: { '2026-09-30': 3, '2026-09-29': 0 },
        },
      }),
    ).toBe('Streak 2 · best 5 · 2 days played');
    expect(describeArcadeBest(odds, empty)).toBeNull();
    expect(
      describeArcadeBest(odds, {
        ...empty,
        oddsLadder: { rung: 1, best: 1, results: { 0: { wins: 1, losses: 2 } } },
      }),
    ).toBe('Rung 2 of 6: Rook odds');
  });
});

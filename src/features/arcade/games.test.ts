import { describe, expect, it } from 'vitest';
import { ARCADE_GAMES, describeArcadeBest, getArcadeGame } from './games';

const empty = { arcade: {}, dailyOpening: null, oddsLadder: { rung: 0, best: 0, results: {} } };

describe('arcade registry', () => {
  it('lists eleven distinct games with routes', () => {
    expect(ARCADE_GAMES).toHaveLength(11);
    expect(new Set(ARCADE_GAMES.map((g) => g.id)).size).toBe(11);
    expect(getArcadeGame('arbiter')).toMatchObject({ icon: 'whistle', engine: false });
    expect(getArcadeGame('ghost-knight')).toMatchObject({ icon: 'ghost', engine: false });
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
    const dailyOpening = {
      date: '2026-10-01',
      guesses: [],
      result: null,
      streak: 2,
      bestStreak: 5,
      history: { '2026-09-30': 3, '2026-09-29': 0 },
    };
    // Today's state, and the streak while it is alive (solved yesterday).
    expect(describeArcadeBest(daily, { ...empty, dailyOpening, today: '2026-10-01' })).toBe(
      'Today: not played yet · streak 2 · best 5',
    );
    // A broken streak is not shown.
    expect(describeArcadeBest(daily, { ...empty, dailyOpening, today: '2026-10-09' })).toBe(
      'Today: not played yet · best 5',
    );
    expect(describeArcadeBest(odds, empty)).toBeNull();
    expect(
      describeArcadeBest(odds, {
        ...empty,
        oddsLadder: { rung: 1, best: 1, results: { 0: { wins: 1, losses: 2 } } },
      }),
    ).toBe('Rung 2 of 6: Rook odds');
    // A draw is a game played: the hub no longer says "Not played yet".
    expect(
      describeArcadeBest(odds, {
        ...empty,
        oddsLadder: { rung: 0, best: 0, results: { 0: { wins: 0, losses: 0, draws: 1 } } },
      }),
    ).toBe('Rung 1 of 6: Queen odds');
  });
});

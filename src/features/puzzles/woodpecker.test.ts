import { describe, expect, it } from 'vitest';
import type { Puzzle } from './puzzleService';
import {
  buildWoodpeckerSet,
  cycleStats,
  describeImprovement,
  nextCycleDue,
  recordWoodpecker,
  startWoodpeckerCycle,
  type WoodpeckerSet,
} from './woodpecker';

const puzzle = (id: string, rating: number): Puzzle => ({
  id,
  fen: '',
  moves: '',
  rating,
  rd: 80,
  popularity: 100,
  plays: 1000,
  themes: 'fork',
  url: '',
});

describe('woodpecker sets', () => {
  it('picks puzzles near the rating, unseen first, and widens when short', () => {
    const pool = [
      puzzle('a', 1200),
      puzzle('b', 1250),
      puzzle('c', 1900),
      puzzle('d', 1210),
      puzzle('e', 700),
    ];
    const ids = buildWoodpeckerSet(pool, 3, 1200, { d: 'solved' }, () => 0.5);
    expect(ids).toHaveLength(3);
    expect(ids.slice(0, 2).sort()).toEqual(['a', 'b']);
    expect(ids[2]).toBe('d');
    // Not enough nearby: the window widens to include the far ones.
    expect(buildWoodpeckerSet(pool, 5, 1200, {}, () => 0.5)).toHaveLength(5);
    expect(buildWoodpeckerSet(pool, 10, 1200, {}, () => 0.5)).toHaveLength(5);
  });

  it('tracks a cycle through to completion and schedules the next one', () => {
    let set: WoodpeckerSet = {
      id: 'w1',
      createdAt: 0,
      rating: 1200,
      puzzleIds: ['a', 'b', 'c'],
      cycles: [],
      current: null,
    };
    expect(nextCycleDue(set)).toBeNull();
    set = startWoodpeckerCycle(set, 1000);
    expect(set.current).toMatchObject({ cycle: 1, index: 0 });
    set = recordWoodpecker(set, 'solved', 5000, 6000);
    set = recordWoodpecker(set, 'failed', 9000, 15_000);
    expect(set.current).toMatchObject({ index: 2, solved: 1, failed: 1, timeMs: 14_000 });
    set = recordWoodpecker(set, 'solved', 4000, 20_000);
    expect(set.current).toBeNull();
    expect(set.cycles).toHaveLength(1);
    expect(set.cycles[0]).toMatchObject({
      solved: 2,
      failed: 1,
      timeMs: 18_000,
      finishedAt: 20_000,
    });
    expect(nextCycleDue(set)).toBe(20_000 + 86_400_000);
    expect(cycleStats(set)[0]).toEqual({ cycle: 1, accuracy: 67, pace: 6, minutes: 0 });
    // A second, faster cycle.
    set = startWoodpeckerCycle(set, 100_000);
    for (let i = 0; i < 3; i++) set = recordWoodpecker(set, 'solved', 3000, 110_000);
    expect(set.cycles).toHaveLength(2);
    expect(nextCycleDue(set)).toBe(110_000 + 2 * 86_400_000);
    expect(describeImprovement(set)).toBe(
      'Cycle 2 was 50% faster than cycle 1, with 100% accuracy (cycle 1: 67%).',
    );
    // Recording without a running cycle changes nothing.
    expect(recordWoodpecker(set, 'solved', 1, 2)).toBe(set);
  });
});

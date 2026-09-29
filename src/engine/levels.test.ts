import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/random';
import { ENGINE_LEVELS, getLevel, pickWeighted } from './levels';

describe('engine levels', () => {
  it('are ordered from weakest to strongest', () => {
    for (let i = 1; i < ENGINE_LEVELS.length; i++) {
      const prev = ENGINE_LEVELS[i - 1];
      const next = ENGINE_LEVELS[i];
      expect(next!.approxElo).toBeGreaterThan(prev!.approxElo);
      expect(next!.skill).toBeGreaterThanOrEqual(prev!.skill);
      expect(next!.randomMoveChance).toBeLessThanOrEqual(prev!.randomMoveChance);
    }
  });

  it('every level has a search limit', () => {
    for (const level of ENGINE_LEVELS) {
      expect(level.depth !== undefined || level.movetime !== undefined).toBe(true);
    }
  });

  it('falls back to the default level for unknown ids', () => {
    expect(getLevel(999).id).toBe(3);
    expect(getLevel(1).name).toBe('Newcomer');
  });

  it('pickWeighted prefers earlier candidates but still picks later ones', () => {
    const random = seededRandom(42);
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const pick = pickWeighted(['a', 'b', 'c', 'd'], random) as string;
      counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
    expect(counts.get('a')).toBeGreaterThan(counts.get('b') ?? 0);
    expect(counts.get('b')).toBeGreaterThan(counts.get('c') ?? 0);
    expect(counts.get('d')).toBeGreaterThan(0);
    expect(pickWeighted([])).toBeUndefined();
    expect(pickWeighted(['only'])).toBe('only');
  });
});

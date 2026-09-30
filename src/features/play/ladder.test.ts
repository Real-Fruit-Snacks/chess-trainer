import { describe, expect, it } from 'vitest';
import { ENGINE_LEVELS } from '@/engine/levels';
import type { GameRecord } from '@/store/progress';
import { buildEngineLadder, ladderGames } from './ladder';

function game(
  level: number,
  result: GameRecord['result'],
  color: GameRecord['color'] = 'white',
  pgn = '1. e4 e5 *',
): GameRecord {
  return { at: Date.now(), level, color, result, reason: 'checkmate', plies: 40, pgn };
}

describe('engine ladder', () => {
  it('starts at the bottom with nothing played', () => {
    const ladder = buildEngineLadder([]);
    expect(ladder.height).toBe(0);
    expect(ladder.next.id).toBe(1);
    expect(ladder.complete).toBe(false);
    expect(ladder.rungs.map((r) => r.status)).toEqual([
      'current',
      ...Array.from({ length: 7 }, () => 'above'),
    ]);
    expect(ladder.reason).toContain('Beat Level 1');
  });

  it('climbs a rung per beaten level and points at the next one', () => {
    const ladder = buildEngineLadder([
      game(1, '1-0'),
      game(2, '0-1', 'black'),
      game(3, '0-1'),
      game(3, '1/2-1/2'),
    ]);
    expect(ladder.height).toBe(2);
    expect(ladder.next.id).toBe(3);
    expect(ladder.rungs[2]).toMatchObject({ games: 2, wins: 0, draws: 1, losses: 1 });
    expect(ladder.reason).toContain('0–1–1 so far at Level 3');
    expect(ladder.rungs.map((r) => r.status).slice(0, 4)).toEqual([
      'climbed',
      'climbed',
      'current',
      'above',
    ]);
  });

  it('steps down after three straight losses at the next rung', () => {
    const ladder = buildEngineLadder([
      game(3, '0-1'),
      game(3, '0-1'),
      game(3, '0-1'),
      game(2, '1-0'),
    ]);
    expect(ladder.height).toBe(2);
    expect(ladder.next.id).toBe(2);
    expect(ladder.reason).toContain('Three losses in a row at Level 3');
  });

  it('credits a win at a higher level and is complete at the top', () => {
    const top = ENGINE_LEVELS[ENGINE_LEVELS.length - 1]?.id ?? 8;
    expect(buildEngineLadder([game(5, '1-0')]).height).toBe(5);
    const done = buildEngineLadder([game(top, '1-0')]);
    expect(done.complete).toBe(true);
    expect(done.next.id).toBe(top);
  });

  it('ignores games from custom positions', () => {
    const custom = game(4, '1-0', 'white', '[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n*');
    expect(ladderGames([custom, game(1, '1-0')])).toHaveLength(1);
    expect(buildEngineLadder([custom]).height).toBe(0);
  });
});

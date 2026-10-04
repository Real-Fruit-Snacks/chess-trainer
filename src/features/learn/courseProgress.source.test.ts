import { describe, expect, it } from 'vitest';
import type { GameRecord } from '@/store/progress';
import { courseStatus } from './courseProgress';
import { COURSES } from './courses';

/** The first course item that asks for a game against the engine, with its course. */
function gameItem() {
  for (const course of COURSES) {
    for (const unit of course.units) {
      const item = unit.items.find((i) => i.type === 'game');
      if (item?.type === 'game') return { course, item };
    }
  }
  throw new Error('no course asks for an engine game');
}

const record = (level: number, source: GameRecord['source']): GameRecord => ({
  id: `g-${source}-${level}`,
  at: 1,
  level,
  color: 'white',
  result: '1-0',
  reason: 'checkmate',
  plies: 30,
  pgn: '1. e4 *',
  source,
});

describe('course items that ask for an engine game', () => {
  const { course, item } = gameItem();
  const empty = { lessons: {}, drills: {}, attempts: [], games: [], guessGames: {} };
  const find = (games: GameRecord[]) =>
    courseStatus(course, { ...empty, games })
      .units.flatMap((u) => u.items)
      .find((i) => i.item === item)!;

  it('count ordinary, ladder and book games at the level or above', () => {
    expect(find([record(item.level, 'play')]).done).toBe(true);
    expect(find([record(item.level + 1, 'ladder')]).done).toBe(true);
    expect(find([record(item.level, 'book')]).done).toBe(true);
    expect(find([record(item.level - 1, 'play')]).done).toBe(false);
  });

  it('ignore handicap, simul and drill games, whatever their level', () => {
    expect(find([record(8, 'arcade')]).done).toBe(false);
    expect(find([record(8, 'simul')]).done).toBe(false);
    expect(find([record(8, 'drill')]).done).toBe(false);
  });
});

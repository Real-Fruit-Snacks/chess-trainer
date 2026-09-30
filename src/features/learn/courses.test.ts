import { describe, expect, it } from 'vitest';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { ENDGAME_DRILLS } from '@/features/drills/endgameDrills';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { THEMES } from '@/features/puzzles/themes';
import { activeCourse, courseStatus } from './courseProgress';
import { COURSES } from './courses';
import { getLesson } from './lessons';

const DRILL_IDS = new Set([...ENDGAME_DRILLS.map((d) => d.id), 'coordinates']);

describe('courses content', () => {
  it('has unique ids and only references things that exist', () => {
    const ids = COURSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const course of COURSES) {
      expect(course.units.length).toBeGreaterThanOrEqual(3);
      const unitIds = course.units.map((u) => u.id);
      expect(new Set(unitIds).size).toBe(unitIds.length);
      for (const unit of course.units) {
        expect(unit.items.length).toBeGreaterThan(0);
        for (const item of unit.items) {
          switch (item.type) {
            case 'lesson':
              expect(getLesson(item.id), `${course.id}: lesson ${item.id}`).toBeDefined();
              break;
            case 'drill':
              expect(DRILL_IDS.has(item.id), `${course.id}: drill ${item.id}`).toBe(true);
              break;
            case 'puzzles':
              expect(THEMES[item.theme], `${course.id}: theme ${item.theme}`).toBeDefined();
              expect(item.target).toBeGreaterThan(0);
              break;
            case 'repertoire':
              expect(
                BUILT_IN_REPERTOIRES.some((r) => r.id === item.id),
                `${course.id}: repertoire ${item.id}`,
              ).toBe(true);
              break;
            case 'classic':
              expect(
                CLASSIC_GAMES.some((g) => g.id === item.id),
                `${course.id}: classic ${item.id}`,
              ).toBe(true);
              break;
            case 'game':
              expect(item.level).toBeGreaterThanOrEqual(1);
              break;
          }
        }
      }
    }
  });

  it('every lesson belongs to a course exactly once, except the ones added later', () => {
    const seen = new Map<string, number>();
    for (const course of COURSES) {
      for (const unit of course.units) {
        for (const item of unit.items) {
          if (item.type === 'lesson') seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
        }
      }
    }
    for (const [id, count] of seen) expect(count, `${id} appears ${count} times`).toBe(1);
  });
});

describe('courseStatus', () => {
  const empty = { lessons: {}, drills: {}, attempts: [], games: [], guessGames: {} };
  const first = COURSES[0]!;

  it('starts with nothing done and the first unit unlocked', () => {
    const status = courseStatus(first, empty);
    expect(status.doneItems).toBe(0);
    expect(status.units[0]?.unlocked).toBe(true);
    expect(status.units[1]?.unlocked).toBe(false);
    expect(status.next?.title).toContain('Lesson:');
    expect(status.next?.unit.id).toBe(first.units[0]?.id);
  });

  it('derives item completion from the stores', () => {
    const lessonsDone = Object.fromEntries(
      first.units[0]!.items.flatMap((i) =>
        i.type === 'lesson' ? [[i.id, { stepsDone: [], completedAt: 1, lastVisitedAt: 1 }]] : [],
      ),
    );
    const status = courseStatus(first, {
      ...empty,
      lessons: lessonsDone,
      drills: { coordinates: { best: 12, attempts: 1, lastAt: 1 } },
      attempts: Array.from({ length: 3 }, (_, i) => ({
        id: `p${i}`,
        puzzleRating: 1000,
        outcome: 'solved' as const,
        hintUsed: false,
        ratingBefore: 1000,
        ratingAfter: 1000,
        themes: 'hangingPiece short',
        at: 1,
        durationMs: 1,
      })),
    });
    expect(status.units[0]?.done).toBe(true);
    expect(status.units[1]?.unlocked).toBe(true);
    const checkpoint = status.units[1]?.items.find((i) => i.item.type === 'puzzles');
    expect(checkpoint?.progress).toEqual({ value: 3, target: 5 });
    expect(checkpoint?.done).toBe(false);
    expect(status.next?.unit.id).toBe(first.units[1]?.id);
  });

  it('picks the course with the most relative progress as active', () => {
    expect(activeCourse(COURSES, empty)?.course.id).toBe('first-steps');
    const second = COURSES[1]!;
    const lessons = Object.fromEntries(
      second.units.flatMap((u) =>
        u.items.flatMap((i) =>
          i.type === 'lesson' ? [[i.id, { stepsDone: [], completedAt: 1, lastVisitedAt: 1 }]] : [],
        ),
      ),
    );
    expect(activeCourse(COURSES, { ...empty, lessons })?.course.id).toBe('club-player');
  });
});

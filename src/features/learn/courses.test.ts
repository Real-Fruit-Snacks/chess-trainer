import { describe, expect, it } from 'vitest';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { ENDGAME_DRILLS } from '@/features/drills/endgameDrills';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { THEMES } from '@/features/puzzles/themes';
import { activeCourse, courseStatus, lessonInCourse, nextInCourse } from './courseProgress';
import { type Course, COURSES } from './courses';

const lesson = (id: string) => ({ type: 'lesson' as const, id });
import { getLesson } from './lessons';

/** Drills a course can point to: the endgame drills and the skills the progress store records. */
const DRILL_IDS = new Set([
  ...ENDGAME_DRILLS.map((d) => d.id),
  'coordinates',
  'mating-patterns',
  'threats',
  'blind-puzzles',
  'self-review',
]);

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
    expect(status.next?.kind).toBe('Lesson');
    expect(status.next?.title).not.toContain(':');
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

  it('says what finishes the thinking-skill drills, and ticks them off from their records', () => {
    const club = COURSES.find((c) => c.id === 'club-player')!;
    const thinking = (drills: typeof empty.drills) =>
      courseStatus(club, { ...empty, drills })
        .units.flatMap((u) => u.items)
        .find((i) => i.item.type === 'drill' && i.item.id === 'threats');
    expect(thinking({})).toMatchObject({
      kind: 'Drill',
      title: 'What’s the threat?',
      detail: 'Name a threat',
      to: '/drills/threats',
      done: false,
    });
    expect(thinking({ threats: { best: 1, attempts: 1, lastAt: 1 } })).toMatchObject({
      detail: 'Completed',
      done: true,
    });
  });

  it('counts checkpoint solves from the lifetime counters, not the capped attempt list', () => {
    const lifetime = {
      attempts: 900,
      solved: 600,
      failed: 300,
      solvedByTheme: { hangingPiece: 7 },
      solveTimeMs: 1,
    };
    // Months later the attempt list (capped at 300) holds no hanging-piece puzzle at all.
    const status = courseStatus(first, { ...empty, lifetime });
    const checkpoint = status.units[1]?.items.find((i) => i.item.type === 'puzzles');
    expect(checkpoint?.done).toBe(true);
    expect(checkpoint?.detail).toBe('5 of 5 solved');
    // An old save whose counters lag the list falls back to the list.
    const behind = courseStatus(first, {
      ...empty,
      lifetime: { ...lifetime, solvedByTheme: {} },
      attempts: Array.from({ length: 2 }, (_, i) => ({
        id: `p${i}`,
        puzzleRating: 1000,
        outcome: 'solved' as const,
        hintUsed: false,
        ratingBefore: 1000,
        ratingAfter: 1000,
        themes: 'hangingPiece',
        at: 1,
        durationMs: 1,
      })),
    });
    expect(behind.units[1]?.items.find((i) => i.item.type === 'puzzles')?.progress?.value).toBe(2);
  });

  it('links lessons with the course they were opened from', () => {
    const status = courseStatus(first, empty);
    expect(status.next?.to).toBe('/learn/the-board?course=first-steps');
    expect(lessonInCourse('forks', 'club-player')).toBe('/learn/forks?course=club-player');
  });

  it('suggests the next unfinished item of the course after a lesson', () => {
    const unit = first.units[0]!;
    const lessonIds = unit.items.flatMap((i) => (i.type === 'lesson' ? [i.id] : []));
    const done = (ids: string[]) =>
      Object.fromEntries(
        ids.map((id) => [id, { stepsDone: [], completedAt: 1, lastVisitedAt: 1 }]),
      );
    // The first two lessons are done: after the second comes the third.
    const status = courseStatus(first, { ...empty, lessons: done(lessonIds.slice(0, 2)) });
    expect(nextInCourse(status, lessonIds[1]!)?.kind).toBe('Lesson');
    expect(nextInCourse(status, lessonIds[1]!)?.to).toBe(
      `/learn/${lessonIds[2]}?course=first-steps`,
    );
    // With nothing left after the lesson, it wraps to the first item left anywhere in the
    // course, and once only the lesson itself is left there is nothing next.
    const tiny: Course = {
      id: 'tiny',
      title: 'Tiny',
      level: 'beginner',
      blurb: '',
      units: [{ id: 'u', title: 'U', blurb: '', items: lessonIds.slice(0, 3).map(lesson) }],
    };
    const [a, b, c] = lessonIds as [string, string, string];
    const wrapped = courseStatus(tiny, { ...empty, lessons: done([b, c]) });
    expect(nextInCourse(wrapped, c)?.to).toBe(`/learn/${a}?course=tiny`);
    expect(nextInCourse(wrapped, a)).toBeNull();
  });

  it('prefers the placement course until any course has progress', () => {
    const placement = { at: 1, rating: 1300, courseId: 'club-player' };
    expect(activeCourse(COURSES, { ...empty, placement })?.course.id).toBe('club-player');
    // Once a course has progress, engagement decides.
    const lessons = {
      'the-board': { stepsDone: [], completedAt: 1, lastVisitedAt: 1 },
    };
    expect(activeCourse(COURSES, { ...empty, placement, lessons })?.course.id).toBe('first-steps');
    // A placement pointing at a course that no longer exists is ignored.
    expect(
      activeCourse(COURSES, { ...empty, placement: { ...placement, courseId: 'gone' } })?.course.id,
    ).toBe('first-steps');
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

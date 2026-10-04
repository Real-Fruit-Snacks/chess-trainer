import { themeName } from '@/features/puzzles/themes';
import type { SrsCard } from '@/lib/srs';
import type { ProgressState } from '@/store/progress';
import { cardsFor } from '@/store/repertoire';
import type { Course, CourseItem, CourseUnit } from './courses';
import { getLessonMeta } from './lessonMeta';

export interface ItemStatus {
  item: CourseItem;
  title: string;
  detail: string;
  to: string;
  done: boolean;
  /** Progress towards the target for countable items (puzzles, repertoire moves). */
  progress?: { value: number; target: number };
}

export interface UnitStatus {
  unit: CourseUnit;
  items: ItemStatus[];
  done: boolean;
  /** Earlier units are complete, so this one is the natural next step. */
  unlocked: boolean;
}

export interface CourseStatus {
  course: Course;
  units: UnitStatus[];
  doneItems: number;
  totalItems: number;
  /** The first item that is not done, or null once the course is finished. */
  next: (ItemStatus & { unit: CourseUnit }) | null;
}

type ProgressSlice = Pick<
  ProgressState,
  'lessons' | 'drills' | 'attempts' | 'games' | 'guessGames'
> &
  Partial<Pick<ProgressState, 'lifetime' | 'placement'>>;

/** The query parameter that tells a lesson which course it was opened from. */
export const COURSE_PARAM = 'course';

/** Link to a lesson opened from a course: the lesson page then offers "Back to course". */
export function lessonInCourse(lessonId: string, courseId: string): string {
  return `/learn/${lessonId}?${COURSE_PARAM}=${encodeURIComponent(courseId)}`;
}

/**
 * Solves of a theme, ever. The attempt list is capped, so the lifetime counters
 * decide; the list only matters for an old save whose counters are behind it.
 */
function solvedOnTheme(progress: ProgressSlice, theme: string): number {
  const fromList = progress.attempts.filter(
    (a) => a.outcome === 'solved' && a.themes.split(' ').includes(theme),
  ).length;
  return Math.max(progress.lifetime?.solvedByTheme[theme] ?? 0, fromList);
}

function itemStatus(
  item: CourseItem,
  progress: ProgressSlice,
  cards: Record<string, SrsCard>,
  courseId: string,
): ItemStatus {
  switch (item.type) {
    case 'lesson': {
      const lesson = getLessonMeta(item.id);
      const done = progress.lessons[item.id]?.completedAt != null;
      return {
        item,
        title: lesson ? `Lesson: ${lesson.title}` : `Lesson: ${item.id}`,
        detail: lesson ? `${lesson.minutes} min · ${lesson.category}` : 'Missing lesson',
        to: lessonInCourse(item.id, courseId),
        done,
      };
    }
    case 'drill':
      return {
        item,
        title: `Drill: ${item.title}`,
        detail: (progress.drills[item.id]?.best ?? 0) > 0 ? 'Completed' : 'Win it once',
        to: item.to,
        done: (progress.drills[item.id]?.best ?? 0) > 0,
      };
    case 'puzzles': {
      const solved = solvedOnTheme(progress, item.theme);
      const value = Math.min(solved, item.target);
      return {
        item,
        title: `Checkpoint: solve ${item.target} ${themeName(item.theme)} puzzles`,
        detail: `${value} of ${item.target} solved`,
        to: `/puzzles/themes?theme=${encodeURIComponent(item.theme)}`,
        done: solved >= item.target,
        progress: { value, target: item.target },
      };
    }
    case 'repertoire': {
      const learned = Object.keys(cardsFor(cards, item.id)).length;
      const value = Math.min(learned, item.target);
      return {
        item,
        title: `Repertoire: ${item.title}`,
        detail: `${value} of ${item.target} moves learned`,
        to: `/openings/${item.id}`,
        done: learned >= item.target,
        progress: { value, target: item.target },
      };
    }
    case 'game': {
      // Ordinary engine games only: a queen-odds or simul win is not "a game against level N".
      const done = progress.games.some(
        (g) =>
          g.level >= item.level &&
          (g.source === 'play' || g.source === 'ladder' || g.source === 'book'),
      );
      return {
        item,
        title: `Play a game against level ${item.level}`,
        detail: done ? 'Played' : 'Any result counts — finish the game',
        to: `/play?level=${item.level}`,
        done,
      };
    }
    case 'classic': {
      const done = item.id in progress.guessGames;
      return {
        item,
        title: `Classic game: ${item.title}`,
        detail: done ? 'Played through' : 'Guess the moves',
        to: `/classics/${item.id}`,
        done,
      };
    }
  }
}

/** Where the learner stands in a course, derived from the stores. */
export function courseStatus(
  course: Course,
  progress: ProgressSlice,
  cards: Record<string, SrsCard> = {},
): CourseStatus {
  let previousDone = true;
  let doneItems = 0;
  let totalItems = 0;
  let next: CourseStatus['next'] = null;
  const units = course.units.map((unit) => {
    const items = unit.items.map((item) => itemStatus(item, progress, cards, course.id));
    const done = items.every((i) => i.done);
    const unlocked = previousDone;
    previousDone = previousDone && done;
    doneItems += items.filter((i) => i.done).length;
    totalItems += items.length;
    if (!next) {
      const first = items.find((i) => !i.done);
      if (first) next = { ...first, unit };
    }
    return { unit, items, done, unlocked };
  });
  return { course, units, doneItems, totalItems, next };
}

/**
 * The course the learner is most engaged with (the largest share of items done).
 * Before any course has progress, the placement quiz's recommendation wins; without
 * one, the first course that is not finished.
 */
export function activeCourse(
  courses: Course[],
  progress: ProgressSlice,
  cards: Record<string, SrsCard> = {},
): CourseStatus | null {
  const statuses = courses.map((c) => courseStatus(c, progress, cards));
  const started = statuses.filter((s) => s.doneItems > 0 && s.next);
  if (started.length === 0) {
    const placed = statuses.find((s) => s.course.id === progress.placement?.courseId && s.next);
    return placed ?? statuses.find((s) => s.next) ?? null;
  }
  started.sort((a, b) => b.doneItems / b.totalItems - a.doneItems / a.totalItems);
  return started[0] ?? null;
}

/**
 * Where to go after a lesson opened from a course: the first unfinished item after
 * it in the course, else the first unfinished item anywhere in the course, else
 * null (the course is complete).
 */
export function nextInCourse(
  status: CourseStatus,
  lessonId: string,
): (ItemStatus & { unit: CourseUnit }) | null {
  const items = status.units.flatMap((u) => u.items.map((i) => ({ ...i, unit: u.unit })));
  const at = items.findIndex((i) => i.item.type === 'lesson' && i.item.id === lessonId);
  const after = at >= 0 ? items.slice(at + 1).find((i) => !i.done) : undefined;
  return after ?? items.find((i) => !i.done && i !== items[at]) ?? null;
}

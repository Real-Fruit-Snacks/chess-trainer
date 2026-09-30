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
>;

function itemStatus(
  item: CourseItem,
  progress: ProgressSlice,
  cards: Record<string, SrsCard>,
): ItemStatus {
  switch (item.type) {
    case 'lesson': {
      const lesson = getLessonMeta(item.id);
      const done = progress.lessons[item.id]?.completedAt != null;
      return {
        item,
        title: lesson ? `Lesson: ${lesson.title}` : `Lesson: ${item.id}`,
        detail: lesson ? `${lesson.minutes} min · ${lesson.category}` : 'Missing lesson',
        to: `/learn/${item.id}`,
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
      const solved = progress.attempts.filter(
        (a) => a.outcome === 'solved' && a.themes.split(' ').includes(item.theme),
      ).length;
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
      const done = progress.games.some((g) => g.level >= item.level);
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
    const items = unit.items.map((item) => itemStatus(item, progress, cards));
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

/** The course the learner is most engaged with (most items done, then lowest level). */
export function activeCourse(
  courses: Course[],
  progress: ProgressSlice,
  cards: Record<string, SrsCard> = {},
): CourseStatus | null {
  const statuses = courses.map((c) => courseStatus(c, progress, cards));
  const started = statuses.filter((s) => s.doneItems > 0 && s.next);
  if (started.length === 0) return statuses.find((s) => s.next) ?? null;
  started.sort((a, b) => b.doneItems / b.totalItems - a.doneItems / a.totalItems);
  return started[0] ?? null;
}

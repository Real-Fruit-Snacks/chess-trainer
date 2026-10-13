import { parsePgnCached } from '@/chess/tree';
import { ladderOrder } from '@/features/drills/endgameLadder';
import { LESSON_META } from '@/features/learn/lessonMeta';
import { repertoireStats } from '@/features/openings/model';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { buildThemeReport, themeBaseline } from '@/features/progress/themeReport';
import { themeName } from '@/features/puzzles/themes';
import { localDateKey } from '@/lib/dates';
import { dueReviews } from '@/lib/puzzleReview';
import type { ProgressState } from '@/store/progress';
import { cardsFor, type CustomRepertoire } from '@/store/repertoire';
import type { SrsCard } from '@/lib/srs';
import type { WorkItem } from '@/features/games/insights';

export interface PlanItem {
  id: string;
  title: string;
  detail: string;
  to: string;
  done: boolean;
  /** Rough minutes, for the header. */
  minutes: number;
  /** The estimate was capped at `minutes`: there is more to do than that ("10+ min"). */
  moreThan?: boolean;
}

export interface DailyPlan {
  items: PlanItem[];
  done: number;
  total: number;
}

const RATED_TARGET = 5;
const THEME_TARGET = 5;
/** A theme is weak only this many points below the learner's own accuracy… */
export const WEAK_THEME_MARGIN = 15;
/** …and only once it has this many attempts. */
export const WEAK_THEME_MIN_ATTEMPTS = 20;

/** A lesson worked through (not just marked done) at `since` or later. */
function workedThroughSince(
  lesson: ProgressState['lessons'][string] | undefined,
  since: number,
): boolean {
  return lesson?.completedAt != null && !lesson.marked && lesson.completedAt >= since;
}

/** A minutes estimate capped at `max`, flagged when the cap cut it short. */
function capped(minutes: number, max: number): Pick<PlanItem, 'minutes' | 'moreThan'> {
  return minutes > max ? { minutes: max, moreThan: true } : { minutes };
}

const ENDGAME_ROTATION = ladderOrder().map((d) => ({
  id: d.id,
  title: d.title,
  description: d.description,
  to: `/drills/endgame/${d.id}`,
}));

/**
 * Drills the plan rotates through: never done first (in this order: the first
 * endgame drill, the threat drill, the rest of the endgame ladder…), then the
 * least recent.
 */
const DRILL_ROTATION: { id: string; title: string; description: string; to: string }[] = [
  ...ENDGAME_ROTATION.slice(0, 1),
  {
    id: 'threats',
    title: 'What’s the threat?',
    description: 'Name what your opponent threatens, then meet it',
    to: '/drills/threats',
  },
  ...ENDGAME_ROTATION.slice(1),
  {
    id: 'coordinates',
    title: 'Coordinates',
    description: 'Thirty seconds of board vision',
    to: '/drills/coordinates',
  },
  {
    id: 'vision-checks',
    title: 'Find every check',
    description: 'Spot all the checks in a position',
    to: '/drills/vision?mode=checks',
  },
  {
    id: 'vision-recall',
    title: 'Guess the position',
    description: 'Track the pieces of an opening in your head',
    to: '/drills/vision?mode=recall',
  },
  {
    id: 'blind-puzzles',
    title: 'Blind puzzles',
    description: 'Solve a puzzle with the board frozen at the start',
    to: '/puzzles/blind',
  },
];

/**
 * The weakest practiceable theme, when it is weak enough to matter: at least
 * `WEAK_THEME_MIN_ATTEMPTS` attempts and an accuracy more than
 * `WEAK_THEME_MARGIN` points below what the learner scores across all themes.
 * (Rated puzzles are chosen near the rating, so a fixed bar such as 70 % would
 * flag nearly every theme.)
 */
export function weakestTheme(
  themeStats: ProgressState['themeStats'],
): { tag: string; accuracy: number; expected: number } | null {
  const expected = themeBaseline(themeStats);
  if (expected === null) return null;
  const worst = buildThemeReport(themeStats, WEAK_THEME_MIN_ATTEMPTS)[0];
  return worst && worst.accuracy < expected - WEAK_THEME_MARGIN
    ? { tag: worst.tag, accuracy: worst.accuracy, expected }
    : null;
}

/**
 * Builds today's training plan from the stores: what is due, what is next
 * and what has already been done today. Pure, so it is easy to test.
 */
export function buildDailyPlan(
  progress: Pick<
    ProgressState,
    'daily' | 'attempts' | 'puzzleReviews' | 'lessons' | 'drills' | 'onboarded' | 'games'
  > &
    Partial<Pick<ProgressState, 'themeStats' | 'lessonRecall' | 'dailyOpening'>>,
  repertoire: { cards: Record<string, SrsCard>; custom: CustomRepertoire[] },
  now: number,
  /** From the game insights: the mistake or phase to work on (see features/games/insights). */
  workOn: WorkItem[] = [],
): DailyPlan {
  const today = localDateKey(new Date(now));
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();
  const items: PlanItem[] = [];

  // 1. Daily puzzle
  const dailyDone = progress.daily?.date === today && progress.daily.outcome !== null;
  items.push({
    id: 'daily',
    title: 'Daily puzzle',
    detail: dailyDone
      ? `Done — ${progress.daily?.outcome === 'solved' ? 'solved' : 'missed; a new puzzle tomorrow'}`
      : 'One puzzle, same for everyone today',
    to: '/puzzles/daily',
    done: dailyDone,
    minutes: 2,
  });

  // 1b. The Daily Opening (an arcade game, so a proper name): two minutes of naming the opening of the day.
  const openingDone =
    progress.dailyOpening?.date === today && progress.dailyOpening.result !== null;
  items.push({
    id: 'dailyOpening',
    title: 'Daily Opening',
    detail: openingDone
      ? `Done — ${
          progress.dailyOpening?.result === 'solved'
            ? `solved in ${progress.dailyOpening.guesses.length}`
            : 'missed, a new one tomorrow'
        }`
      : 'Guess the opening of the day in six tries',
    to: '/arcade/daily-opening',
    done: openingDone,
    minutes: 2,
  });

  // 2. Rated puzzles: always — they are what the rating is built from. Solves count.
  const solvedToday = progress.attempts.filter((a) => a.at >= dayStart && a.outcome === 'solved');
  const ratedToday = solvedToday.filter((a) => a.ratingBefore !== a.ratingAfter).length;
  items.push({
    id: 'rated',
    title: `Solve ${RATED_TARGET} rated puzzles`,
    detail: `${Math.min(ratedToday, RATED_TARGET)} of ${RATED_TARGET} today`,
    to: '/puzzles',
    done: ratedToday >= RATED_TARGET,
    minutes: 8,
  });

  // 2b. The weakest theme, once the statistics clearly show one.
  const weak = weakestTheme(progress.themeStats ?? {});
  if (weak) {
    const themedToday = solvedToday.filter((a) => a.themes.split(' ').includes(weak.tag)).length;
    items.push({
      id: 'weakTheme',
      title: `Solve ${THEME_TARGET} puzzles on ${themeName(weak.tag)}`,
      detail: `Your weakest theme (${weak.accuracy}% against ${weak.expected}% overall) · ${Math.min(themedToday, THEME_TARGET)} of ${THEME_TARGET} solved today`,
      to: `/puzzles/themes?theme=${encodeURIComponent(weak.tag)}`,
      done: themedToday >= THEME_TARGET,
      minutes: 8,
    });
  }

  // 3. Puzzle review queue
  const due = dueReviews(progress.puzzleReviews, now).length;
  if (due > 0 || Object.keys(progress.puzzleReviews).length > 0) {
    items.push({
      id: 'review',
      title: 'Review missed puzzles',
      detail: due > 0 ? `${due} due` : 'Nothing due — all caught up',
      to: '/puzzles/review',
      done: due === 0,
      ...capped(due * 2, 10),
    });
  }

  // 3b. Lesson recall
  const recallCards = progress.lessonRecall ?? {};
  const recallDue = dueReviews(recallCards, now).length;
  const recallScheduled = Object.keys(recallCards).length;
  if (recallScheduled > 0) {
    items.push({
      id: 'recall',
      title: 'Recall lesson positions',
      detail:
        recallDue > 0
          ? `${recallDue} due`
          : `Nothing due today · ${recallScheduled} position${recallScheduled === 1 ? '' : 's'} scheduled`,
      to: '/learn/recall',
      done: recallDue === 0,
      ...capped(recallDue + 1, 8),
    });
  }

  // 4. Opening reviews
  const all = [
    ...BUILT_IN_REPERTOIRES.map((r) => ({ id: r.id, color: r.color, pgn: r.pgn })),
    ...repertoire.custom.map((c) => ({ id: c.id, color: c.color, pgn: c.pgn })),
  ];
  let openingDue = 0;
  let openingLearned = 0;
  // The built-in repertoire with the most learned moves supplies "tactics from your openings".
  let bestRepertoire: { id: string; name: string; tag: string; learned: number } | null = null;
  for (const rep of all) {
    try {
      const stats = repertoireStats(
        parsePgnCached(rep.pgn),
        rep.color,
        cardsFor(repertoire.cards, rep.id),
        now,
      );
      openingDue += stats.due;
      openingLearned += stats.learned;
      const builtIn = BUILT_IN_REPERTOIRES.find((r) => r.id === rep.id);
      const tag = builtIn?.openingTags[0];
      if (builtIn && tag && stats.learned > 0 && stats.learned > (bestRepertoire?.learned ?? 0)) {
        bestRepertoire = { id: rep.id, name: builtIn.name, tag, learned: stats.learned };
      }
    } catch {
      // ignore broken custom PGN
    }
  }
  if (openingLearned > 0) {
    items.push({
      id: 'openings',
      title: 'Review your openings',
      detail:
        openingDue > 0
          ? `${openingDue} move${openingDue === 1 ? '' : 's'} due`
          : 'Nothing due today',
      to: '/openings',
      done: openingDue === 0,
      ...capped(Math.ceil(openingDue / 4) + 2, 10),
    });
  }

  // 4b. Tactics from the opening you are learning most.
  if (bestRepertoire) {
    const openingSolvedToday = progress.attempts.some(
      (a) => a.at >= dayStart && a.opening !== undefined && a.opening === bestRepertoire?.tag,
    );
    items.push({
      id: 'openingTactics',
      title: `Tactics from the ${bestRepertoire.name}`,
      detail: openingSolvedToday
        ? 'Done today'
        : 'Puzzles that arose from your opening in real games',
      to: `/puzzles/openings?opening=${encodeURIComponent(bestRepertoire.tag)}`,
      done: openingSolvedToday,
      minutes: 5,
    });
  }

  // 4c. What the reviewed games say to work on.
  const work = workOn[0];
  if (work) {
    const lesson = work.lessonId ? LESSON_META.find((l) => l.id === work.lessonId) : undefined;
    const solvedTheme =
      work.theme !== null &&
      progress.attempts.some(
        (a) => a.at >= dayStart && a.themes.split(' ').includes(work.theme ?? ''),
      );
    const lessonToday =
      lesson !== undefined && workedThroughSince(progress.lessons[lesson.id], dayStart);
    items.push({
      id: 'workOn',
      title: `Work on: ${work.title}`,
      detail:
        solvedTheme || lessonToday
          ? 'Practised today'
          : work.theme
            ? `${work.detail} · puzzles on this theme`
            : lesson
              ? `${work.detail} · lesson: ${lesson.title}`
              : work.detail,
      to: work.theme
        ? `/puzzles/themes?theme=${encodeURIComponent(work.theme)}`
        : lesson
          ? `/learn/${lesson.id}`
          : '/games',
      done: solvedTheme || lessonToday,
      minutes: 6,
    });
  }

  // 5. Next lesson
  const lessonDoneToday = Object.values(progress.lessons).some((l) =>
    workedThroughSince(l, dayStart),
  );
  const next = LESSON_META.find((l) => !progress.lessons[l.id]?.completedAt);
  if (next) {
    items.push({
      id: 'lesson',
      title: lessonDoneToday ? 'Lesson done for today' : `Lesson: ${next.title}`,
      // The minutes have a column of their own: the detail is the lesson's size and topic.
      detail: lessonDoneToday ? `Up next: ${next.title}` : `${next.steps} steps · ${next.category}`,
      to: `/learn/${next.id}`,
      done: lessonDoneToday,
      minutes: next.minutes,
    });
  }

  // 6. A drill: rotate through them, never-done first, then the least recent.
  const drillDoneToday = Object.values(progress.drills).some((d) => d.lastAt >= dayStart);
  const drill = [...DRILL_ROTATION].sort(
    (a, b) => (progress.drills[a.id]?.lastAt ?? 0) - (progress.drills[b.id]?.lastAt ?? 0),
  )[0];
  items.push({
    id: 'drill',
    title: drillDoneToday ? 'Drill done for today' : `Drill: ${drill?.title ?? 'Coordinates'}`,
    detail: drillDoneToday
      ? 'Keep the skills sharp tomorrow'
      : (drill?.description ?? 'Thirty seconds of board vision'),
    to: drill?.to ?? '/drills/coordinates',
    done: drillDoneToday,
    minutes: 5,
  });

  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length };
}

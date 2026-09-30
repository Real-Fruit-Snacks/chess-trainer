import { DAY_MS } from '@/lib/srs';
import type { ProgressState } from '@/store/progress';

export interface WeekFigures {
  puzzlesSolved: number;
  puzzlesAttempted: number;
  /** 0–100, or null with no attempts. */
  accuracy: number | null;
  lessonsCompleted: number;
  gamesPlayed: number;
  drills: number;
  trainingDays: number;
  /** Rating at the end of the window minus the rating at its start; null without rated puzzles. */
  ratingChange: number | null;
}

export interface WeeklySummary {
  thisWeek: WeekFigures;
  lastWeek: WeekFigures;
}

const WEEK_MS = 7 * DAY_MS;

function figures(
  progress: Pick<
    ProgressState,
    'attempts' | 'lessons' | 'games' | 'drills' | 'trainingDays' | 'ratingHistory'
  >,
  from: number,
  to: number,
): WeekFigures {
  const attempts = progress.attempts.filter((a) => a.at >= from && a.at < to);
  const solved = attempts.filter((a) => a.outcome === 'solved').length;
  const lessonsCompleted = Object.values(progress.lessons).filter(
    (l) => l.completedAt !== null && l.completedAt >= from && l.completedAt < to,
  ).length;
  const gamesPlayed = progress.games.filter((g) => g.at >= from && g.at < to).length;
  const drills = Object.values(progress.drills).filter(
    (d) => d.lastAt >= from && d.lastAt < to,
  ).length;
  const trainingDays = progress.trainingDays.filter((day) => {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
    return t >= from - DAY_MS && t < to;
  }).length;
  const inWindow = progress.ratingHistory.filter((p) => p.at >= from && p.at < to);
  const before = [...progress.ratingHistory].reverse().find((p) => p.at < from);
  const first = before ?? inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const ratingChange = first && last ? Math.round(last.rating - first.rating) : null;
  return {
    puzzlesSolved: solved,
    puzzlesAttempted: attempts.length,
    accuracy: attempts.length ? Math.round((solved / attempts.length) * 100) : null,
    lessonsCompleted,
    gamesPlayed,
    drills,
    trainingDays,
    ratingChange,
  };
}

/** The last seven days against the seven before them. */
export function weeklySummary(
  progress: Parameters<typeof figures>[0],
  now = Date.now(),
): WeeklySummary {
  return {
    thisWeek: figures(progress, now - WEEK_MS, now + 1),
    lastWeek: figures(progress, now - 2 * WEEK_MS, now - WEEK_MS),
  };
}

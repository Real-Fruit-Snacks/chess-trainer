import { PRACTICE_GROUPS, THEMES } from '@/features/puzzles/themes';
import type { ThemeStat } from '@/store/progress';

export interface ThemeReportRow {
  tag: string;
  solved: number;
  failed: number;
  attempts: number;
  /** 0–100 */
  accuracy: number;
}

/** Minimum attempts before a theme is worth reporting. */
export const THEME_REPORT_MIN_ATTEMPTS = 5;

/**
 * Turns raw per-theme counters into a report of the practiceable themes
 * (motifs, mates, phases…), skipping meta tags such as "short" or "master".
 */
export function buildThemeReport(
  stats: Record<string, ThemeStat>,
  minAttempts = THEME_REPORT_MIN_ATTEMPTS,
): ThemeReportRow[] {
  return Object.entries(stats)
    .filter(([tag]) => {
      const info = THEMES[tag];
      return !!info && PRACTICE_GROUPS.includes(info.group);
    })
    .map(([tag, stat]) => {
      const attempts = stat.solved + stat.failed;
      return {
        tag,
        solved: stat.solved,
        failed: stat.failed,
        attempts,
        accuracy: attempts ? Math.round((stat.solved / attempts) * 100) : 0,
      };
    })
    .filter((row) => row.attempts >= minAttempts)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
}

/**
 * The learner's own accuracy across all practiceable themes (0–100), or null
 * before any attempt: what a theme is expected to score, so "weak" and "going
 * well" are measured against the learner rather than a fixed number (rated
 * puzzles are picked near the rating, so everyone hovers around the same rate).
 */
export function themeBaseline(stats: Record<string, ThemeStat>): number | null {
  const rows = buildThemeReport(stats, 1);
  const attempts = rows.reduce((sum, r) => sum + r.attempts, 0);
  if (attempts === 0) return null;
  const solved = rows.reduce((sum, r) => sum + r.solved, 0);
  return Math.round((solved / attempts) * 100);
}

/**
 * Splits the report into the themes below the learner's own accuracy ("work on
 * these", weakest first) and the rest ("going well", strongest first): a theme
 * is never in both lists, however few are ranked.
 */
export function splitThemeReport(
  rows: ThemeReportRow[],
  baseline: number | null,
  limit = 5,
): { weak: ThemeReportRow[]; strong: ThemeReportRow[] } {
  const line = baseline ?? 0;
  const weak = rows.filter((r) => r.accuracy < line).sort((a, b) => a.accuracy - b.accuracy);
  const strong = rows
    .filter((r) => r.accuracy >= line)
    .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
  return { weak: weak.slice(0, limit), strong: strong.slice(0, limit) };
}

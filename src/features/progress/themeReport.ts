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

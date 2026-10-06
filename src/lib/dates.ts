/** Local calendar date as YYYY-MM-DD (used for streaks and the daily puzzle). */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days between two YYYY-MM-DD keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1);
  const db = Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((db - da) / 86_400_000);
}

export function formatDate(iso: string | number, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

/**
 * A PGN date ("2026.09.29", "2026.??.??") for display: the whole date in the
 * locale's medium style, like the dates of games with a timestamp, or the year
 * alone when only the year is known; null when the date says nothing.
 */
export function formatPgnDate(date: string | undefined, locale = 'en-GB'): string | null {
  const match = /^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/.exec(date?.trim() ?? '');
  if (!match) return null;
  const [, year, month, day] = match as unknown as [string, string, string, string];
  if (month === '??' || day === '??') return year;
  const at = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // 2026.02.31 is no date (Date.UTC would roll it over into March).
  if (at.getUTCMonth() !== Number(month) - 1 || at.getUTCDate() !== Number(day)) return year;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(at);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Current and best streak of consecutive training days. The current streak
 * survives until the end of the day after the last training day, so a
 * learner who trained yesterday still sees their streak this morning.
 */
export function trainingStreak(
  days: readonly string[],
  today: string = localDateKey(),
): { current: number; best: number } {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous && daysBetween(previous, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  const last = sorted[sorted.length - 1];
  const alive = last !== undefined && daysBetween(last, today) <= 1;
  return { current: alive ? run : 0, best };
}

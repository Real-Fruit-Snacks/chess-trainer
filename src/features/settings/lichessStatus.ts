import { formatDate } from '@/lib/dates';
import type { SyncReport } from '@/lib/lichess/sync';
import { siteConfig } from '@/site.config';

/** Wording for the Lichess card: when things happened and what a sync did. */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "just now", "5 minutes ago", "3 hours ago", "on 2 Oct 2026". */
export function describeWhen(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  return `on ${formatDate(at, siteConfig.locale)}`;
}

/** What a finished sync did, as a sentence; null when it found nothing to do. */
export function describeReport(report: SyncReport): string | null {
  const parts: string[] = [];
  if (report.puzzlesSent > 0) parts.push(`${plural(report.puzzlesSent, 'puzzle result')} sent`);
  if (report.roundsAdded > 0) {
    const review = report.reviewsAdded > 0 ? ` (${report.reviewsAdded} to review)` : '';
    parts.push(`${plural(report.roundsAdded, 'puzzle')} from your Lichess history${review}`);
  }
  if (report.gamesSent > 0) parts.push(`${plural(report.gamesSent, 'game')} sent`);
  if (report.gamesAdded > 0) parts.push(`${plural(report.gamesAdded, 'game')} from other devices`);
  const studies = report.studies;
  if (studies && studies.pulled > 0) {
    parts.push(
      `${plural(studies.pulled, 'repertoire or analysis', 'repertoires and analyses')} updated here`,
    );
  }
  if (studies && studies.pushed > 0) {
    parts.push(`${plural(studies.pushed, 'change')} sent to your studies`);
  }
  if (parts.length === 0) return null;
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

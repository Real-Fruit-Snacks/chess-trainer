import type { DeviceSyncStatus, SyncExchange } from '@/lib/sync/deviceSync';
import { SYNC_KINDS, type SyncChanges, type SyncCounts, type SyncKind } from '@/lib/sync/counts';
import type { SyncPart } from '@/lib/sync/parts';
import { siteConfig } from '@/site.config';
import { describeWhen } from './lichessStatus';

/** The device-sync card's status line: what the sync is doing, or when it last finished. */
export function deviceSyncStatusLine(
  status: DeviceSyncStatus,
  lastSyncAt: number | null,
  now: number,
): string {
  switch (status.phase) {
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return 'Offline: syncing carries on when this device is back online.';
    case 'too-large':
      return `${status.error ?? 'There is more to sync than the sync service keeps.'} Delete some imported games or saved analyses to make room.`;
    case 'newer':
      return (
        status.error ??
        'Another device synced with a newer version of the app. Update the app on this device to keep syncing.'
      );
    case 'failed':
      return `The last sync did not finish: ${status.error ?? 'something went wrong.'}`;
    default:
      break;
  }
  if (lastSyncAt === null) return 'Not synced yet.';
  return `Synced ${describeWhen(lastSyncAt, now)}.`;
}

/** Whether the status needs the learner's attention (shown as a warning, not a quiet line). */
export const deviceSyncNeedsAttention = (status: DeviceSyncStatus): boolean =>
  status.phase === 'too-large' || status.phase === 'newer' || status.phase === 'failed';

/** Each kind's name, for one and for more, in a list of changes. */
const CHANGED: Record<SyncKind, [string, string]> = {
  puzzles: ['puzzle', 'puzzles'],
  lessons: ['lesson', 'lessons'],
  repertoires: ['repertoire', 'repertoires'],
  moves: ['repertoire move', 'repertoire moves'],
  analyses: ['analysis', 'analyses'],
  games: ['imported game', 'imported games'],
};

/** Each kind's name in a list of what a profile holds. */
const HELD: Record<SyncKind, [string, string]> = {
  ...CHANGED,
  lessons: ['lesson completed', 'lessons completed'],
  analyses: ['saved analysis', 'saved analyses'],
};

/** Each part of the profile a device can keep to itself, as its switch names it. */
export const SYNC_PART_TEXT: Record<SyncPart, { label: string; description: string }> = {
  progress: {
    label: 'Progress',
    description:
      'Puzzles, lessons, ratings, review schedules, training days and every other result.',
  },
  repertoire: {
    label: 'Repertoires',
    description: 'Your own repertoires, and the review schedule of every repertoire move.',
  },
  analyses: { label: 'Saved analyses', description: 'The analysis library.' },
  games: { label: 'Imported games', description: 'Games fetched from Lichess or chess.com.' },
  settings: {
    label: 'Settings',
    description:
      'How the app looks, sounds and plays. The engine’s threads and its full download stay with each device.',
  },
};

/** Each kind's heading over its total on the card. */
export const TOTAL_LABELS: Record<SyncKind, string> = {
  puzzles: 'Puzzles',
  lessons: 'Lessons completed',
  repertoires: 'Your repertoires',
  moves: 'Repertoire moves',
  analyses: 'Saved analyses',
  games: 'Imported games',
};

/** 1240 → "1,240". */
export const formatCount = (n: number): string => n.toLocaleString(siteConfig.locale);

const counted = (n: number, [one, many]: [string, string]) =>
  `${formatCount(n)} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

/** Changes as a list: "4 puzzles, 1 lesson, 2 settings and 2 deletions"; null when nothing changed. */
export function describeChanges(changes: SyncChanges | null): string | null {
  if (!changes) return null;
  const parts = SYNC_KINDS.filter((kind) => changes.changed[kind] > 0).map((kind) =>
    counted(changes.changed[kind], CHANGED[kind]),
  );
  // Data that changed uncounted (a rating, a drill): said only when no counted data changed.
  if (parts.length === 0 && changes.removed === 0 && changes.other) parts.push('progress');
  if (changes.settings > 0) parts.push(counted(changes.settings, ['setting', 'settings']));
  if (changes.removed > 0) parts.push(counted(changes.removed, ['deletion', 'deletions']));
  return parts.length > 0 ? listOf(parts) : null;
}

/** What a profile holds, as a list of what it has: "1,240 puzzles and 3 repertoires". */
export function describeTotals(totals: SyncCounts): string | null {
  const parts = SYNC_KINDS.filter((kind) => totals[kind] > 0).map((kind) =>
    counted(totals[kind], HELD[kind]),
  );
  return parts.length > 0 ? listOf(parts) : null;
}

const capitalised = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * What a run moved, as a sentence: "4 puzzles and 1 analysis from your other
 * devices; 2 imported games sent." Null when it moved nothing.
 */
export function describeExchange(exchange: SyncExchange | null): string | null {
  if (!exchange) return null;
  const brought = describeChanges(exchange.brought);
  const sent = describeChanges(exchange.sent);
  const parts = [
    brought ? `${brought} from your other devices` : null,
    sent ? `${sent} sent` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `${capitalised(parts.join('; '))}.` : null;
}

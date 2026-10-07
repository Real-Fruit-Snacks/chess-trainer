import type { DeviceSyncStatus } from '@/lib/sync/deviceSync';
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

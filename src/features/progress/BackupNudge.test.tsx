import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_NUDGE_ATTEMPTS } from '@/lib/backup';
import { deviceSyncStorageKey } from '@/lib/sync/enabled';
import { useProgress } from '@/store/progress';
import { BackupNudge } from './BackupNudge';

const DAY = 86_400_000;

/** Device sync as stored with it on, last synced `ago` ms back. */
const syncedAgo = (ago: number) =>
  localStorage.setItem(
    deviceSyncStorageKey(),
    JSON.stringify({
      state: { secret: 'AAAAAAAAAAAAAAAAAAAAAA', lastSyncAt: Date.now() - ago },
      version: 1,
    }),
  );

describe('BackupNudge', () => {
  beforeEach(() => {
    useProgress.setState({
      ratedAttempts: BACKUP_NUDGE_ATTEMPTS,
      lastBackupAt: null,
      lastBackupAttempts: 0,
      backupSnoozedUntil: null,
    });
  });

  it('asks for a backup once there is something worth keeping', () => {
    render(<BackupNudge />);
    expect(screen.getByTestId('backup-nudge')).toHaveTextContent('You have never made a backup');
  });

  it('rests while device sync keeps a recent copy elsewhere', () => {
    syncedAgo(DAY);
    render(<BackupNudge />);
    expect(screen.queryByTestId('backup-nudge')).toBeNull();
  });

  it('comes back when device sync has not finished in over a week', () => {
    syncedAgo(8 * DAY);
    render(<BackupNudge />);
    expect(screen.getByTestId('backup-nudge')).toBeInTheDocument();
  });
});

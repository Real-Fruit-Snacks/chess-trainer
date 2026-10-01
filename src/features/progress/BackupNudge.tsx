import { Alert, Button } from '@/components/ui';
import { backupStatus } from '@/lib/backup';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { useBackupActions } from '@/features/settings/useBackupActions';

/**
 * A reminder to back up after a stretch of training without one. Progress
 * lives only on this device, so a lost phone is lost progress.
 */
export function BackupNudge({ compact = false }: { compact?: boolean }) {
  const ratedAttempts = useProgress((s) => s.ratedAttempts);
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const lastBackupAttempts = useSettings((s) => s.lastBackupAttempts);
  const actions = useBackupActions();
  const status = backupStatus(ratedAttempts, lastBackupAt, lastBackupAttempts);
  if (!status.due) return null;
  const since =
    status.daysSince === null
      ? `You have solved ${status.attemptsSince} rated puzzles and never made a backup.`
      : `${status.attemptsSince} rated puzzles since your last backup, ${status.daysSince} days ago.`;
  return (
    <Alert tone="info">
      <div className="row row--between" data-testid="backup-nudge">
        <span>
          <strong>Back up your progress.</strong>{' '}
          {compact ? null : 'Everything is stored on this device only. '}
          {since}
        </span>
        <span className="row">
          {actions.canShare ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void actions.share()}
              disabled={actions.busy}
            >
              Share
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={actions.canShare ? 'secondary' : 'primary'}
            onClick={actions.download}
          >
            Export
          </Button>
        </span>
      </div>
    </Alert>
  );
}

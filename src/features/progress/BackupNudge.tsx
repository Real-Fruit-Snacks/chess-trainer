import { Alert, Button } from '@/components/ui';
import { BACKUP_SNOOZE_DAYS, backupStatus } from '@/lib/backup';
import { localDateKey } from '@/lib/dates';
import { deviceSyncedRecently } from '@/lib/sync/enabled';
import { DAY_MS } from '@/lib/srs';
import { useGames } from '@/store/games';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { useBackupActions } from '@/features/settings/useBackupActions';
import { useLichess } from '@/store/lichess';

/** "14 days ago", "yesterday", "today". */
function describeDays(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Device sync this recent keeps a copy for the other devices: no reminder needed. */
const SYNCED_WITHIN_MS = 7 * DAY_MS;

/**
 * A reminder to back up after a stretch of training without one. Progress
 * lives only on this device, so a lost phone is lost progress. Shown once
 * there is anything worth keeping — puzzles, lessons, openings or games — and
 * "Later" hides it for a week. Not shown while device sync keeps a copy.
 */
export function BackupNudge({ compact = false }: { compact?: boolean }) {
  const ratedAttempts = useProgress((s) => s.ratedAttempts);
  const lichessConnected = useLichess((s) => s.account !== null);
  const lastBackupAt = useProgress((s) => s.lastBackupAt);
  const lastBackupAttempts = useProgress((s) => s.lastBackupAttempts);
  const backupSnoozedUntil = useProgress((s) => s.backupSnoozedUntil);
  const trainingDays = useProgress((s) => s.trainingDays.length);
  const lastTrainingDay = useProgress((s) => s.trainingDays[s.trainingDays.length - 1] ?? null);
  const lessonsCompleted = useProgress(
    (s) => Object.values(s.lessons).filter((l) => l.completedAt !== null).length,
  );
  const engineGames = useProgress((s) => s.games.length);
  const importedGames = useGames((s) => Object.keys(s.games).length);
  const repertoireCards = useRepertoire((s) => Object.keys(s.cards).length);
  const snooze = useProgress((s) => s.snoozeBackup);
  const actions = useBackupActions();
  const status = backupStatus(
    { ratedAttempts, lastBackupAt, lastBackupAttempts, backupSnoozedUntil },
    {
      trainingDays,
      lessonsCompleted,
      repertoireCards,
      games: engineGames + importedGames,
      activeSinceBackup:
        lastBackupAt === null ||
        (lastTrainingDay !== null && lastTrainingDay > localDateKey(new Date(lastBackupAt))),
    },
  );
  if (!status.due || deviceSyncedRecently(SYNCED_WITHIN_MS)) return null;
  const attempts = `${status.attemptsSince} rated puzzle attempt${status.attemptsSince === 1 ? '' : 's'}`;
  const since =
    status.daysSince === null
      ? `You have never made a backup${status.attemptsSince > 0 ? ` (${attempts} so far)` : ''}.`
      : `Your last backup was ${describeDays(status.daysSince)}${status.attemptsSince > 0 ? `, ${attempts} ago` : ''}.`;
  return (
    <Alert tone="info">
      <div className="row row--between" data-testid="backup-nudge">
        <span>
          <strong>Back up your progress.</strong>{' '}
          {compact
            ? null
            : lichessConnected
              ? 'Lessons, flashcards and review schedules are stored on this device only. '
              : 'Everything is stored on this device only. '}
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => snooze(Date.now() + BACKUP_SNOOZE_DAYS * DAY_MS)}
            data-testid="backup-later"
          >
            Later
          </Button>
        </span>
      </div>
    </Alert>
  );
}

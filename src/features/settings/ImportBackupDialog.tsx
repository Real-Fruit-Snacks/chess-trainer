import { Alert, Button, Dialog } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { importWithUndo, undoImport } from '@/lib/backup';
import { formatDate } from '@/lib/dates';
import { deviceSyncOn } from '@/lib/sync/enabled';
import { siteConfig } from '@/site.config';
import type { BackupPreview, BackupSummary } from '@/store/progress';
import { useBackupActions } from './useBackupActions';

export interface PendingImport {
  raw: unknown;
  preview: Extract<BackupPreview, { ok: true }>;
}

/** "3 Oct 2026" for the confirmation; "an unknown date" for pre-0.4 files. */
function describeExportedAt(summary: BackupSummary): string {
  if (!summary.exportedAt) return 'an unknown date';
  const time = Date.parse(summary.exportedAt);
  return Number.isFinite(time) ? formatDate(time, siteConfig.locale) : 'an unknown date';
}

function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? noun : plural}`;
}

/**
 * Asks before a backup replaces the current data: what the file holds, a way
 * to export the current progress first, and the replacement itself, which can
 * be undone from the toast that follows. With device sync on, the backup joins
 * the synced data instead (nothing is deleted from the other devices), which
 * no undo could take back from them.
 */
export function ImportBackupDialog({
  pending,
  onClose,
}: {
  pending: PendingImport | null;
  onClose: () => void;
}) {
  const backup = useBackupActions();
  const summary = pending?.preview.summary;
  const synced = pending !== null && deviceSyncOn();

  const confirm = () => {
    if (!pending) return;
    const result = importWithUndo(pending.raw);
    if (!result.ok) {
      toast(result.reason, { tone: 'danger' });
      return;
    }
    const dropped = result.summary.dropped
      ? ` ${count(result.summary.dropped, 'damaged entry', 'damaged entries')} skipped.`
      : '';
    if (synced) {
      toast(`Backup imported — it joins your synced data.${dropped}`, { tone: 'success' });
      if (result.warning) toast(result.warning, { tone: 'warning', duration: 12000 });
      return;
    }
    toast(`Backup imported — your data was replaced.${dropped}`, {
      tone: 'success',
      duration: 15000,
      actionLabel: 'Undo import',
      onAction: () => {
        if (undoImport()) toast('Import undone: your previous data is back.', { tone: 'success' });
        else toast('The previous data could not be restored.', { tone: 'danger' });
      },
    });
    if (result.warning) toast(result.warning, { tone: 'warning', duration: 12000 });
  };

  return (
    <Dialog
      open={pending !== null}
      onClose={onClose}
      title={
        synced ? 'Add this backup to your synced data?' : 'Replace your data with this backup?'
      }
      actions={(close) => (
        <>
          <Button variant="secondary" onClick={close} data-testid="import-cancel">
            Cancel
          </Button>
          <Button
            variant={synced ? 'primary' : 'danger'}
            onClick={() => {
              confirm();
              close();
            }}
            data-testid="import-confirm"
          >
            {synced ? 'Import' : 'Replace my data'}
          </Button>
        </>
      )}
    >
      {summary ? (
        <div className="stack-sm" data-testid="import-summary">
          <p className="muted" style={{ margin: 0 }}>
            A backup from {describeExportedAt(summary)} (format {summary.version}) holding{' '}
            <strong>{count(summary.attempts, 'puzzle attempt')}</strong>,{' '}
            <strong>{count(summary.games, 'imported game')}</strong>,{' '}
            <strong>{count(summary.analyses, 'saved analysis', 'saved analyses')}</strong> and{' '}
            <strong>{count(summary.repertoires, 'custom repertoire')}</strong>.
          </p>
          {synced ? (
            <p className="muted" style={{ margin: 0 }} data-testid="import-synced">
              Sync between devices is on, so what the file holds joins the data on all your devices,
              and nothing is deleted from them. To replace this device’s data with the file instead,
              turn sync off here first.
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Everything in this profile — progress, ratings, repertoires, library and games — is
              replaced by what the file holds. Other profiles and device settings are kept. You can
              undo the import right after it.
            </p>
          )}
          {summary.dropped > 0 ? (
            <Alert tone="warning">
              {count(summary.dropped, 'damaged entry', 'damaged entries')} in the file will be
              skipped.
            </Alert>
          ) : null}
          {pending?.preview.warning ? (
            <Alert tone="warning">{pending.preview.warning}</Alert>
          ) : null}
          <div className="row">
            <Button size="sm" onClick={backup.download} data-testid="import-export-first">
              Export current progress first
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

import { Button, ProgressBar } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { useMaiaDownload } from '@/engine/maia/maiaDownload';
import { MAIA_TOTAL_BYTES } from '@/sw/maiaFiles';

const MB = 1_000_000;
/** The download's size as the learner sees it: "25 MB". */
const HUMAN_DOWNLOAD_MB = Math.round(MAIA_TOTAL_BYTES / MB);

/**
 * The human-like opponent's files on this device: offered as a download where
 * they are missing, with its progress and a Stop while it runs, and (in
 * Settings) a way to delete them again.
 */
export function HumanOpponentDownload({ removable = false }: { removable?: boolean }) {
  const { downloaded, progress, canStore, start, stop, remove } = useMaiaDownload();

  const deleteFiles = async () => {
    const removed = await remove();
    toast(
      removed
        ? `The human-like opponent was removed from this device (${HUMAN_DOWNLOAD_MB} MB freed).`
        : 'The human-like opponent was not on this device.',
      { tone: 'info' },
    );
  };

  let status: string;
  if (!canStore) {
    status =
      'This browser cannot keep files for the app (it needs a secure connection and site storage), so the human-like opponent is not available here.';
  } else if (progress) {
    status = `Downloading the human-like opponent: ${Math.round(progress.received / MB)} of ${Math.round((progress.total || MAIA_TOTAL_BYTES) / MB)} MB.`;
  } else if (downloaded === null) {
    status = 'Checking whether it is on this device…';
  } else if (downloaded) {
    status = `On this device (${HUMAN_DOWNLOAD_MB} MB), ready offline.`;
  } else {
    status = `A one-time download of about ${HUMAN_DOWNLOAD_MB} MB — the model and the runtime that plays it — kept on this device for offline play.`;
  }

  return (
    <div className="stack-sm" data-testid="human-download">
      {progress ? (
        <ProgressBar
          value={progress.received}
          max={progress.total || MAIA_TOTAL_BYTES}
          label="Human-like opponent download"
          valueText={`${Math.round(progress.received / MB)} of ${Math.round((progress.total || MAIA_TOTAL_BYTES) / MB)} MB`}
        />
      ) : null}
      <div className="row row--between">
        <span className="small muted" data-testid="human-download-status">
          {status}
        </span>
        {!canStore ? null : progress ? (
          <Button size="sm" variant="ghost" onClick={stop}>
            Stop
          </Button>
        ) : downloaded === false ? (
          <Button size="sm" onClick={start} data-testid="human-download-start">
            Download ({HUMAN_DOWNLOAD_MB} MB)
          </Button>
        ) : downloaded && removable ? (
          <Button size="sm" variant="ghost" onClick={() => void deleteFiles()}>
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}

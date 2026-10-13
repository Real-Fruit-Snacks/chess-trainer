import { Alert, Button, Dialog } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { joinLink } from '@/lib/sync/deviceSync';
import { QrCode } from './QrCode';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied.`, { tone: 'success' });
  } catch {
    toast(`Could not copy the ${what.toLowerCase()}.`, { tone: 'warning' });
  }
}

/**
 * The recovery phrase, to add a device: the twelve words, and a QR code of the
 * link that opens Settings on the scanning device ready to join.
 */
export function SyncPhraseDialog({
  words,
  fresh,
  onClose,
}: {
  /** The phrase to show; null while closed. */
  words: readonly string[] | null;
  /** Sync was just turned on: the phrase is new. */
  fresh: boolean;
  onClose: () => void;
}) {
  const link = words ? joinLink(words) : '';
  return (
    <Dialog
      open={words !== null}
      onClose={onClose}
      title={fresh ? 'Sync is on: your recovery phrase' : 'Your recovery phrase'}
      actions={(close) => (
        <Button variant="primary" onClick={close} data-testid="sync-phrase-done">
          Done
        </Button>
      )}
    >
      {words ? (
        <div className="stack-sm">
          <p className="muted" style={{ margin: 0 }}>
            To add a device, scan the code with its camera, or open Settings there, choose “I have a
            recovery phrase” and enter these 12 words.
          </p>
          <div className="sync-phrase">
            <ol className="sync-phrase__words" role="list" data-testid="sync-phrase-words">
              {words.map((word, i) => (
                <li key={`${i}-${word}`}>
                  <span className="sync-phrase__n" aria-hidden="true">
                    {i + 1}
                  </span>
                  {word}
                </li>
              ))}
            </ol>
            <QrCode
              text={link}
              label="QR code of the link that opens Settings on another device, ready to join"
            />
          </div>
          <div className="row">
            <Button
              size="sm"
              onClick={() => void copy(words.join(' '), 'Recovery phrase')}
              data-testid="sync-copy-words"
            >
              Copy words
            </Button>
            <Button size="sm" onClick={() => void copy(link, 'Link')} data-testid="sync-copy-link">
              Copy link
            </Button>
          </div>
          <Alert tone="warning">
            <p style={{ margin: 0 }}>
              <strong>Keep the phrase safe, and to yourself.</strong> Anyone with it can read and
              change your synced data; without it, nobody can open that data — not even the sync
              service. Write it down, or keep it in a password manager. The link holds the phrase
              too: only open it on your own devices.
            </p>
          </Alert>
          <p className="small faint" style={{ margin: 0 }}>
            Any device that syncs can show the phrase again here. On an iPhone or iPad, enter the
            words in the app on your Home Screen: the camera opens Safari, which keeps its own data.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

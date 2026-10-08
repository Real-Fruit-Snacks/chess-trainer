import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Dialog, Field } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { type JoinResult, joinSync } from '@/lib/sync/deviceSync';
import { splitWords } from '@/lib/sync/phrase';
import { hasProgress } from '@/lib/sync/snapshot';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { describeChanges, describeTotals } from './deviceSyncStatus';
import { useBackupActions } from './useBackupActions';

type Keep = 'merge' | 'replace';

const KEEP_OPTIONS: { value: Keep; label: string; description: string }[] = [
  {
    value: 'merge',
    label: 'Keep both',
    description: 'What this device has joins the synced data, on every device.',
  },
  {
    value: 'replace',
    label: 'Use the synced data',
    description: 'This device’s own progress, repertoires and games are replaced.',
  },
];

/** What joining did, for the toast: what came in, or (making way for the synced data) what is here now. */
function joinedMessage(result: JoinResult, replaced: boolean): string {
  const joined = 'This device now syncs with your other devices';
  if (replaced) {
    const held = describeTotals(result.totals);
    return held ? `${joined}, and has their data: ${held}.` : `${joined}.`;
  }
  const came = describeChanges(result.brought);
  return came ? `${joined}: ${came} came in.` : `${joined}.`;
}

/**
 * Joins the sync another device turned on, with its recovery phrase (typed,
 * pasted, or brought by the link in its QR code). A device with progress of
 * its own chooses whether that joins the synced data or makes way for it.
 */
export function JoinSyncDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  /** The phrase to start with (from a join link); empty to type one. */
  initial: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const [keep, setKeep] = useState<Keep>('merge');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alreadyOn = useDeviceSyncStore((s) => s.secret !== null);
  const backup = useBackupActions();
  // Asked as the dialog opens: does this device hold anything a learner would miss?
  const ownData = useMemo(() => open && hasProgress(), [open]);
  const words = splitWords(text).length;

  useEffect(() => {
    if (!open) return;
    setText(initial);
    setKeep('merge');
    setError(null);
  }, [open, initial]);

  const join = async (close: () => void) => {
    setBusy(true);
    setError(null);
    const mode = ownData ? keep : 'merge';
    const result = await joinSync(text, mode);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    toast(joinedMessage(result, mode === 'replace'), { tone: 'success' });
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Join with a recovery phrase"
      // A join under way finishes either way: closing the dialog would not stop it.
      dismissible={!busy}
      actions={(close) => (
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void join(close)}
            loading={busy}
            disabled={alreadyOn || words === 0}
            data-testid="sync-join-confirm"
          >
            Join
          </Button>
        </>
      )}
    >
      <div className="stack-sm">
        {alreadyOn ? (
          <Alert tone="info">
            <p style={{ margin: 0 }}>
              This device syncs already. To join with another phrase, turn sync off here first.
            </p>
          </Alert>
        ) : null}
        <Field
          label="Recovery phrase"
          hint={`The 12 words from a device where sync is on, in order — the first four letters of each are enough.${words > 0 && words !== 12 ? ` ${words} of 12 so far.` : ''}`}
        >
          {(id) => (
            <textarea
              id={id}
              className="textarea"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-testid="sync-join-phrase"
            />
          )}
        </Field>
        <p className="small muted" style={{ margin: 0 }}>
          Join only with a phrase from one of your own devices: whoever made it can read everything
          this device syncs.
        </p>
        {ownData ? (
          <>
            <div
              className="choices"
              role="radiogroup"
              aria-label="This device’s own data"
              data-testid="sync-join-keep"
            >
              {KEEP_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`choice${option.value === keep ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="sync-join-keep"
                    value={option.value}
                    checked={option.value === keep}
                    onChange={() => setKeep(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <br />
                    <span className="small muted">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {keep === 'replace' ? (
              <div className="row">
                <Button size="sm" onClick={backup.download}>
                  Export this device’s data first
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
        {error ? (
          <Alert tone="danger">
            <p style={{ margin: 0 }} data-testid="sync-join-error">
              {error}
            </p>
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

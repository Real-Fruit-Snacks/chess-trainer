import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Button, Card, ConfirmDialog } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import {
  currentPhrase,
  deleteSyncedCopy,
  stopSync,
  syncNow,
  turnOnSync,
  useDeviceSync,
} from '@/lib/sync/deviceSync';
import { deviceSyncOffered } from '@/lib/sync/enabled';
import { splitWords } from '@/lib/sync/phrase';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { deviceSyncNeedsAttention, deviceSyncStatusLine } from './deviceSyncStatus';
import { JoinSyncDialog } from './JoinSyncDialog';
import { SyncPhraseDialog } from './SyncPhraseDialog';

/** What a join link carries after `#sync=`: the phrase's words, joined by dashes. */
const JOIN_PREFIX = '#sync=';

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Settings → Sync between devices: turn the end-to-end encrypted sync on (and
 * get the recovery phrase), join it from another device, see how it goes,
 * show the phrase again to add a device, turn it off here, or delete the
 * synced copy. Shown only when this build has a relay (`siteConfig.syncRelay`).
 */
export function DeviceSyncCard() {
  if (!deviceSyncOffered()) return null;
  return <DeviceSync />;
}

function DeviceSync() {
  const on = useDeviceSyncStore((s) => s.secret !== null);
  const lastSyncAt = useDeviceSyncStore((s) => s.lastSyncAt);
  const stoppedBecause = useDeviceSyncStore((s) => s.stoppedBecause);
  const status = useDeviceSync();
  const online = useOnline();
  const [now, setNow] = useState(() => Date.now());
  const [turningOn, setTurningOn] = useState(false);
  const [phrase, setPhrase] = useState<{ words: string[]; fresh: boolean } | null>(null);
  const [join, setJoin] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'off' | 'delete' | null>(null);
  const { hash } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // A join link (the QR code's) opens Settings here with the phrase after #sync=. The
  // phrase leaves the address straight away, so it stays out of the history.
  useEffect(() => {
    if (!hash.startsWith(JOIN_PREFIX)) return;
    const words = splitWords(decodeURIComponent(hash.slice(JOIN_PREFIX.length))).join(' ');
    void navigate({ hash: '' }, { replace: true });
    void (async () => {
      const current = await currentPhrase();
      if (current?.join(' ') === words) {
        toast('This device syncs with that phrase already.');
        return;
      }
      setJoin(words);
    })();
  }, [hash, navigate]);

  const turnOn = async () => {
    setTurningOn(true);
    const result = await turnOnSync();
    setTurningOn(false);
    if (!result.ok) {
      toast(result.reason, { tone: 'danger' });
      return;
    }
    setPhrase({ words: result.words, fresh: true });
  };

  const showPhrase = async () => {
    const words = await currentPhrase();
    if (words) setPhrase({ words, fresh: false });
  };

  const remove = async () => {
    const result = await deleteSyncedCopy();
    if (result.ok) toast('The synced copy was deleted. Each device keeps its data.');
    else toast(result.reason, { tone: 'danger' });
  };

  // A run that finished after the last tick reads "just now", not some minutes in the future.
  const statusText = deviceSyncStatusLine(status, lastSyncAt, Math.max(now, lastSyncAt ?? 0));

  return (
    <Card id="sync" data-testid="sync-card">
      <h2 style={{ fontSize: '1.15rem' }}>Sync between devices</h2>
      {on ? (
        <div className="settings__group">
          <div className="settings__row">
            {deviceSyncNeedsAttention(status) ? (
              <Alert tone="warning">
                <p style={{ margin: 0 }} role="status" data-testid="sync-status">
                  {statusText}
                </p>
              </Alert>
            ) : (
              <span className="small muted" role="status" data-testid="sync-status">
                {statusText}
              </span>
            )}
            <Button
              size="sm"
              onClick={() => void syncNow()}
              disabled={status.phase === 'syncing' || !online}
              data-testid="sync-now"
            >
              Sync now
            </Button>
          </div>
          <p className="small" style={{ margin: 0 }}>
            Progress, lessons, review schedules, repertoires, saved analyses and imported games are
            kept in step on every device with your recovery phrase. Device settings and the Lichess
            sign-in stay on each device.
          </p>
          <div className="settings__row">
            <span className="small">Add a device: show the recovery phrase, or its QR code.</span>
            <Button size="sm" onClick={() => void showPhrase()} data-testid="sync-show-phrase">
              Show recovery phrase
            </Button>
          </div>
          <div className="settings__row">
            <span className="small">Stop syncing here. The data stays, here and elsewhere.</span>
            <Button size="sm" onClick={() => setConfirm('off')} data-testid="sync-turn-off">
              Turn off
            </Button>
          </div>
          <div className="settings__row">
            <span className="small">Delete the encrypted copy kept for your devices.</span>
            <Button
              size="sm"
              onClick={() => setConfirm('delete')}
              disabled={!online}
              data-testid="sync-delete"
            >
              Delete synced copy
            </Button>
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            End-to-end encrypted: your data is encrypted on this device, with a key from your
            recovery phrase, before it leaves. The sync service keeps only scrambled data and never
            sees the phrase.
          </p>
        </div>
      ) : (
        <div className="settings__group">
          {stoppedBecause === 'deleted' ? (
            <Alert tone="warning">
              <p style={{ margin: 0 }} data-testid="sync-stopped">
                The synced copy was deleted — from another device, or after a year unused — so this
                device stopped syncing. Everything on it is still here.
              </p>
              <div className="row" style={{ marginTop: 8 }}>
                <Button size="sm" onClick={() => useDeviceSyncStore.getState().clearStopped()}>
                  OK
                </Button>
              </div>
            </Alert>
          ) : null}
          <p className="small muted" style={{ margin: 0 }}>
            Keep your phone, tablet and computer in step — no account, no email. Your data is
            encrypted on this device before it leaves, so the sync service stores only scrambled
            data it cannot read.
          </p>
          <ul className="small settings__list">
            <li>
              Progress, lessons, review schedules, repertoires, saved analyses and imported games
              sync; device settings stay on each device.
            </li>
            <li>Changes made offline wait, and join the rest when the device is back online.</li>
            <li>A 12-word recovery phrase, or its QR code, adds a device.</li>
          </ul>
          <div className="row">
            <Button
              variant="primary"
              onClick={() => void turnOn()}
              loading={turningOn}
              disabled={!online}
              data-testid="sync-turn-on"
            >
              Turn on sync
            </Button>
            <Button onClick={() => setJoin('')} disabled={!online} data-testid="sync-join">
              I have a recovery phrase
            </Button>
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            {online
              ? 'Turning sync on gives you the recovery phrase: the only key to your synced data, so keep it safe.'
              : 'Syncing needs a connection: try again when this device is online.'}
          </p>
        </div>
      )}

      <SyncPhraseDialog
        words={phrase?.words ?? null}
        fresh={phrase?.fresh ?? false}
        onClose={() => setPhrase(null)}
      />
      <JoinSyncDialog open={join !== null} initial={join ?? ''} onClose={() => setJoin(null)} />

      {/* Mounted only while asked, so the page holds one set of confirmation buttons. */}
      {confirm === 'off' ? (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            void stopSync().then(() => toast('Sync is off on this device.'));
          }}
          title="Turn off sync on this device?"
          confirmLabel="Turn off"
        >
          <p className="muted">
            This device stops syncing and forgets the recovery phrase. Its data stays here, and the
            synced copy stays for your other devices. To sync this device again, enter the phrase.
          </p>
        </ConfirmDialog>
      ) : null}
      {confirm === 'delete' ? (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          onConfirm={() => void remove()}
          title="Delete the synced copy?"
          confirmLabel="Delete synced copy"
          danger
        >
          <p className="muted">
            The encrypted copy on the sync service is deleted and the recovery phrase stops working.
            Every device keeps the data it has; your other devices stop syncing at their next sync.
          </p>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

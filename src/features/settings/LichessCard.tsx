import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, Switch } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { beginLichessLogin, revokeLichessToken } from '@/lib/lichess/auth';
import { lichessBacklog } from '@/lib/lichess/backlog';
import { type SyncStatus, syncNow, useLichessSync } from '@/lib/lichess/sync';
import { siteConfig } from '@/site.config';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import { describeReport, describeWhen, plural } from './lichessStatus';
import { LichessTokenConnect } from './LichessTokenConnect';

/** An app on the Home Screen of an iPhone or iPad: iOS finishes a sign-in elsewhere, in Safari. */
const homeScreenApp = () =>
  typeof navigator !== 'undefined' &&
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function statusLine(status: SyncStatus, lastSyncAt: number | null, now: number): string {
  switch (status.phase) {
    case 'syncing':
      return `${status.step ?? 'Syncing'}…`;
    case 'offline':
      return 'Offline: syncing carries on when this device is back online.';
    case 'waiting':
      return status.retryAt
        ? `Lichess asked for a pause: syncing again at ${new Date(status.retryAt).toLocaleTimeString(siteConfig.locale, { hour: '2-digit', minute: '2-digit' })}.`
        : 'Lichess asked for a pause: syncing again soon.';
    case 'signed-out':
      return 'Lichess no longer accepts this device’s sign-in.';
    case 'failed':
      return `The last sync did not finish: ${status.error ?? 'something went wrong'} It is tried again soon.`;
    default:
      break;
  }
  if (lastSyncAt === null) return 'Not synced yet.';
  return `Synced ${describeWhen(lastSyncAt, now)}.`;
}

/**
 * Settings → Lichess account: connect, see what the sync does, choose what
 * is kept in step, and disconnect (which withdraws the permission on Lichess).
 */
export function LichessCard() {
  const account = useLichess((s) => s.account);
  const needsReconnect = useLichess((s) => s.needsReconnect);
  const options = useLichess((s) => s.options);
  const setOption = useLichess((s) => s.setOption);
  const lastSyncAt = useLichess((s) => s.lastSyncAt);
  const backlogState = useLichess((s) => s.backlog);
  const waitingPuzzles = useLichess((s) => s.outbox.puzzles.length);
  const waitingGames = useLichess((s) => s.outbox.games.length);
  const puzzleRating = useLichess((s) => s.ratings?.puzzle ?? null);
  const status = useLichessSync();
  const deviceSync = useDeviceSyncStore((s) => s.secret !== null);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      clearInterval(tick);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // What this device recorded before the connection, offered once per connection.
  const backlog = useMemo(
    () =>
      account && backlogState === 'unasked'
        ? lichessBacklog(useProgress.getState(), useLichess.getState())
        : null,
    [account, backlogState],
  );

  const connect = async () => {
    setConnecting(true);
    try {
      await beginLichessLogin();
    } catch (err) {
      setConnecting(false);
      toast(err instanceof Error ? err.message : 'The sign-in could not start.', {
        tone: 'danger',
      });
    }
  };

  const disconnect = () => {
    const token = useLichess.getState().account?.token;
    useLichess.getState().disconnect();
    // The permission is withdrawn on Lichess too (when it can be reached).
    if (token) void revokeLichessToken(token);
    toast('Disconnected from Lichess.');
  };

  const waiting = waitingPuzzles + waitingGames;
  const backlogCount = backlog ? backlog.puzzles.length + backlog.games.length : 0;
  const report = status.phase === 'done' ? status.report : null;
  const did = report ? describeReport(report) : null;
  const heldBack = report?.studies?.heldBack ?? [];
  const notPulled = report?.studies?.notPulled ?? 0;
  const copies = report?.studies?.copies ?? 0;
  const problems = report?.problems ?? [];

  return (
    <Card id="lichess" data-testid="lichess-card">
      <h2 style={{ fontSize: '1.15rem' }}>Lichess account</h2>
      {account ? (
        <div className="settings__group">
          <div className="settings__row">
            <span>
              Connected as{' '}
              <a
                href={`https://lichess.org/@/${encodeURIComponent(account.username)}`}
                target="_blank"
                rel="noreferrer"
                data-testid="lichess-username"
              >
                {account.username}
              </a>
              {puzzleRating ? (
                <span className="small muted"> · puzzle rating {puzzleRating.rating}</span>
              ) : null}
            </span>
            <Button
              size="sm"
              onClick={() => void syncNow({ force: true })}
              disabled={status.phase === 'syncing' || needsReconnect || !online}
              data-testid="lichess-sync-now"
            >
              Sync now
            </Button>
          </div>
          {needsReconnect ? (
            <Alert tone="warning">
              <p style={{ margin: 0 }}>
                Lichess no longer accepts this device’s sign-in (it was withdrawn, or it lapsed).
                Connect again to carry on; nothing waiting to go up is lost.
              </p>
              <div className="row" style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void connect()}
                  loading={connecting}
                  disabled={!online}
                  data-testid="lichess-reconnect"
                >
                  Connect again
                </Button>
              </div>
              <LichessTokenConnect open={homeScreenApp()} />
            </Alert>
          ) : (
            <p
              className="small muted"
              role="status"
              style={{ margin: 0 }}
              data-testid="lichess-status"
            >
              {statusLine(status, lastSyncAt, now)}
              {did ? ` ${did}` : ''}
            </p>
          )}
          {waiting > 0 ? (
            <p className="small" style={{ margin: 0 }} data-testid="lichess-waiting">
              Waiting to go up:{' '}
              {[
                waitingPuzzles > 0 ? plural(waitingPuzzles, 'puzzle result') : null,
                waitingGames > 0 ? plural(waitingGames, 'game') : null,
              ]
                .filter(Boolean)
                .join(' and ')}
              .
            </p>
          ) : null}
          {copies > 0 ? (
            <p className="small" style={{ margin: 0 }}>
              {copies === 1 ? 'One item' : `${copies} items`} changed both here and on Lichess since
              the last sync: both versions are kept, the Lichess one named “… (Lichess)”.
            </p>
          ) : null}
          {heldBack.length > 0 ? (
            <p className="small" style={{ margin: 0 }} data-testid="lichess-held-back">
              {heldBack.length === 1 ? 'Stays' : 'Stay'} on this device:{' '}
              {heldBack.map((name) => `“${name}”`).join(', ')} — too big for a Lichess study chapter
              (3,000 moves at most), or refused by Lichess.{' '}
              {heldBack.length === 1
                ? 'It goes up once it changes'
                : 'Each goes up once it changes'}{' '}
              and fits.
            </p>
          ) : null}
          {notPulled > 0 ? (
            <p className="small" style={{ margin: 0 }}>
              {plural(notPulled, 'analysis', 'analyses')} stay on Lichess: the library here is full.
              Delete some saved analyses to make room.
            </p>
          ) : null}
          {problems.length > 0 ? (
            <Alert tone="warning">
              <p style={{ margin: 0 }}>Part of the last sync went wrong:</p>
              <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {backlog && backlogCount > 0 ? (
            <Alert tone="info">
              <p style={{ margin: 0 }} data-testid="lichess-backlog">
                This device has{' '}
                {[
                  backlog.puzzles.length > 0
                    ? plural(backlog.puzzles.length, 'earlier puzzle result')
                    : null,
                  backlog.games.length > 0 ? plural(backlog.games.length, 'earlier game') : null,
                ]
                  .filter(Boolean)
                  .join(' and ')}{' '}
                that this device has not sent to Lichess. Send {backlogCount === 1 ? 'it' : 'them'}{' '}
                too?
                {deviceSync && backlog.puzzles.length > 0
                  ? ' Some of the puzzles may have gone up from your other devices already: Lichess rates a puzzle only once.'
                  : ''}
              </p>
              <div className="row" style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    useLichess.getState().queueBacklog(backlog.puzzles, backlog.games);
                    void syncNow();
                  }}
                  data-testid="lichess-backlog-send"
                >
                  {backlogCount === 1 ? 'Send it' : 'Send them'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => useLichess.getState().finishBacklog()}
                >
                  Not now
                </Button>
              </div>
            </Alert>
          ) : null}
          <Switch
            checked={options.puzzles}
            onChange={(v) => setOption('puzzles', v)}
            label="Puzzles"
            description="Results go to Lichess and count there — ones solved offline wait here until you are back online. Your Lichess puzzle history comes here; the puzzles you missed join your review queue, ready offline."
          />
          <Switch
            checked={options.rating && options.puzzles}
            disabled={!options.puzzles}
            onChange={(v) => setOption('rating', v)}
            label="Puzzle rating from Lichess"
            description={
              options.puzzles
                ? 'Your puzzle rating here follows your Lichess puzzle rating.'
                : 'Needs Puzzles on.'
            }
          />
          <Switch
            checked={options.games}
            onChange={(v) => setOption('games', v)}
            label="Games"
            description="Games you finish here are imported to your Lichess account (with the analysis board there), and come back to your game log on your other devices."
          />
          <Switch
            checked={options.studies}
            onChange={(v) => setOption('studies', v)}
            label="Repertoires and analyses"
            description={
              deviceSync
                ? 'Paused while sync between devices is on: your repertoires and analyses travel between your devices with it.'
                : 'Your own repertoires and saved analyses are kept in private Lichess studies named “Chess Trainer · …”. Edits on either side come across; so do deletions.'
            }
          />
          <p className="small faint" style={{ margin: 0 }}>
            {deviceSync
              ? 'Lessons, flashcards and review schedules travel with sync between devices; settings stay on this device.'
              : 'Lessons, flashcards, review schedules and settings stay on this device: a backup, or sync between devices, moves those.'}
          </p>
          <div className="settings__row">
            <span className="small">The sign-in stays on this device, never in a backup.</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDisconnect(true)}
              data-testid="lichess-disconnect"
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="settings__group">
          <p className="small muted" style={{ margin: 0 }}>
            Keep this device in step with your Lichess account — and, through it, with your other
            devices.
          </p>
          <ul className="small settings__list">
            <li>
              Puzzle results count on Lichess, including ones solved offline: they wait here until
              you are back online. Your Lichess puzzle history comes here, and the puzzles you
              missed join your review queue.
            </li>
            <li>
              Games you play here are imported to Lichess and come back on your other devices.
            </li>
            <li>Your own repertoires and saved analyses live in private Lichess studies.</li>
          </ul>
          <div className="row">
            <Button
              variant="primary"
              onClick={() => void connect()}
              loading={connecting}
              disabled={!online}
              data-testid="lichess-connect"
            >
              Connect Lichess account
            </Button>
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            {online
              ? 'You sign in on lichess.org, which asks whether this app may read and write your puzzle activity and your studies, and play games: only the live games you start here. The permission stays on this device (never in a backup); Disconnect withdraws it.'
              : 'Connecting needs a connection: try again when this device is online.'}
          </p>
          {homeScreenApp() ? (
            <p className="small" style={{ margin: 0 }}>
              On an iPhone or iPad, an app on the Home Screen finishes the lichess.org sign-in in
              Safari, which keeps its own storage: connect with a personal token instead.
            </p>
          ) : null}
          <LichessTokenConnect open={homeScreenApp()} />
        </div>
      )}

      {/* Mounted only while asked, so the page holds one set of confirmation buttons. */}
      {confirmDisconnect ? (
        <ConfirmDialog
          open
          onClose={() => setConfirmDisconnect(false)}
          onConfirm={disconnect}
          title="Disconnect from Lichess?"
          confirmLabel="Disconnect"
          danger
        >
          <p className="muted">
            This device stops syncing and its permission on Lichess is withdrawn. Everything already
            synced stays on both sides.
            {waiting > 0
              ? ` What waits to go up (${[
                  waitingPuzzles > 0 ? plural(waitingPuzzles, 'puzzle result') : null,
                  waitingGames > 0 ? plural(waitingGames, 'game') : null,
                ]
                  .filter(Boolean)
                  .join(' and ')}) stays here, and goes if you connect this account again.`
              : ''}
          </p>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

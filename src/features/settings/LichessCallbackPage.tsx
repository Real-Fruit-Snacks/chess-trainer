import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, LinkButton, Spinner } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import {
  beginLichessLogin,
  finishLichessLogin,
  LoginError,
  pendingReturnTo,
} from '@/lib/lichess/auth';
import { syncNow } from '@/lib/lichess/sync';
import { siteConfig } from '@/site.config';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';

type View =
  | { kind: 'working' }
  | { kind: 'failed'; message: string; cancelled: boolean; returnTo: string | null };

/**
 * `/settings/lichess`: where lichess.org sends the learner back after the
 * sign-in. Finishes the connection (the one-time code is traded for the
 * token, and leaves the address bar at once), starts the first sync and goes
 * back to where the sign-in started (the waiting room, say), else Settings;
 * or says what went wrong and offers to try again.
 */
export default function LichessCallbackPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ kind: 'working' });
  const started = useRef(false);

  useEffect(() => {
    document.title = `Lichess · ${siteConfig.name}`;
    // The answer is used once, even when an effect runs twice.
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    // The one-time code must not stay in the address bar or the history.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    // Read before the login is finished (which uses it up), for the way back if it fails.
    const returnTo = pendingReturnTo();
    finishLichessLogin(params)
      .then((account) => {
        useLichess.getState().connect(
          {
            id: account.id,
            username: account.username,
            token: account.token,
            expiresAt: account.expiresAt,
          },
          account.ratings,
        );
        // The game importer's Lichess name, when none is set yet.
        if (!useProgress.getState().lichessUsername) {
          useProgress.getState().setUsernames({ lichessUsername: account.username });
        }
        void syncNow({ force: true });
        toast(`Connected to Lichess as ${account.username}.`, { tone: 'success' });
        void navigate(account.returnTo ?? '/settings#lichess', { replace: true });
      })
      .catch((err: unknown) => {
        setView({
          kind: 'failed',
          message:
            err instanceof Error ? err.message : 'The connection to Lichess could not be made.',
          cancelled: err instanceof LoginError && err.kind === 'cancelled',
          returnTo,
        });
      });
  }, [navigate]);

  return (
    <div>
      <div className="page-header">
        <h1>Lichess account</h1>
      </div>
      <Card data-testid="lichess-callback">
        {view.kind === 'working' ? (
          <div className="row" style={{ alignItems: 'center' }}>
            <Spinner label="Connecting" />
            <span>Connecting to Lichess…</span>
          </div>
        ) : (
          <div className="stack">
            <p style={{ margin: 0 }} role="alert">
              {view.cancelled ? 'The connection was cancelled on Lichess.' : view.message}
            </p>
            <div className="row">
              <Button
                variant="primary"
                onClick={() => {
                  beginLichessLogin({ returnTo: view.returnTo }).catch((err: unknown) =>
                    setView({
                      kind: 'failed',
                      message: err instanceof Error ? err.message : 'The sign-in could not start.',
                      cancelled: false,
                      returnTo: view.returnTo,
                    }),
                  );
                }}
              >
                Try again
              </Button>
              <LinkButton to={view.returnTo ?? '/settings#lichess'} variant="ghost">
                {view.returnTo ? 'Go back' : 'Back to Settings'}
              </LinkButton>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

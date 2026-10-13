import { type FormEvent, useId, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { connectWithToken, personalTokenUrl } from '@/lib/lichess/auth';
import { syncNow } from '@/lib/lichess/sync';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';

/**
 * The other way in: a personal token made on lichess.org and pasted here.
 * For a window that cannot finish the usual sign-in — an app on the Home
 * Screen of an iPhone or iPad, which iOS sends to Safari for the sign-in —
 * or for anyone who prefers it.
 */
export function LichessTokenConnect({ open = false }: { open?: boolean }) {
  const id = useId();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account = await connectWithToken(token);
      useLichess.getState().connect(
        {
          id: account.id,
          username: account.username,
          token: account.token,
          expiresAt: account.expiresAt,
        },
        account.ratings,
      );
      if (!useProgress.getState().lichessUsername) {
        useProgress.getState().setUsernames({ lichessUsername: account.username });
      }
      setToken('');
      void syncNow({ force: true });
      toast(`Connected to Lichess as ${account.username}.`, { tone: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The token could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="settings__diagnostics" open={open} data-testid="lichess-token">
      <summary>Connect with a personal token instead</summary>
      <p className="small muted">
        Create a token on Lichess — the link ticks the permissions the sync needs — then copy it and
        paste it here. It works in any window, including an app added to the Home Screen of an
        iPhone or iPad, and like the usual sign-in it stays on this device.
      </p>
      <p className="small" style={{ margin: '0 0 8px' }}>
        <a href={personalTokenUrl()} target="_blank" rel="noreferrer">
          Create a token on Lichess
        </a>
      </p>
      <form className="row" onSubmit={(e) => void submit(e)}>
        <label htmlFor={`${id}-token`} className="sr-only">
          Personal token
        </label>
        <Input
          id={`${id}-token`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="lip_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-describedby={error ? `${id}-error` : undefined}
          data-testid="lichess-token-input"
          style={{ flex: '1 1 12rem' }}
        />
        <Button type="submit" size="sm" loading={busy} disabled={!token.trim() || busy}>
          Connect
        </Button>
      </form>
      {error ? (
        <p id={`${id}-error`} className="small" role="alert" style={{ margin: '6px 0 0' }}>
          {error}
        </p>
      ) : null}
    </details>
  );
}

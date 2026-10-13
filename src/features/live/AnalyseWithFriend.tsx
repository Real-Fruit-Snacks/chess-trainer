import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Dialog, Icon } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import type { GameTree } from '@/chess/tree';
import { onPhone } from './share';

/**
 * "Analyse with a friend" on the analysis board: makes a room for analysing
 * the board's game together (its start, its moves and their variations) and
 * goes there; on a computer the room's link is copied at once, and the room's
 * page has it to share (a phone's share sheet opens from there). Quick search
 * opens the question with `?together=1`.
 */
/** Copies the link when the browser lets it (the room's page has it otherwise). */
function copyQuietly(link: string): void {
  try {
    navigator.clipboard.writeText(link).then(
      () => toast('Link copied: send it to your friend.', { tone: 'success' }),
      () => undefined,
    );
  } catch {
    // No clipboard here.
  }
}

export function AnalyseWithFriend({ tree }: { tree: GameTree }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('together') !== '1') return;
    setOpen(true);
    const rest = new URLSearchParams(params);
    rest.delete('together');
    setParams(rest, { replace: true });
  }, [params, setParams]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      // The live games' code loads only now: the analysis board does without it.
      const [{ analysisOptionsFor }, { analysisRoomLink, analysisRoomPath, makeGroupRoom }] =
        await Promise.all([import('./analysisRoom'), import('./rooms')]);
      const id = await makeGroupRoom('analysis', analysisOptionsFor(tree));
      // A phone shares the link from the room's page; elsewhere it is copied now, if it can be.
      if (!onPhone()) copyQuietly(analysisRoomLink(id));
      void navigate(analysisRoomPath(id));
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'The room could not be made.');
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="analyse-with-friend">
        <Icon name="people" size={16} />
        <span>Analyse with a friend</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Analyse with a friend"
        actions={(close) => (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void make()} loading={busy}>
              {busy ? 'Making the room…' : 'Make the room'}
            </Button>
          </>
        )}
      >
        <p>
          A room for up to eight with this game, its variations too. Everyone with the link sees the
          same board, plays moves and draws arrows; each device runs its own engine. You host the
          room: only you can delete moves.
        </p>
        <p className="muted">The room closes a while after everyone has left it.</p>
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
      </Dialog>
    </>
  );
}

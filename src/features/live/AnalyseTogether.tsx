import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Icon } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { analysisRoomPath } from './rooms';
import type { LiveGameSession, LiveGameView } from './types';

/**
 * "Analyse together", once a game on the relay is over: asks the game's room
 * for its analysis room (the same one for both players and everyone watching)
 * and goes there. Nothing for a Lichess game, or a game without a move.
 */
export function AnalyseTogether({
  session,
  view,
}: {
  session: LiveGameSession;
  view: LiveGameView;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (view.source !== 'relay' || view.status !== 'over' || view.moves.length === 0) return null;
  const join = view.analysis !== null && view.analysis.by !== (view.watching ? null : view.you);
  return (
    <Button
      disabled={busy}
      data-testid="analyse-together"
      onClick={() => {
        setBusy(true);
        session.analyse().then(
          (room) => void navigate(analysisRoomPath(room)),
          (err: unknown) => {
            setBusy(false);
            toast(err instanceof Error ? err.message : 'The analysis room could not be made.', {
              tone: 'warning',
            });
          },
        );
      }}
    >
      <Icon name="analyze" size={18} />
      <span>
        {busy ? 'Opening the analysis…' : join ? 'Join the analysis' : 'Analyse together'}
      </span>
    </Button>
  );
}

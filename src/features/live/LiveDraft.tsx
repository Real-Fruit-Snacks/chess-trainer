import { useMemo, useState } from 'react';
import { Board } from '@/components/board/Board';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { Alert, Button, Card } from '@/components/ui';
import {
  ARMY_PRESETS,
  type Army,
  armyProblem,
  describeArmy,
  draftFen,
  EMPTY_ARMY,
} from '@/features/arcade/army';
import { ArmyShop } from '@/features/arcade/ArmyShop';
import { useTicker } from '@/lib/useTicker';
import { formatCountdown, monotonicNow, opponentOf } from './liveView';
import type { LiveDraft, LiveGameSession, LiveGameView, Side } from './types';
import '@/features/play/play.css';
import './live.css';

/** The army a draft starts from: the balanced preset when it fits, an empty one otherwise. */
function firstArmy(budget: number): Army {
  const preset = ARMY_PRESETS.find((p) => p.id === 'balanced' && p.budget <= budget);
  return preset ? preset.army : EMPTY_ARMY;
}

/**
 * Army Draft's draft, online: each player buys an army from the same budget
 * while the other does the same, unseen. The board previews this player's own
 * army against the other's lone king; once both are in, the room starts the
 * game from the two armies and the page shows the board.
 */
export function LiveDraftPanel({
  session,
  view,
  draft,
}: {
  session: LiveGameSession;
  view: LiveGameView;
  draft: LiveDraft;
}) {
  const sent = draft.armies[view.you];
  const [army, setArmy] = useState<Army>(() => sent ?? firstArmy(draft.budget));
  const [news, setNews] = useState('');
  const opponent = opponentOf(view);
  const you: Side = view.you;
  const mineIn = draft.ready[you];
  const theirsIn = draft.ready[you === 'white' ? 'black' : 'white'];
  const shown = sent ?? army;
  const problem = armyProblem(shown, draft.budget);
  const preview = useMemo(
    () => (you === 'white' ? draftFen(shown, EMPTY_ARMY) : draftFen(EMPTY_ARMY, shown)),
    [shown, you],
  );
  const closed = view.connection === 'closed';
  useTicker(draft.deadline !== null);
  const left = draft.deadline !== null ? draft.deadline - monotonicNow() : null;

  return (
    <div className="trainer">
      <div className="play__boardcol">
        <PlayerBar
          name={opponent.name}
          color={you === 'white' ? 'black' : 'white'}
          fen={preview}
          showMaterial={false}
        />
        <div className="trainer__board">
          <Board
            fen={preview}
            orientation={you}
            viewOnly
            ariaLabel={`Your army: ${describeArmy(shown)}`}
          />
        </div>
        <PlayerBar name="You" color={you} fen={preview} showMaterial={false} />
      </div>
      <aside className="trainer__panel stack">
        <Card>
          <div className="row row--between">
            <h2 className="live-game__title">Choose your army</h2>
            {left !== null ? (
              <span className="live__elapsed" role="timer" data-testid="draft-time">
                {formatCountdown(left)}
              </span>
            ) : null}
          </div>
          <p className="small muted live-draft__lead">
            Spend up to {draft.budget} points: a queen costs 9, a rook 5, a bishop or a knight 3, a
            pawn 1. {opponent.name} chooses at the same time, and neither of you sees the other’s
            army until both are in. When the time is up, an army is drafted for whoever has none.
          </p>
          <ArmyShop
            army={shown}
            budget={draft.budget}
            news={news}
            disabled={mineIn}
            onChange={(next, words) => {
              setArmy(next);
              setNews(words);
            }}
          />
        </Card>
        <Card>
          <ul className="live-draft__ready" role="list" aria-live="polite">
            <li data-testid="draft-mine">
              {mineIn ? 'Your army is in.' : 'You are choosing your army.'}
            </li>
            <li data-testid="draft-theirs">
              {theirsIn ? `${opponent.name}’s army is in.` : `${opponent.name} is choosing…`}
            </li>
          </ul>
          <div className="play__actions">
            {mineIn ? null : (
              <Button
                variant="primary"
                onClick={() => session.army(army)}
                disabled={problem !== null || closed}
                data-testid="draft-ready"
              >
                Ready: field this army
              </Button>
            )}
            <Button variant="danger" onClick={() => session.abort()} disabled={closed}>
              Abort
            </Button>
          </div>
          {view.error ? (
            <p className="small live-game__error" role="alert">
              {view.error}
            </p>
          ) : null}
        </Card>
        {!view.opponentPresent && view.connection === 'open' ? (
          <Alert tone="warning">{opponent.name} is not here right now.</Alert>
        ) : null}
      </aside>
    </div>
  );
}

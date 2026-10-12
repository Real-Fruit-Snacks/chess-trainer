import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { Board } from '@/components/board/Board';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { Button, Card, Icon, LinkButton, Spinner } from '@/components/ui';
import { opposite } from '@/chess/helpers';
import { playMoveSound } from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { BLINDFOLD_PEEKS, isCorrespondence } from '../../../relay/src/live/shared.mjs';
import { AnalyseTogether } from './AnalyseTogether';
import { DaysLeft, GameAbsent, LiveClockDisplay, PlayerName } from './LiveParts';
import { describeTimeControl, sideName, watchedEnd, watchingText } from './liveView';
import { chess960Label, replayMoves } from './liveViewBoard';
import { describeOptions, gameName } from './onlineGames';
import { useLivePrefs } from './prefs';
import { watchLiveGame } from './sessions';
import type { LiveGameSession, LiveGameView, Side } from './types';
import '@/features/play/play.css';
import './live.css';

/**
 * A game on the relay watched from here: the board from White's side (it
 * flips), both clocks, the moves and the result, nothing to play. A blindfold
 * game shows its pieces to the people watching. The connection belongs to
 * sessions.ts, which lets it go a minute after the page closes.
 *
 * A correspondence invitation (a seat still open) offers to take the seat
 * instead, when `onJoined` is given (the game's own page, which the link is):
 * once the seat is this device's, `onJoined` lets the page become the board.
 */
export function WatchGame({ id, onJoined }: { id: string; onJoined?: () => void }) {
  const session = useMemo(() => watchLiveGame(id), [id]);
  if (!session) {
    return (
      <GameAbsent title="Game not found">
        That link does not lead to a game. Ask for the link again.
      </GameAbsent>
    );
  }
  return <Watching session={session} onJoined={onJoined} />;
}

function Watching({
  session,
  onJoined,
}: {
  session: LiveGameSession;
  onJoined: (() => void) | undefined;
}) {
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getView = useCallback(() => session.getView(), [session]);
  const view = useSyncExternalStore(subscribe, getView);
  const joined = view.joined !== null;
  useEffect(() => {
    if (!joined) return;
    onJoined?.();
    // The seat is this device's now: the connection that watched goes at once, so the players
    // stop counting it among those watching (the board connects again as a player).
    session.close();
  }, [joined, onJoined, session]);

  if (view.missing) {
    return (
      <GameAbsent title="Game not found">
        This game is over and gone, or the link is not quite right.
      </GameAbsent>
    );
  }
  if (view.connection === 'connecting') {
    return (
      <div className="narrow">
        <Card>
          <Spinner label="Connecting to the game…" />
        </Card>
      </div>
    );
  }
  if (onJoined && view.open && view.status === 'playing') {
    return <JoinCard session={session} view={view} />;
  }
  return <WatchBoard session={session} view={view} />;
}

/**
 * A correspondence invitation opened from its link: who invites, the days a
 * move, the side the seat plays, and the button that takes it.
 */
function JoinCard({ session, view }: { session: LiveGameSession; view: LiveGameView }) {
  const name = useLivePrefs((s) => s.name);
  const [asked, setAsked] = useState(false);
  const open = view.open ?? 'black';
  const host = open === 'white' ? view.black : view.white;
  // A refusal (someone was quicker, the connection dropped) lets the button be tried again.
  useEffect(() => {
    if (view.error) setAsked(false);
  }, [view.error]);
  useEffect(() => {
    document.title = `Invitation · ${siteConfig.name}`;
  }, []);
  return (
    <div className="narrow">
      <Card data-testid="live-join">
        <p className="card__eyebrow">
          <Link to="/play">Play</Link> / Invitation
        </p>
        <h1 className="live-game__absent-title">
          {host.name} invites you to a {view.game === 'chess960' ? 'Chess960 ' : ''}correspondence
          game
        </h1>
        <p>
          {describeTimeControl(view.tc)}: each of you has these days for every move, and plays
          whenever suits. You play {open}.
        </p>
        {view.game === 'chess960' ? (
          <p data-testid="live-join-variant">
            {chess960Label(view.startFen)}: the pieces start in the same shuffled order for both of
            you. Castle by moving the king onto its rook.
          </p>
        ) : null}
        <p className="small muted">
          You play as <b>{name}</b>. Your name and rating show as on Play.
        </p>
        {view.error ? (
          <p className="small live-game__error" role="alert">
            {view.error}
          </p>
        ) : null}
        <div className="row">
          <Button
            variant="primary"
            disabled={asked || view.connection !== 'open'}
            onClick={() => {
              setAsked(true);
              session.join();
            }}
            data-testid="live-join-button"
          >
            {asked ? 'Joining…' : 'Join this game'}
          </Button>
          <LinkButton to="/play">Not now</LinkButton>
        </div>
      </Card>
    </div>
  );
}

/** "Patient Bishop v Swift Knight". */
const pairing = (view: LiveGameView) => `${view.white.name} v ${view.black.name}`;

function WatchHeader({ view }: { view: LiveGameView }) {
  const options = describeOptions(view.game, view.opts);
  const corr = isCorrespondence(view.tc);
  // "Chess960 · position 274 · 5+3": its start position, by number.
  const name = view.game === 'chess960' ? chess960Label(view.startFen) : gameName(view.game);
  const what =
    view.game === 'chess'
      ? corr
        ? `Correspondence · ${describeTimeControl(view.tc)}`
        : describeTimeControl(view.tc)
      : [name, options, corr ? describeTimeControl(view.tc) : view.tc].filter(Boolean).join(' · ');
  return (
    <div className="page-header page-header--lean">
      <p className="card__eyebrow">
        <Link to="/play">Play</Link> / Watching
      </p>
      <h1>{pairing(view)}</h1>
      <p className="live-game__subtitle-line">
        {what}
        {view.game === 'blindfold'
          ? ' · The players cannot see the pieces; you can.'
          : view.game === 'army'
            ? ' · Each side bought its army in secret.'
            : ''}
      </p>
    </div>
  );
}

function WatchBoard({ session, view }: { session: LiveGameSession; view: LiveGameView }) {
  const navigate = useNavigate();
  const movesKey = view.moves.join(' ');
  const position = useMemo(
    () => replayMoves(movesKey ? movesKey.split(' ') : [], view.startFen, view.game),
    [movesKey, view.startFen, view.game],
  );
  const [orientation, setOrientation] = useState<Side>('white');
  const playing = view.status === 'playing';
  const drafting = view.status === 'draft';
  const corr = isCorrespondence(view.tc);
  const mover = position.turn === 'white' ? view.white : view.black;

  useEffect(() => {
    document.title = `Watching ${pairing(view)} · ${siteConfig.name}`;
  }, [view]);

  // A move's sound for each move from here on; the snapshot that came first is not news.
  const previous = useRef(view);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (before === view || view.moves.length !== before.moves.length + 1) return;
    if (position.history.length !== view.moves.length) return;
    const move = position.history[position.history.length - 1];
    if (move) playMoveSound(move, position.chess);
  }, [view, position]);

  const status = (() => {
    if (view.status === 'over') return watchedEnd(view);
    if (view.connection === 'reconnecting') return 'Reconnecting…';
    if (view.connection === 'closed') return 'The connection to this game has closed.';
    if (drafting) return 'The players are buying their armies.';
    if (view.open) return 'Waiting for a player to take the other seat';
    return `${mover.name} to move`;
  })();

  const playerBar = (side: Side) => {
    const player = side === 'white' ? view.white : view.black;
    return (
      <PlayerBar
        name={
          <PlayerName
            player={player}
            you={false}
            left={playing && !corr && view.open === null && !view.present[side]}
          />
        }
        color={side}
        fen={position.fen}
        showMaterial={view.startFen === null || view.game === 'chess960'}
        extra={
          !view.clock ? null : corr ? (
            <DaysLeft clock={view.clock} side={side} live={playing} />
          ) : (
            <LiveClockDisplay clock={view.clock} side={side} live={playing} />
          )
        }
      />
    );
  };

  let extra: ReactNode = null;
  if (drafting && view.draft) {
    const ready = view.draft.ready;
    extra = (
      <ul className="live-draft__ready" data-testid="watch-draft">
        {(['white', 'black'] as const).map((side) => (
          <li key={side}>
            {(side === 'white' ? view.white : view.black).name}:{' '}
            {ready[side] ? 'army chosen' : 'still choosing'}
          </li>
        ))}
      </ul>
    );
  } else if (view.game === 'chess960') {
    // The start position by number, here too: a phone held upright hides the header's.
    extra = (
      <p className="small muted live-game__armies live-game__variant" data-testid="watch-variant">
        {chess960Label(view.startFen)}
      </p>
    );
  } else if (view.game === 'blindfold' && view.peeks) {
    extra = (
      <p className="small muted live-game__armies" data-testid="watch-peeks">
        Peeks used: {view.white.name} {view.peeks.white} of {BLINDFOLD_PEEKS}, {view.black.name}{' '}
        {view.peeks.black} of {BLINDFOLD_PEEKS}.
      </p>
    );
  }

  return (
    <div>
      <WatchHeader view={view} />
      <div className="trainer">
        <div className="play__boardcol">
          {playerBar(opposite(orientation))}
          <div className="trainer__board">
            <Board
              fen={position.fen}
              orientation={orientation}
              turnColor={position.turn}
              lastMove={position.lastMove}
              check={position.check}
              chess960={view.game === 'chess960'}
              viewOnly
              ariaLabel={`Watched game board, ${sideName(position.turn).toLowerCase()} to move`}
            />
          </div>
          {playerBar(orientation)}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <p
              className="live-game__status"
              role="status"
              aria-live="polite"
              data-testid="live-status"
            >
              {status}
            </p>
            {extra}
            {view.error ? (
              <p className="small live-game__error" role="alert">
                {view.error}
              </p>
            ) : null}
            <p className="small muted live-game__watchers" data-testid="live-watchers">
              <Icon name="eye" size={16} className="live-game__watchers-icon" />
              <span>{watchingText(Math.max(1, view.watchers))}</span>
            </p>
            <div className="play__actions">
              <Button onClick={() => setOrientation((side) => opposite(side))}>Flip</Button>
              {view.next ? (
                <Button variant="primary" onClick={() => void navigate(view.next?.path ?? '/play')}>
                  Watch the rematch
                </Button>
              ) : null}
              <AnalyseTogether session={session} view={view} />
              <LinkButton to="/play">Back to Play</LinkButton>
            </div>
            <p className="small muted live-game__note">
              You are watching: the players see how many watch, and nothing else of you.
            </p>
          </Card>
          <Card>
            <MoveList moves={position.history} currentPly={position.history.length} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

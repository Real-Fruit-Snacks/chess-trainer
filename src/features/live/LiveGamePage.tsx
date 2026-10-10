import type { Square } from 'chess.js';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useFocus } from '@/app/focus';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { ClockDisplay } from '@/components/chess/ClockDisplay';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { Alert, Badge, Button, Card, ConfirmDialog, Dialog, LinkButton } from '@/components/ui';
import { isPromotionMove, opposite } from '@/chess/helpers';
import type { PromotionPiece } from '@/chess/types';
import { gameEndSound, playMoveSound, playSound } from '@/lib/sound';
import { useStackedLayout } from '@/lib/useStackedLayout';
import { useTicker } from '@/lib/useTicker';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { PHRASES } from '../../../relay/src/live/shared.mjs';
import {
  canAskTakeback,
  clockRemaining,
  endSentence,
  endSummary,
  endTitle,
  formatCountdown,
  monotonicNow,
  opponentOf,
  sideName,
  verdictOf,
} from './liveView';
import { replayMoves } from './liveViewBoard';
import { useLobby } from './lobby';
import { getLiveGame } from './sessions';
import type {
  LiveClock,
  LiveGameSession,
  LiveGameView,
  LivePlayer,
  LiveSource,
  PhraseId,
  Side,
} from './types';
import '@/features/play/play.css';
import './live.css';

/** Under this much time on your clock, a warning sounds (once a game). */
const LOW_TIME_MS = 10_000;
/** The phrases shown in the chat: the latest few. */
const CHAT_LINES = 6;
const PHRASE_IDS = Object.keys(PHRASES) as PhraseId[];
/** No moves for the board while it is not your turn (one Map, so the memoised board stays put). */
const NO_DESTS = new Map<Square, Square[]>();

/**
 * A live game against a person, through the relay or on Lichess. The page only
 * shows the game and passes moves and offers on: the connection belongs to
 * sessions.ts, and outlives the page (the bar under the header leads back).
 */
export default function LiveGamePage({ source }: { source: LiveSource }) {
  const { gameId = '' } = useParams();
  // A rematch is another game on the same route: its page starts afresh.
  return <LiveGame key={`${source}/${gameId}`} source={source} id={gameId} />;
}

function LiveGame({ source, id }: { source: LiveSource; id: string }) {
  const session = useMemo(() => getLiveGame(source, id), [source, id]);
  if (!session) {
    return source === 'lichess' ? (
      <GameAbsent title="Not signed in to Lichess" lichess>
        Sign in to Lichess to play your Lichess games here.
      </GameAbsent>
    ) : (
      <GameAbsent title="No seat in this game">
        This device has no seat in this game. A game belongs to the two players the waiting room
        paired.
      </GameAbsent>
    );
  }
  return <LiveSession session={session} />;
}

function GameAbsent({
  title,
  children,
  lichess = false,
}: {
  title: string;
  children: ReactNode;
  lichess?: boolean;
}) {
  useEffect(() => {
    document.title = `Live game · ${siteConfig.name}`;
  }, []);
  return (
    <div className="narrow">
      <Card data-testid="live-absent">
        <h1 className="live-game__absent-title">{title}</h1>
        <p>{children}</p>
        <div className="row">
          <LinkButton variant="primary" to="/play/online">
            Go to the waiting room
          </LinkButton>
          {lichess ? <LinkButton to="/settings#lichess">Lichess in Settings</LinkButton> : null}
        </div>
      </Card>
    </div>
  );
}

function LiveSession({ session }: { session: LiveGameSession }) {
  // Bound here: the session's methods are called through it, never torn off.
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getView = useCallback(() => session.getView(), [session]);
  const view = useSyncExternalStore(subscribe, getView);
  if (view.missing) {
    return (
      <GameAbsent title="Game not found">
        This game is over and gone, or it was never yours.
      </GameAbsent>
    );
  }
  return <LiveBoard session={session} view={view} />;
}

function LiveBoard({ session, view }: { session: LiveGameSession; view: LiveGameView }) {
  const { pathname } = useLocation();
  const stacked = useStackedLayout();
  const movesKey = view.moves.join(' ');
  const position = useMemo(() => replayMoves(movesKey ? movesKey.split(' ') : []), [movesKey]);
  const opponent = opponentOf(view);
  const opponentSide = opposite(view.you);
  const playing = view.status === 'playing';
  const closed = view.connection === 'closed';
  const yourTurn = playing && position.turn === view.you;
  const canMove = yourTurn && !closed;
  const [flipped, setFlipped] = useState(false);
  const orientation: Side = flipped ? opposite(view.you) : view.you;
  // A promotion being chosen belongs to the position it was started in: once the moves change
  // (the clock ran out, a takeback) the picker has nothing left to finish.
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; at: string } | null>(null);
  const choosingPromotion = !!promotion && promotion.at === movesKey && canMove;
  const [confirmResign, setConfirmResign] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const resultOpen = view.status === 'over' && !resultDismissed;

  useEffect(() => {
    document.title = yourTurn
      ? `Your move · Live game · ${siteConfig.name}`
      : `Live game · ${siteConfig.name}`;
  }, [yourTurn]);

  // Focus mode, as in Play: no header and navigation while the game is on.
  const playFocus = useSettings((s) => s.playFocus);
  const updateSettings = useSettings((s) => s.update);
  const setFocus = useFocus((s) => s.set);
  const focusOn = playFocus && playing;
  useEffect(() => {
    setFocus(focusOn);
    return () => setFocus(false);
  }, [focusOn, setFocus]);

  // The waiting room's news of this game is old news once its board shows: the bar must not
  // offer the way here again.
  useEffect(() => {
    const lobby = useLobby.getState();
    if (lobby.pairing?.path === pathname) lobby.clearPairing();
  }, [pathname]);

  // Sounds for what happens from here on: a move (either side's), the end, a rematch to go to.
  // The first word from the game (a snapshot of what happened before) is not news.
  const previous = useRef(view);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (before === view || before.connection === 'connecting') return;
    if (
      view.moves.length === before.moves.length + 1 &&
      position.history.length === view.moves.length
    ) {
      const move = position.history[position.history.length - 1];
      if (move) playMoveSound(move, position.chess);
    }
    if (before.status === 'playing' && view.status === 'over') {
      const verdict = verdictOf(view);
      playSound(gameEndSound(verdict === 'win' || verdict === 'loss' ? verdict : 'draw'));
    }
    if (!before.next && view.next) playSound('notify');
  }, [view, position]);

  const lowTimeWarned = useRef(false);
  const onLowTime = useCallback(() => {
    if (lowTimeWarned.current) return;
    lowTimeWarned.current = true;
    playSound('lowTime');
  }, []);

  const onMove = (from: Square, to: Square) => {
    if (!canMove) return;
    if (isPromotionMove(position.chess, from, to)) {
      setPromotion({ from, to, at: movesKey });
      return;
    }
    // Castling arrives as the king's two-square move (the board turns a king dropped on its rook
    // into that), which is what the relay and Lichess expect.
    session.move(`${from}${to}`);
  };

  const onPromotion = (piece: PromotionPiece | null) => {
    const pending = choosingPromotion ? promotion : null;
    setPromotion(null);
    if (piece && pending) session.move(`${pending.from}${pending.to}${piece}`);
  };

  const playerBar = (side: Side) => {
    const player = side === 'white' ? view.white : view.black;
    const you = side === view.you;
    return (
      <PlayerBar
        name={
          <PlayerName player={player} you={you} left={!you && playing && !view.opponentPresent} />
        }
        color={side}
        fen={position.fen}
        extra={
          view.clock ? (
            <LiveClockDisplay
              clock={view.clock}
              side={side}
              live={playing}
              onLow={you ? onLowTime : undefined}
            />
          ) : null
        }
      />
    );
  };

  /**
   * What the opponent asks, and their leaving. Beside the board on wide screens; under it when the
   * panel is stacked below, where an offer would otherwise wait out of sight.
   */
  const alerts: ReactNode[] = [];
  if (playing && view.offers.draw === opponentSide) {
    alerts.push(
      <OfferAlert
        key="draw"
        text={`${opponent.name} offers a draw.`}
        onAnswer={(op) => session.draw(op)}
        testId="live-draw-offer"
      />,
    );
  }
  if (playing && view.offers.takeback === opponentSide) {
    alerts.push(
      <OfferAlert
        key="takeback"
        text={`${opponent.name} asks to take back a move.`}
        onAnswer={(op) => session.takeback(op)}
        testId="live-takeback-offer"
      />,
    );
  }
  if (!playing && view.offers.rematch === opponentSide && !view.next) {
    alerts.push(
      <OfferAlert
        key="rematch"
        text={`${opponent.name} wants a rematch.`}
        onAnswer={(op) => session.rematch(op)}
        testId="live-rematch-offer"
      />,
    );
  }
  if (playing && view.claimAt !== null) {
    alerts.push(
      <LeftAlert
        key="left"
        name={opponent.name}
        claimAt={view.claimAt}
        onClaim={(op) => session.claim(op)}
      />,
    );
  }

  const verdict = verdictOf(view);
  // Aborted games, and games too short to review, are not kept in My games (record.ts).
  const recorded = verdict !== 'aborted' && view.moves.length >= 2;
  const endActions = (
    <EndActions view={view} session={session} opponentSide={opponentSide} recorded={recorded} />
  );

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow">
          <Link to="/play/online">Play online</Link> / Live game
        </p>
        <h1>Live game</h1>
      </div>

      <div className="trainer">
        <div className="play__boardcol">
          {playerBar(opposite(orientation))}
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={position.fen}
              orientation={orientation}
              turnColor={position.turn}
              movableColor={canMove ? view.you : undefined}
              dests={canMove ? position.dests : NO_DESTS}
              lastMove={position.lastMove}
              check={position.check}
              onMove={onMove}
              ariaLabel={`Live game board, ${position.turn} to move`}
            />
            {choosingPromotion ? <PromotionPicker color={view.you} onSelect={onPromotion} /> : null}
          </div>
          {playerBar(orientation)}
          {playing && view.firstMove ? <FirstMoveNotice firstMove={view.firstMove} /> : null}
          {stacked && alerts.length > 0 ? (
            <div className="stack live-game__alerts">{alerts}</div>
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <h2 className="live-game__title">
                {opponent.name} · {view.tc}
              </h2>
              <Badge tone={view.rated ? 'accent' : 'neutral'}>
                {view.rated ? 'Rated on Lichess' : 'Casual'}
              </Badge>
            </div>
            <p
              className={`live-game__status${yourTurn && !closed ? ' live-game__status--you' : ''}`}
              role="status"
              data-testid="live-status"
            >
              {statusLine(view, position.turn, opponent.name)}
            </p>
            <div className="play__actions">
              {playing && view.moves.length >= 2 ? (
                <>
                  <Button
                    onClick={() => session.draw('offer')}
                    disabled={closed || view.offers.draw !== null}
                  >
                    {view.offers.draw === view.you ? 'Draw offered' : 'Offer draw'}
                  </Button>
                  {view.capabilities.takeback ? (
                    <Button
                      onClick={() => session.takeback('offer')}
                      disabled={closed || view.offers.takeback !== null || !canAskTakeback(view)}
                    >
                      {view.offers.takeback === view.you ? 'Takeback asked' : 'Takeback'}
                    </Button>
                  ) : null}
                </>
              ) : null}
              <Button onClick={() => setFlipped((f) => !f)}>Flip</Button>
              <Button
                onClick={() => updateSettings({ playFocus: !playFocus })}
                aria-pressed={playFocus}
                title="Hide the header and navigation while a game is on"
                data-testid="focus-toggle"
              >
                Focus
              </Button>
              {playing ? (
                view.moves.length < 2 ? (
                  <Button variant="danger" onClick={() => session.abort()} disabled={closed}>
                    Abort
                  </Button>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmResign(true)} disabled={closed}>
                    Resign
                  </Button>
                )
              ) : null}
            </div>
            {!playing ? <div className="play__actions">{endActions}</div> : null}
            {view.error ? (
              <p className="small live-game__error" role="alert">
                {view.error}
              </p>
            ) : null}
            <p className="small muted live-game__note">
              No engine help in live games.
              {/* Once the game is over, the end actions carry this link. */}
              {playing && view.source === 'lichess' && view.url ? (
                <>
                  {' '}
                  <a href={view.url} target="_blank" rel="noreferrer">
                    Open on Lichess
                  </a>
                </>
              ) : null}
            </p>
          </Card>

          {stacked ? null : alerts}

          {view.capabilities.phrases ? (
            <Phrases session={session} view={view} opponentName={opponent.name} />
          ) : null}

          <Card>
            <MoveList moves={position.history} currentPly={position.history.length} />
          </Card>
        </aside>
      </div>

      {/* A game that ends while the question is up (a flag, the opponent resigning) closes it. */}
      <ConfirmDialog
        open={confirmResign && playing}
        title="Resign this game?"
        cancelLabel="Keep playing"
        confirmLabel="Resign"
        danger
        onConfirm={() => session.resign()}
        onClose={() => setConfirmResign(false)}
      >
        <p className="muted">{opponent.name} wins the game.</p>
      </ConfirmDialog>

      <Dialog
        open={resultOpen}
        onClose={() => setResultDismissed(true)}
        title={endTitle(verdict)}
        actions={(close) => (
          <>
            <Button variant="ghost" onClick={close}>
              Show the board
            </Button>
            {endActions}
          </>
        )}
      >
        <p data-testid="live-end-sentence">{endSentence(view, opponent.name)}</p>
        {view.offers.rematch === opponentSide && !view.next ? (
          <p className="muted">{opponent.name} wants a rematch.</p>
        ) : null}
      </Dialog>
    </div>
  );
}

function statusLine(view: LiveGameView, turn: Side, opponentName: string): string {
  if (view.status === 'over') return endSummary(view, opponentName);
  if (view.connection === 'reconnecting') return 'Reconnecting…';
  if (view.connection === 'connecting') return 'Connecting…';
  if (view.connection === 'closed') return 'The connection to this game has closed.';
  return turn === view.you ? 'Your move' : `${opponentName} to move`;
}

function PlayerName({ player, you, left }: { player: LivePlayer; you: boolean; left: boolean }) {
  return (
    // The spaces between the parts are for screen readers and copied text; the flex gap spaces
    // them on screen.
    <span className="live-game__player">
      {player.title ? <span className="live-game__ptitle">{player.title}</span> : null}{' '}
      <span>{player.name}</span>
      {you ? <span className="sr-only"> (you)</span> : null}{' '}
      {player.rating !== null ? <span className="live-game__rating">{player.rating}</span> : null}{' '}
      {left ? <Badge tone="warning">Left</Badge> : null}
    </span>
  );
}

/** One side's clock: only the running one ticks (five times a second, with the shared ticker). */
function LiveClockDisplay({
  clock,
  side,
  live,
  onLow,
}: {
  clock: LiveClock;
  side: Side;
  live: boolean;
  onLow?: () => void;
}) {
  const running = live && clock.running === side;
  useTicker(running);
  const ms = clockRemaining(clock, side, running ? monotonicNow() : clock.at);
  const low = running && ms <= LOW_TIME_MS;
  useEffect(() => {
    if (low) onLow?.();
  }, [low, onLow]);
  return <ClockDisplay ms={ms} running={running} lowTimeMs={LOW_TIME_MS} />;
}

function FirstMoveNotice({ firstMove }: { firstMove: { color: Side; deadline: number } }) {
  useTicker(true);
  const left = firstMove.deadline - monotonicNow();
  return (
    <p className="live-game__first" data-testid="live-first-move">
      {sideName(firstMove.color)} must move within {formatCountdown(left)}, or the game is aborted.
    </p>
  );
}

function OfferAlert({
  text,
  onAnswer,
  testId,
}: {
  text: string;
  onAnswer: (op: 'accept' | 'decline') => void;
  testId: string;
}) {
  return (
    <Alert tone="info">
      <div className="live-game__offer" data-testid={testId}>
        <span>{text}</span>
        <span className="row">
          <Button size="sm" variant="primary" onClick={() => onAnswer('accept')}>
            Accept
          </Button>
          <Button size="sm" onClick={() => onAnswer('decline')}>
            Decline
          </Button>
        </span>
      </div>
    </Alert>
  );
}

/**
 * The opponent's connection has gone: after a while the game may be claimed.
 * The countdown is a timer, kept out of the live region, so a screen reader
 * hears that the opponent left once rather than every second of the wait.
 */
function LeftAlert({
  name,
  claimAt,
  onClaim,
}: {
  name: string;
  claimAt: number;
  onClaim: (op: 'win' | 'draw') => void;
}) {
  useTicker(true);
  const wait = claimAt - monotonicNow();
  return (
    <div className="alert alert--warning live-game__left" data-testid="live-left">
      <p className="live-game__left-text" role="status">
        {name} has left the game.
      </p>
      {wait > 0 ? (
        <p className="live-game__left-text">
          You can claim the game in <span role="timer">{formatCountdown(wait)}</span>.
        </p>
      ) : (
        <div className="row">
          <Button size="sm" variant="primary" onClick={() => onClaim('win')}>
            Claim the win
          </Button>
          <Button size="sm" onClick={() => onClaim('draw')}>
            Call it a draw
          </Button>
        </div>
      )}
    </div>
  );
}

function Phrases({
  session,
  view,
  opponentName,
}: {
  session: LiveGameSession;
  view: LiveGameView;
  opponentName: string;
}) {
  const start = Math.max(0, view.chat.length - CHAT_LINES);
  const lines = view.chat.slice(start);
  return (
    <Card as="section" aria-labelledby="live-chat-title">
      <h2 id="live-chat-title" className="live-game__subtitle">
        Messages
      </h2>
      <div className="live-game__phrases" role="group" aria-label="Send a phrase">
        {PHRASE_IDS.map((id) => (
          <Button
            key={id}
            size="sm"
            onClick={() => session.say(id)}
            disabled={view.connection === 'closed'}
          >
            {PHRASES[id]}
          </Button>
        ))}
      </div>
      {/* Polite: a phrase is read out after whatever is being read, never over it. */}
      <ol className="live-game__chat" aria-live="polite" aria-label="Messages so far">
        {lines.map((line, i) => (
          <li key={start + i}>
            <span className="live-game__chat-by">
              {line.by === view.you ? 'You' : opponentName}:
            </span>{' '}
            {line.text}
          </li>
        ))}
      </ol>
      {view.chat.length === 0 ? (
        <p className="small muted live-game__note">Only these set phrases can be sent.</p>
      ) : null}
    </Card>
  );
}

/** What to do once the game is over: in the result dialog, and in the panel after it. */
function EndActions({
  view,
  session,
  opponentSide,
  recorded,
}: {
  view: LiveGameView;
  session: LiveGameSession;
  opponentSide: Side;
  recorded: boolean;
}) {
  const navigate = useNavigate();
  const next = view.next;
  let rematch: ReactNode = null;
  if (view.capabilities.rematch) {
    rematch = next ? (
      <Button variant="primary" onClick={() => void navigate(next.path)}>
        Play the rematch
      </Button>
    ) : view.offers.rematch === view.you ? (
      <Button variant="primary" disabled>
        Rematch offered
      </Button>
    ) : view.offers.rematch === opponentSide ? (
      <Button variant="primary" onClick={() => session.rematch('accept')}>
        Accept the rematch
      </Button>
    ) : (
      <Button
        variant="primary"
        onClick={() => session.rematch('offer')}
        disabled={view.connection === 'closed'}
      >
        Rematch
      </Button>
    );
  }
  return (
    <>
      {recorded ? <LinkButton to="/games">Review in My games</LinkButton> : null}
      <LinkButton to="/play/online">New opponent</LinkButton>
      {view.source === 'lichess' && view.url ? (
        <a className="btn btn--primary" href={view.url} target="_blank" rel="noreferrer">
          Open on Lichess
        </a>
      ) : null}
      {rematch}
    </>
  );
}

import type { MoveMetadata } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
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
import { MoveInput } from '@/components/chess/MoveInput';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Icon,
  LinkButton,
} from '@/components/ui';
import { opposite, toUci, tryNotation } from '@/chess/helpers';
import { San } from '@/chess/San';
import { describeArmy } from '@/features/arcade/army';
import type { PromotionPiece } from '@/chess/types';
import { gameEndSound, playMoveSound, playSound } from '@/lib/sound';
import { useStackedLayout } from '@/lib/useStackedLayout';
import { useTicker } from '@/lib/useTicker';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { BLINDFOLD_PEEKS, isCorrespondence } from '../../../relay/src/live/shared.mjs';
import { AnalyseTogether } from './AnalyseTogether';
import { LiveDraftPanel } from './LiveDraft';
import { DaysLeft, GameAbsent, LiveClockDisplay, PlayerName } from './LiveParts';
import { WatchGame } from './WatchGame';
import {
  canAskTakeback,
  describeTimeControl,
  endSentence,
  endSummary,
  endTitle,
  formatCountdown,
  monotonicNow,
  opponentOf,
  sideName,
  gameLink,
  verdictOf,
  watchingText,
  watchLink,
} from './liveView';
import { chess960Label, replayMoves } from './liveViewBoard';
import { useLobby } from './lobby';
import { describeOptions, gameName } from './onlineGames';
import { PhraseCard } from './PhraseCard';
import { shareLink } from './share';
import { getLiveGame } from './sessions';
import type { LiveGameSession, LiveGameView, LiveSource, Side } from './types';
import '@/features/play/play.css';
import './live.css';

/** No moves for the board while it is not your turn (one Map, so the memoised board stays put). */
const NO_DESTS = new Map<Square, Square[]>();
/** How long a blindfold peek shows the pieces. */
const PEEK_MS = 2000;

/**
 * A live game against a person, through the relay or on Lichess. The page only
 * shows the game and passes moves and offers on: the connection belongs to
 * sessions.ts, and outlives the page (the bar under the header leads back).
 */
export default function LiveGamePage({ source }: { source: LiveSource }) {
  const { gameId = '' } = useParams();
  // Taking an invitation's open seat makes this device a player: its board starts afresh.
  const [joined, setJoined] = useState(0);
  // A rematch is another game on the same route: its page starts afresh.
  return (
    <LiveGame
      key={`${source}/${gameId}/${joined}`}
      source={source}
      id={gameId}
      onJoined={() => setJoined((n) => n + 1)}
    />
  );
}

function LiveGame({
  source,
  id,
  onJoined,
}: {
  source: LiveSource;
  id: string;
  onJoined: () => void;
}) {
  const session = useMemo(() => getLiveGame(source, id), [source, id]);
  if (!session) {
    // A game on the relay without a seat here: someone else's, to watch, or a correspondence
    // invitation whose open seat this device may take.
    if (source === 'relay') return <WatchGame id={id} onJoined={onJoined} />;
    return (
      <GameAbsent title="Not signed in to Lichess" lichess>
        Sign in to Lichess to play your Lichess games here.
      </GameAbsent>
    );
  }
  return <LiveSession session={session} />;
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
  if (view.status === 'draft' && view.draft) {
    return (
      <div>
        <GameHeader view={view} />
        <LiveDraftPanel session={session} view={view} draft={view.draft} />
      </div>
    );
  }
  return <LiveBoard session={session} view={view} />;
}

/** "Live game", "Army Draft", "Blindfold game": the page's title, under Play. */
function gameTitle(view: LiveGameView): string {
  if (isCorrespondence(view.tc)) return 'Correspondence game';
  if (view.game === 'chess') return 'Live game';
  if (view.game === 'blindfold') return 'Blindfold game';
  return gameName(view.game);
}

function GameHeader({ view }: { view: LiveGameView }) {
  const options = describeOptions(view.game, view.opts);
  return (
    <div className="page-header page-header--lean">
      <p className="card__eyebrow">
        <Link to="/play">Play</Link> / {view.game === 'chess' ? 'Live game' : gameName(view.game)}
      </p>
      <h1>{gameTitle(view)}</h1>
      {view.game === 'chess960' ? (
        <p className="live-game__subtitle-line">
          {chess960Label(view.startFen)}. Castle by moving the king onto its rook.
        </p>
      ) : null}
      {isCorrespondence(view.tc) ? (
        <p className="live-game__subtitle-line">
          {describeTimeControl(view.tc)}: play whenever suits, within the days of each move.
        </p>
      ) : view.game === 'army' ? (
        <p className="live-game__subtitle-line">
          {options ? `${options} · ` : ''}
          Kings are free, and nobody castles.
        </p>
      ) : view.game === 'blindfold' ? (
        <p className="live-game__subtitle-line">
          The pieces stay hidden: follow the moves, and play by the squares or by typing them.
        </p>
      ) : null}
    </div>
  );
}

function LiveBoard({ session, view }: { session: LiveGameSession; view: LiveGameView }) {
  const { pathname } = useLocation();
  const stacked = useStackedLayout();
  const movesKey = view.moves.join(' ');
  const position = useMemo(
    () => replayMoves(movesKey ? movesKey.split(' ') : [], view.startFen, view.game),
    [movesKey, view.startFen, view.game],
  );
  const chess960 = view.game === 'chess960';
  const opponent = opponentOf(view);
  const opponentSide = opposite(view.you);
  const playing = view.status === 'playing';
  const closed = view.connection === 'closed';
  // Correspondence: days for every move, and an invitation's seat that may still be open.
  const corr = isCorrespondence(view.tc);
  const inviting = playing && view.open !== null;
  const yourTurn = playing && position.turn === view.you && !inviting;
  const canMove = yourTurn && !closed;
  // Premoves: a move made during the opponent's turn waits and is played the moment theirs
  // arrives. Not with the pieces hidden, nor over days.
  const premovesOn = useSettings((s) => s.livePremoves);
  const premoves =
    premovesOn && playing && !closed && !inviting && !corr && view.game !== 'blindfold';
  const [flipped, setFlipped] = useState(false);
  const orientation: Side = flipped ? opposite(view.you) : view.you;
  // A promotion being chosen belongs to the position it was started in: once the moves change
  // (the clock ran out, a takeback) the picker has nothing left to finish.
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; at: string } | null>(null);
  const choosingPromotion = !!promotion && promotion.at === movesKey && canMove;
  const [confirmResign, setConfirmResign] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const resultOpen = view.status === 'over' && !resultDismissed;
  // Blindfold: the pieces stay hidden while the game is on, but for a peek.
  const blind = view.game === 'blindfold' && view.status !== 'over';
  const [peeking, setPeeking] = useState(false);
  const peekTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (peekTimer.current !== null) window.clearTimeout(peekTimer.current);
    },
    [],
  );
  const peeksLeft = view.peeks ? Math.max(0, BLINDFOLD_PEEKS - view.peeks[view.you]) : 0;
  const peek = () => {
    if (!blind || peeking || peeksLeft === 0) return;
    session.peek();
    setPeeking(true);
    peekTimer.current = window.setTimeout(() => {
      peekTimer.current = null;
      setPeeking(false);
    }, PEEK_MS);
  };
  // A drafted position has no captured material to count from the usual set; Chess960 has it.
  const showMaterial = view.startFen === null || chess960;
  const lastMove = position.history[position.history.length - 1];

  useEffect(() => {
    document.title = yourTurn
      ? `Your move · ${gameTitle(view)} · ${siteConfig.name}`
      : `${gameTitle(view)} · ${siteConfig.name}`;
  }, [yourTurn, view]);

  // Focus mode, as in Play: no header and navigation while the game is on.
  const playFocus = useSettings((s) => s.playFocus);
  const updateSettings = useSettings((s) => s.update);
  const setFocus = useFocus((s) => s.set);
  // Not for a game played over days.
  const focusOn = playFocus && playing && !corr;
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

  const onMove = (from: Square, to: Square, meta?: MoveMetadata) => {
    if (!canMove) return;
    if (position.isPromotion(from, to)) {
      // A premoved promotion is played at once, so it becomes a queen: there is no time to ask.
      if (meta?.premove) session.move(`${from}${to}q`);
      else setPromotion({ from, to, at: movesKey });
      return;
    }
    // Castling arrives as the king's two-square move (the board turns a king dropped on its rook
    // into that), which is what the relay and Lichess expect; in Chess960 as the king onto its
    // rook, which is what the room expects there.
    session.move(`${from}${to}`);
  };

  const onPromotion = (piece: PromotionPiece | null) => {
    const pending = choosingPromotion ? promotion : null;
    setPromotion(null);
    if (piece && pending) session.move(`${pending.from}${pending.to}${piece}`);
  };

  /** A move typed in (SAN or coordinates), played if it is legal here. */
  const onNotation = (notation: string): boolean => {
    if (!canMove) return false;
    const move = tryNotation(new Chess(position.fen), notation);
    if (!move) return false;
    session.move(toUci(move));
    return true;
  };

  const playerBar = (side: Side) => {
    const player = side === 'white' ? view.white : view.black;
    const you = side === view.you;
    // Over days a player away is no news: they come back to move.
    const left = !you && playing && !corr && !view.opponentPresent;
    return (
      <PlayerBar
        name={
          view.open === side ? (
            <span className="live-game__player muted">Your friend, once they join</span>
          ) : (
            <PlayerName player={player} you={you} left={left} />
          )
        }
        color={side}
        fen={position.fen}
        showMaterial={showMaterial}
        extra={
          !view.clock ? null : corr ? (
            <DaysLeft clock={view.clock} side={side} live={playing} />
          ) : (
            <LiveClockDisplay
              clock={view.clock}
              side={side}
              live={playing}
              onLow={you ? onLowTime : undefined}
            />
          )
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
      <GameHeader view={view} />

      <div className="trainer">
        <div className="play__boardcol">
          {playerBar(opposite(orientation))}
          <div className="trainer__board">
            <Board
              fen={position.fen}
              orientation={orientation}
              turnColor={position.turn}
              movableColor={canMove || premoves ? view.you : undefined}
              dests={canMove ? position.dests : NO_DESTS}
              chess960={chess960}
              premovable={premoves}
              lastMove={position.lastMove}
              check={position.check}
              onMove={onMove}
              ariaLabel={`Live game board, ${position.turn} to move`}
              className={blind && !peeking ? 'board--blindfold' : undefined}
            />
            {choosingPromotion ? <PromotionPicker color={view.you} onSelect={onPromotion} /> : null}
          </div>
          {playerBar(orientation)}
          {view.game === 'blindfold' ? (
            <div className="live-game__blind" data-testid="blindfold-bar">
              <p className="small live-game__blind-text">
                {lastMove ? (
                  <>
                    Last move: {Math.ceil(position.history.length / 2)}
                    {lastMove.color === 'w' ? '.' : '…'} <San san={lastMove.san} />
                  </>
                ) : (
                  'No moves yet.'
                )}{' '}
                <span className="muted" data-testid="blindfold-peeks">
                  {view.peeks
                    ? `You have ${peeksLeft} peek${peeksLeft === 1 ? '' : 's'} left; ${opponent.name} has used ${view.peeks[opponentSide]}.`
                    : ''}
                </span>
              </p>
              {blind ? (
                <Button size="sm" onClick={peek} disabled={peeking || peeksLeft === 0 || closed}>
                  {peeking ? 'Peeking…' : 'Peek'}
                </Button>
              ) : null}
            </div>
          ) : null}
          {view.game === 'blindfold' && playing ? (
            <MoveInput onMove={onNotation} disabled={!canMove} keepFocus />
          ) : null}
          {playing && view.firstMove ? <FirstMoveNotice firstMove={view.firstMove} /> : null}
          {stacked && alerts.length > 0 ? (
            <div className="stack live-game__alerts">{alerts}</div>
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <h2 className="live-game__title">
                {inviting ? 'Your invitation' : opponent.name} ·{' '}
                {corr ? describeTimeControl(view.tc) : view.tc}
              </h2>
              <Badge tone={view.rated ? 'accent' : 'neutral'}>
                {view.rated ? 'Rated on Lichess' : corr ? 'Correspondence' : 'Casual'}
              </Badge>
            </div>
            {/* The start position by number, here too: a phone held upright hides the header's. */}
            {chess960 ? (
              <p
                className="small muted live-game__armies live-game__variant"
                data-testid="live-variant"
              >
                {chess960Label(view.startFen)}
              </p>
            ) : null}
            {view.game === 'army' && view.draft ? (
              <p className="small muted live-game__armies" data-testid="live-armies">
                {[view.you, opponentSide]
                  .map((side) => {
                    const army = view.draft?.armies[side];
                    const who = side === view.you ? 'You' : opponent.name;
                    return army ? `${who}: ${describeArmy(army)}` : null;
                  })
                  .filter(Boolean)
                  .join('. ')}
                .
              </p>
            ) : null}
            <p
              className={`live-game__status${yourTurn && !closed ? ' live-game__status--you' : ''}`}
              role="status"
              data-testid="live-status"
            >
              {statusLine(view, position.turn, opponent.name)}
            </p>
            {inviting ? (
              <div className="live-game__invite" data-testid="live-invite">
                <p className="small">
                  Send your friend this game’s link: it opens the game for them, in the app, and the
                  first to take the other seat plays you. It waits a week.
                </p>
                <div className="row">
                  <Button
                    variant="primary"
                    onClick={() =>
                      void shareLink(
                        gameLink(view.id),
                        chess960
                          ? 'Play me: a Chess960 correspondence game'
                          : 'Play me: a correspondence game',
                        'Link copied.',
                      )
                    }
                  >
                    <Icon name="link" size={18} />
                    <span>Copy the link</span>
                  </Button>
                </div>
              </div>
            ) : null}
            {view.watchers > 0 ? (
              <p className="small muted live-game__watchers" data-testid="live-watchers">
                <Icon name="eye" size={16} className="live-game__watchers-icon" />
                <span>{watchingText(view.watchers)}</span>
              </p>
            ) : null}
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
              {playing && !inviting && view.source === 'relay' ? (
                <Button
                  onClick={() =>
                    void shareLink(
                      watchLink(view.id),
                      `Watch ${view.white.name} v ${view.black.name}`,
                      'Watch link copied.',
                    )
                  }
                  data-testid="live-watch-link"
                >
                  <Icon name="eye" size={18} />
                  <span>Copy watch link</span>
                </Button>
              ) : null}
              <Button onClick={() => setFlipped((f) => !f)}>Flip</Button>
              {corr ? null : (
                <Button
                  onClick={() => updateSettings({ playFocus: !playFocus })}
                  aria-pressed={playFocus}
                  title="Hide the header and navigation while a game is on"
                  data-testid="focus-toggle"
                >
                  Focus
                </Button>
              )}
              {playing ? (
                view.moves.length < 2 ? (
                  <Button variant="danger" onClick={() => session.abort()} disabled={closed}>
                    {inviting ? 'Call off the invitation' : 'Abort'}
                  </Button>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmResign(true)} disabled={closed}>
                    Resign
                  </Button>
                )
              ) : null}
            </div>
            {!playing ? <div className="play__actions">{endActions}</div> : null}
            {!playing && view.analysis?.by === opponentSide ? (
              <p className="small" role="status">
                {opponent.name} is analysing the game: join them.
              </p>
            ) : null}
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
            <PhraseCard
              chat={view.chat}
              you={view.you}
              opponentName={opponent.name}
              onSay={(phrase) => session.say(phrase)}
              disabled={view.connection === 'closed'}
            />
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
        {view.analysis?.by === opponentSide ? (
          <p className="muted" data-testid="live-analysis-offer">
            {opponent.name} is analysing the game: join them.
          </p>
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
  if (view.open) return 'Waiting for your friend to take the other seat';
  return turn === view.you ? 'Your move' : `${opponentName} to move`;
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
      <AnalyseTogether session={session} view={view} />
      <LinkButton to="/play">New opponent</LinkButton>
      {view.source === 'lichess' && view.url ? (
        <a className="btn btn--primary" href={view.url} target="_blank" rel="noreferrer">
          Open on Lichess
        </a>
      ) : null}
      {rematch}
    </>
  );
}

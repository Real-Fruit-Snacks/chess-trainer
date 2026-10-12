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
import { Button, Card, ConfirmDialog, Dialog, LinkButton } from '@/components/ui';
import { playSound } from '@/lib/sound';
import { useStackedLayout } from '@/lib/useStackedLayout';
import { useTicker } from '@/lib/useTicker';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { ArbiterDuelRound } from './duel/ArbiterDuelRound';
import { JudgeDuelRound } from './duel/JudgeDuelRound';
import { CountdownOverlay, PhaseClock } from './duel/PhaseClock';
import { DuelRaceStatus, RaceRound } from './duel/RaceRound';
import { DuelLanes, TimedRace } from './duel/TimedRace';
import { raceItems } from './duelRounds';
import {
  duelEndSentence,
  duelEndSummary,
  duelEndTitle,
  duelGoal,
  duelVerdict,
  roundLabel,
  roundWinnerWords,
  roundWords,
  scores,
} from './duelView';
import { formatCountdown, monotonicNow } from './liveView';
import { useLobby } from './lobby';
import { describeOptions, gameName } from './onlineGames';
import { OnlineNotice } from './LiveParts';
import { PhraseCard } from './PhraseCard';
import { getDuel } from './sessions';
import type { DuelSession, DuelView, LivePlayer, Side } from './types';
import '@/features/arcade/arcade.css';
import '@/features/play/play.css';
import './live.css';
import './duel/duel.css';

/**
 * A duel against a person: a puzzle race, an Arbiter duel or a Who Stands
 * Better? duel, played in rounds the relay runs and scores. The page shows
 * the round on and the score; the connection belongs to sessions.ts and
 * outlives the page (the bar under the header leads back).
 */
export default function DuelPage() {
  const { gameId = '' } = useParams();
  // A rematch is another duel on the same route: its page starts afresh.
  return <Duel key={gameId} id={gameId} />;
}

function Duel({ id }: { id: string }) {
  const session = useMemo(() => getDuel(id), [id]);
  if (!session) {
    return (
      <DuelAbsent title="No seat in this duel">
        This device has no seat in this duel. A duel belongs to the two players the waiting room
        paired.
      </DuelAbsent>
    );
  }
  return <DuelSessionView session={session} />;
}

function DuelAbsent({ title, children }: { title: string; children: ReactNode }) {
  return (
    <OnlineNotice
      crumb={{ to: '/play', label: 'Play', here: 'Game for two' }}
      title={title}
      docTitle="Game for two"
      testId="duel-absent"
      actions={
        <LinkButton variant="primary" to="/play">
          Back to Play
        </LinkButton>
      }
    >
      {children}
    </OnlineNotice>
  );
}

function DuelSessionView({ session }: { session: DuelSession }) {
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getView = useCallback(() => session.getView(), [session]);
  const view = useSyncExternalStore(subscribe, getView);
  if (view.missing) {
    return (
      <DuelAbsent title="Duel not found">
        This duel is over and gone, or it was never yours.
      </DuelAbsent>
    );
  }
  return <DuelScreen session={session} view={view} />;
}

/** "Puzzle race · Best of three · 1500": the tab's title. */
function duelTitle(view: DuelView): string {
  const options = describeOptions(view.game, view.opts);
  return options ? `${gameName(view.game)} · ${options}` : gameName(view.game);
}

/** The score, as a scoreboard: this player, the dash, the opponent. */
function Scoreboard({ view, opponent }: { view: DuelView; opponent: LivePlayer }) {
  const { mine, theirs } = scores(view);
  return (
    <div className="duel__score" data-testid="duel-score">
      <span className="duel__side">
        <span className="duel__name">You</span>
        <span className="duel__points" data-testid="duel-score-mine">
          {mine}
        </span>
      </span>
      <span className="duel__dash" aria-hidden="true">
        –
      </span>
      <span className="duel__side">
        <span className="duel__name">
          {opponent.name}
          {opponent.rating !== null ? (
            <span className="live-game__rating"> {opponent.rating}</span>
          ) : null}
        </span>
        <span className="duel__points" data-testid="duel-score-theirs">
          {theirs}
        </span>
      </span>
    </div>
  );
}

/**
 * The score in one line, above the board on a phone, where it stands in for the scoreboard: the
 * panel is under the board there, and the score is shown once.
 */
function ScoreLine({ view, opponent }: { view: DuelView; opponent: LivePlayer }) {
  const { mine, theirs } = scores(view);
  return (
    <p className="duel__line" data-testid="duel-strip">
      <span className="duel__line-name">You</span>{' '}
      <b className="duel__line-points" data-testid="duel-score-mine">
        {mine}
      </b>
      <span aria-hidden="true"> – </span>
      <span className="sr-only"> to </span>
      <b className="duel__line-points" data-testid="duel-score-theirs">
        {theirs}
      </b>{' '}
      <span className="duel__line-name">{opponent.name}</span>
    </p>
  );
}

function DuelScreen({ session, view }: { session: DuelSession; view: DuelView }) {
  const { pathname } = useLocation();
  const opponent: LivePlayer = view.you === 'white' ? view.black : view.white;
  const them: Side = view.you === 'white' ? 'black' : 'white';
  const timed = view.game === 'race' && view.opts.format === 'timed';
  const playing = view.status === 'playing';
  const [confirmResign, setConfirmResign] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const resultOpen = view.status === 'over' && !resultDismissed;
  const verdict = duelVerdict(view);

  useEffect(() => {
    document.title = `${duelTitle(view)} · ${siteConfig.name}`;
  }, [view]);

  // Focus mode, as in Play: no header and navigation while the duel is on.
  const playFocus = useSettings((s) => s.playFocus);
  const updateSettings = useSettings((s) => s.update);
  const setFocus = useFocus((s) => s.set);
  const focusOn = playFocus && playing;
  useEffect(() => {
    setFocus(focusOn);
    return () => setFocus(false);
  }, [focusOn, setFocus]);

  // The waiting room's news of this duel is old news once it shows.
  useEffect(() => {
    const lobby = useLobby.getState();
    if (lobby.pairing?.path === pathname) lobby.clearPairing();
  }, [pathname]);

  // Sounds for what happens from here on: the end, a rematch to go to. The first word from the
  // duel (a snapshot of what happened before) is not news.
  const previous = useRef(view);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (before === view || before.connection === 'connecting') return;
    if (before.status !== 'over' && view.status === 'over') {
      playSound(verdict === 'loss' ? 'gameLost' : 'gameEnd');
    }
    if (!before.next && view.next) playSound('notify');
  }, [view, verdict]);

  const overlay = <PhaseOverlay view={view} opponentName={opponent.name} />;
  const roundProps = { view, session, overlay, opponentName: opponent.name };
  const phase = view.status === 'playing' ? view.phase : null;
  const board = timed ? (
    <TimedRace
      items={raceItems(view.items)}
      phase={phase}
      progress={view.progress?.[view.you] ?? null}
      orientation={view.you}
      onReport={(report) => session.report(report)}
      overlay={overlay}
    >
      {(mine) => (
        <DuelLanes
          mine={mine}
          theirs={view.progress?.[them] ?? null}
          live={phase === 'live'}
          opponentName={opponent.name}
        />
      )}
    </TimedRace>
  ) : view.game === 'race' ? (
    <RaceRound
      key={view.round}
      puzzle={raceItems(view.items)[view.round] ?? null}
      phase={phase}
      reported={view.mine !== null}
      orientation={view.you}
      onResult={(result) => session.report({ round: view.round, ...result })}
      overlay={overlay}
      status={(solving, solver) => (
        <DuelRaceStatus
          view={view}
          solving={solving}
          solver={solver}
          opponentName={opponent.name}
        />
      )}
    />
  ) : view.game === 'arbiter' ? (
    <ArbiterDuelRound key={view.round} {...roundProps} />
  ) : (
    <JudgeDuelRound key={view.round} {...roundProps} />
  );
  const endActions = <DuelEndActions view={view} session={session} them={them} />;
  // On a phone the panel is under the board: the score and the clock come above it too.
  const stacked = useStackedLayout();
  const clock =
    playing && view.phase === 'live' && view.phaseEnds !== null ? (
      <PhaseClock ends={view.phaseEnds} label={timed ? 'Time left' : 'Round time'} />
    ) : null;
  const options = describeOptions(view.game, view.opts);

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow">
          <Link to="/play">Play</Link> / {gameName(view.game)}
        </p>
        <h1>{gameName(view.game)}</h1>
        <p className="duel__subtitle">
          {options ? `${options} · ` : ''}
          {duelGoal(view)}
        </p>
      </div>

      <div className="trainer">
        <div className="play__boardcol">
          {stacked ? (
            <div className="duel__strip">
              <ScoreLine view={view} opponent={opponent} />
              {clock}
            </div>
          ) : null}
          {board}
          {view.phase === 'reveal' && !timed ? (
            <RoundResult view={view} opponentName={opponent.name} />
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            {stacked ? null : <Scoreboard view={view} opponent={opponent} />}
            <p className="live-game__status duel__state" role="status" data-testid="duel-status">
              {statusLine(view, opponent.name)}
            </p>
            {stacked ? null : clock}
            <div className="play__actions">
              {view.status === 'setup' ? (
                <Button
                  variant="danger"
                  onClick={() => session.abort()}
                  disabled={view.connection === 'closed'}
                >
                  Abort
                </Button>
              ) : playing ? (
                <Button
                  variant="danger"
                  onClick={() => setConfirmResign(true)}
                  disabled={view.connection === 'closed'}
                >
                  Resign
                </Button>
              ) : (
                endActions
              )}
              <Button
                onClick={() => updateSettings({ playFocus: !playFocus })}
                aria-pressed={playFocus}
                title="Hide the header and navigation while a duel is on"
              >
                Focus
              </Button>
            </div>
            {view.error ? (
              <p className="small live-game__error" role="alert">
                {view.error}
              </p>
            ) : null}
          </Card>

          {!timed && view.rounds.length > 0 ? (
            <Card as="section" aria-labelledby="duel-rounds-title">
              <h2 id="duel-rounds-title" className="live-game__subtitle">
                Rounds
              </h2>
              <ol className="duel__rounds" data-testid="duel-rounds">
                {view.rounds.map((r) => (
                  <li key={r.round} className="duel__round">
                    <span className="duel__round-name">{roundLabel(view, r.round)}</span>
                    <span className="duel__round-winner">
                      {roundWinnerWords(r.winner, view.you, opponent.name)}
                    </span>
                    <span className="small muted duel__round-detail">
                      You: {roundWords(view, r, view.you)} · {opponent.name}:{' '}
                      {roundWords(view, r, them)}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          <PhraseCard
            chat={view.chat}
            you={view.you}
            opponentName={opponent.name}
            onSay={(phrase) => session.say(phrase)}
            disabled={view.connection === 'closed'}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmResign && playing}
        title="Resign this duel?"
        cancelLabel="Keep playing"
        confirmLabel="Resign"
        danger
        onConfirm={() => session.resign()}
        onClose={() => setConfirmResign(false)}
      >
        <p className="muted">{opponent.name} wins the duel.</p>
      </ConfirmDialog>

      <Dialog
        open={resultOpen}
        onClose={() => setResultDismissed(true)}
        title={duelEndTitle(verdict)}
        stackActions
        actions={(close) => (
          <>
            <Button variant="ghost" onClick={close}>
              Show the board
            </Button>
            {endActions}
          </>
        )}
      >
        <p data-testid="duel-end-sentence">{duelEndSentence(view, opponent.name)}</p>
        {view.offers.rematch === them && !view.next ? (
          <p className="muted">{opponent.name} wants a rematch.</p>
        ) : null}
      </Dialog>
    </div>
  );
}

function statusLine(view: DuelView, opponentName: string): string {
  if (view.connection === 'reconnecting') return 'Reconnecting…';
  if (view.connection === 'connecting') return 'Connecting…';
  if (view.connection === 'closed' && view.status !== 'over') {
    return 'The connection to this duel has closed.';
  }
  if (view.status === 'over') return duelEndSummary(view, opponentName);
  if (view.status === 'setup') {
    if (!view.items) {
      return view.host ? 'Dealing the rounds…' : `${opponentName} is dealing the rounds…`;
    }
    return view.opponentPresent ? 'Starting…' : `Waiting for ${opponentName}…`;
  }
  if (view.game === 'race' && view.opts.format === 'timed') {
    return view.phase === 'countdown' ? 'The race is about to start.' : 'The race is on.';
  }
  const round = roundLabel(view, view.round);
  if (view.phase === 'countdown') return `${round} is about to start.`;
  if (view.phase === 'reveal') return `${round} is over.`;
  return `${round} is on.`;
}

/**
 * What covers the board between rounds: the wait before the duel starts, and
 * the countdown before each round.
 */
function PhaseOverlay({ view, opponentName }: { view: DuelView; opponentName: string }) {
  const counting = view.status === 'playing' && view.phase === 'countdown';
  const setup = view.status === 'setup';
  useTicker(setup && view.setupDeadline !== null);
  if (counting && view.phaseEnds !== null) {
    const timed = view.game === 'race' && view.opts.format === 'timed';
    return (
      <CountdownOverlay
        ends={view.phaseEnds}
        label={timed ? 'The race starts in' : roundLabel(view, view.round)}
      />
    );
  }
  if (!setup) return null;
  const preparing = view.host && !view.items;
  return (
    <div className="trainer__overlay" data-testid="duel-setup">
      <Card className="arcade__summary">
        <h2>{preparing ? 'Dealing the rounds' : `Waiting for ${opponentName}`}</h2>
        <p className="muted">
          {preparing
            ? 'Your device is choosing the rounds you will both play.'
            : !view.items
              ? `${opponentName}’s device is choosing the rounds you will both play.`
              : `The first round starts as soon as ${opponentName} is here.`}{' '}
          {duelGoal(view)}.
        </p>
        {view.setupDeadline !== null ? (
          <p className="small muted">
            Called off if it has not started in{' '}
            <span role="timer">{formatCountdown(view.setupDeadline - monotonicNow())}</span>.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

/** The round just played: who took it, and how. */
function RoundResult({ view, opponentName }: { view: DuelView; opponentName: string }) {
  const record = view.rounds.find((r) => r.round === view.round);
  if (!record) return null;
  const them: Side = view.you === 'white' ? 'black' : 'white';
  const winner = record.winner;
  const title =
    winner === null
      ? 'Nobody took the round'
      : winner === 'shared'
        ? 'A shared round'
        : winner === view.you
          ? 'Your round'
          : `${opponentName}’s round`;
  return (
    <Card className="duel__result" data-testid="duel-round-result">
      <h2 className="duel__result-title">{title}</h2>
      {/* A judgement's verdict and points show under the board already. */}
      {view.game === 'judge' ? null : (
        <p className="small">
          You: {roundWords(view, record, view.you)}. {opponentName}:{' '}
          {roundWords(view, record, them)}.
        </p>
      )}
    </Card>
  );
}

/** What to do once the duel is over: in the result dialog, and in the panel after it. */
function DuelEndActions({
  view,
  session,
  them,
}: {
  view: DuelView;
  session: DuelSession;
  them: Side;
}) {
  const navigate = useNavigate();
  const next = view.next;
  const rematch = next ? (
    <Button variant="primary" onClick={() => void navigate(next.path)}>
      Play the rematch
    </Button>
  ) : view.offers.rematch === view.you ? (
    <Button variant="primary" disabled>
      Rematch offered
    </Button>
  ) : view.offers.rematch === them ? (
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
  return (
    <>
      <LinkButton to="/play">New opponent</LinkButton>
      {rematch}
    </>
  );
}

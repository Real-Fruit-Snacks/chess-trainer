import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { Link, useParams } from 'react-router';
import { useFocus } from '@/app/focus';
import {
  Badge,
  Button,
  Card,
  Field,
  Icon,
  LinkButton,
  Segmented,
  Select,
  Spinner,
} from '@/components/ui';
import { playSound } from '@/lib/sound';
import { useStackedLayout } from '@/lib/useStackedLayout';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { RACE_LEVELS, RACE_ROOM } from '../../../relay/src/live/shared.mjs';
import { CountdownOverlay, PhaseClock } from './duel/PhaseClock';
import { RaceRound } from './duel/RaceRound';
import { Strikes, TimedRace } from './duel/TimedRace';
import { seconds } from './duelView';
import { PhraseCard } from './PhraseCard';
import { useLivePrefs } from './prefs';
import { racing } from './raceRoom';
import {
  anyScore,
  describeRaceRoom,
  othersLine,
  pointsText,
  raceVerdict,
  RACE_ROOM_FORMAT_HINTS,
  RACE_ROOM_FORMAT_NAMES,
  raceRoomGoal,
  raceStandings,
  roundText,
  type Standing,
  standingPlace,
  standingScore,
  timedText,
} from './raceRoomView';
import { getRaceRoom } from './roomSessions';
import { raceRoomLink } from './rooms';
import { onPhone, shareLink } from './share';
import type { RaceRoomFormat, RaceRoomRace, RaceRoomSession, RaceRoomView } from './types';
import '@/features/play/play.css';
import './live.css';
import './duel/duel.css';
import './race-room.css';

/**
 * A puzzle race room: up to eight people who came by its link, racing the
 * same puzzles. Before a race, the members, the options and the host's Start;
 * during one, the puzzle board beside the live standings (or, for whoever
 * joined since, the standings to watch); afterwards the places and the host's
 * Race again. The connection belongs to roomSessions.ts and outlives the page:
 * the bar under the header leads back.
 */
export default function RaceRoomPage() {
  const { roomId = '' } = useParams();
  // Another room is another page: it starts afresh.
  return <Room key={roomId} id={roomId} />;
}

function Room({ id }: { id: string }) {
  const session = useMemo(() => getRaceRoom(id), [id]);
  if (!session) {
    return <RoomAbsent title="No such room">That link does not lead to a race room.</RoomAbsent>;
  }
  return <RoomSessionView session={session} />;
}

function RoomAbsent({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `Puzzle race room · ${siteConfig.name}`;
  }, []);
  return (
    <div className="narrow">
      <Card data-testid="race-room-absent">
        <h1 className="live-game__absent-title">{title}</h1>
        <p>{children}</p>
        <div className="row">
          <LinkButton variant="primary" to="/play">
            Back to Play
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}

function RoomSessionView({ session }: { session: RaceRoomSession }) {
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getView = useCallback(() => session.getView(), [session]);
  const view = useSyncExternalStore(subscribe, getView);
  if (view.missing) {
    return (
      <RoomAbsent title="Room not found">
        This race room has closed: a room goes a while after everyone has left it. Make another from
        Play.
      </RoomAbsent>
    );
  }
  return <RoomScreen session={session} view={view} />;
}

/** A member's name, or a racer's who has left the room since. */
function nameOf(view: RaceRoomView, id: string): string {
  return (
    view.members.find((m) => m.id === id)?.name ??
    view.state?.race?.racers.find((r) => r.id === id)?.name ??
    'Someone'
  );
}

function RoomScreen({ session, view }: { session: RaceRoomSession; view: RaceRoomView }) {
  const state = view.state;
  const race = state?.race ?? null;
  const playing = race?.status === 'playing';
  const iRace = racing(view);
  const shown = race && playing ? race : (state?.opts ?? null);

  useEffect(() => {
    document.title = `Puzzle race room · ${siteConfig.name}`;
  }, []);

  // Focus mode, as in Play: no header and navigation while this device races.
  const playFocus = useSettings((s) => s.playFocus);
  const setFocus = useFocus((s) => s.set);
  const focusOn = playFocus && iRace;
  useEffect(() => {
    setFocus(focusOn);
    return () => setFocus(false);
  }, [focusOn, setFocus]);

  // Sounds for what happens from here on: a race starting, a race over. The first word from the
  // room (a snapshot of what happened before) is not news.
  const previous = useRef(view);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (before === view || before.connection === 'connecting') return;
    const was = before.state?.race;
    const now = view.state?.race;
    if (!now) return;
    if (now.number !== was?.number && now.status === 'playing') playSound('notify');
    else if (was?.status === 'playing' && now.status === 'over') playSound('gameEnd');
  }, [view]);

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow">
          <Link to="/play">Play</Link> / Puzzle race room
        </p>
        <h1>Puzzle race room</h1>
        <p className="duel__subtitle" data-testid="race-room-options">
          {shown ? `${describeRaceRoom(shown)} · ${raceRoomGoal(shown.format)}` : 'Connecting…'}
        </p>
      </div>
      {view.connection !== 'open' ? <ConnectionLine view={view} /> : null}
      {iRace && race ? (
        <RaceScreen session={session} view={view} race={race} />
      ) : (
        <LobbyScreen session={session} view={view} />
      )}
    </div>
  );
}

function ConnectionLine({ view }: { view: RaceRoomView }) {
  if (view.connection === 'closed') {
    return (
      <p className="small muted race-room__connection" role="status">
        The connection to this room has closed.
      </p>
    );
  }
  return (
    <div className="race-room__connection">
      <Spinner
        label={view.connection === 'connecting' ? 'Connecting to the room…' : 'Reconnecting…'}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Racing                                                             */
/* ------------------------------------------------------------------ */

/** "Round 2 of 5". */
const roundName = (race: RaceRoomRace) =>
  `Round ${race.round + 1} of ${race.items.length || RACE_ROOM.rounds}`;

/** How the race stands, in a line. */
function raceLine(race: RaceRoomRace): string {
  if (race.status === 'over') return 'The race is over.';
  if (race.format === 'timed') {
    return race.phase === 'countdown' ? 'The race is about to start.' : 'The race is on.';
  }
  if (race.phase === 'countdown') return `${roundName(race)} is about to start.`;
  if (race.phase === 'reveal') return `${roundName(race)} is over.`;
  return `${roundName(race)} is on.`;
}

function RaceScreen({
  session,
  view,
  race,
}: {
  session: RaceRoomSession;
  view: RaceRoomView;
  race: RaceRoomRace;
}) {
  const me = view.you ?? '';
  const timed = race.format === 'timed';
  const stacked = useStackedLayout();
  const standings = raceStandings(race, view.members);
  const mine = standings.find((s) => s.id === me) ?? null;
  const overlay =
    race.phase === 'countdown' && race.phaseEnds !== null ? (
      <CountdownOverlay
        ends={race.phaseEnds}
        label={timed ? 'The race starts in' : roundName(race)}
      />
    ) : null;
  const clock =
    race.phase === 'live' && race.phaseEnds !== null ? (
      <PhaseClock ends={race.phaseEnds} label={timed ? 'Time left' : 'Round time'} />
    ) : null;

  const board = timed ? (
    <TimedRace
      key={race.number}
      items={race.items}
      phase={race.phase}
      progress={race.progress?.[me] ?? null}
      orientation="white"
      onReport={(report) => session.report(report)}
      overlay={overlay}
    >
      {(own) =>
        race.phase === 'live' ? (
          <p className="small duel__status-mine race-room__under" role="status">
            {own.finished
              ? `You are through: ${own.solved} solved.`
              : own.solving
                ? `Puzzle ${own.index + 1}: your move.`
                : `Puzzle ${own.index + 1}`}
          </p>
        ) : null
      }
    </TimedRace>
  ) : (
    <RaceRound
      key={`${race.number}:${race.round}`}
      puzzle={race.items[race.round] ?? null}
      phase={race.phase}
      reported={race.results[me] !== undefined}
      orientation="white"
      onResult={(result) => session.report({ round: race.round, ...result })}
      overlay={overlay}
      status={(solving, solver) => (
        <RoundStatus race={race} standings={standings} me={me} solving={solving} solver={solver} />
      )}
    />
  );

  return (
    <div className="trainer">
      <div className="play__boardcol">
        {stacked ? (
          <div className="duel__strip">
            <p className="duel__line" data-testid="race-room-strip">
              {mine ? (
                <>
                  <b className="duel__line-points">
                    {standingPlace(mine, anyScore(race.format, standings))}
                  </b>{' '}
                  <span className="duel__line-name">{standingScore(race.format, mine)}</span>
                </>
              ) : null}
            </p>
            {clock}
          </div>
        ) : null}
        {board}
        {race.phase === 'reveal' && mine ? (
          <Card className="duel__result" data-testid="race-room-round-result">
            <h2 className="duel__result-title">
              {mine.gained ? `You scored ${pointsText(mine.gained)}` : 'No points this round'}
            </h2>
            <p className="small">
              {mine.result ? roundText(mine, false) : 'You did not answer'}. The next round is
              coming.
            </p>
          </Card>
        ) : null}
      </div>

      <aside className="trainer__panel stack">
        <Card as="section" aria-labelledby="race-room-standings-title">
          <h2 id="race-room-standings-title" className="live-game__subtitle">
            Standings
          </h2>
          <p className="live-game__status duel__state" role="status" data-testid="race-room-status">
            {raceLine(race)}
          </p>
          {stacked ? null : clock}
          <StandingsList race={race} standings={standings} me={me} />
          {view.error ? (
            <p className="small live-game__error" role="alert">
              {view.error}
            </p>
          ) : null}
        </Card>
        <PhraseCard
          chat={view.chat}
          you={me}
          nameOf={(id) => nameOf(view, id)}
          onSay={(phrase) => session.say(phrase)}
          disabled={view.connection !== 'open'}
        />
      </aside>
    </div>
  );
}

/** Under the board in a round: this player's round, and how the others are doing. */
function RoundStatus({
  race,
  standings,
  me,
  solving,
  solver,
}: {
  race: RaceRoomRace;
  standings: readonly Standing[];
  me: string;
  solving: boolean;
  solver: 'white' | 'black';
}) {
  const mine = race.results[me];
  const text = mine
    ? mine.ok
      ? `Solved in ${seconds(mine.ms)}.`
      : 'Missed: you are out of this round.'
    : solving
      ? `${solver === 'white' ? 'White' : 'Black'} to play: find the best line.`
      : 'Here it comes…';
  const others = standings.filter((s) => s.id !== me);
  return (
    <div className="duel__status" data-testid="race-status">
      <p className="duel__status-mine" role="status">
        {text}
      </p>
      <p className="small muted duel__status-theirs" aria-live="polite">
        {othersLine(others)}
      </p>
    </div>
  );
}

/** The standings, best first: points (rounds) or puzzles solved (timed), and the round on. */
function StandingsList({
  race,
  standings,
  me,
}: {
  race: RaceRoomRace;
  standings: readonly Standing[];
  me: string | null;
}) {
  const timed = race.format === 'timed';
  const live = race.phase === 'live';
  const scored = anyScore(race.format, standings);
  return (
    <ol className="race-room__standings" data-testid="race-standings">
      {standings.map((s) => (
        <li
          key={s.id}
          className={`race-room__standing${s.id === me ? ' race-room__standing--you' : ''}`}
        >
          <span className="race-room__place">{standingPlace(s, scored)}</span>
          <span className="race-room__who">
            <span className="race-room__name">
              {s.name}
              {s.id === me ? ' (you)' : ''}
            </span>
            <span className="small muted race-room__detail">
              {timed ? (
                <>
                  <Strikes used={s.progress.strikes} label={`${s.name}’s strikes`} />{' '}
                  {timedText(s, race.items.length)}
                </>
              ) : race.status === 'playing' ? (
                <>
                  {roundText(s, live)}
                  {s.gained ? ` · +${s.gained}` : ''}
                </>
              ) : null}
            </span>
          </span>
          <span className="race-room__score">{standingScore(race.format, s)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Before, between and after the races                                */
/* ------------------------------------------------------------------ */

function LobbyScreen({ session, view }: { session: RaceRoomSession; view: RaceRoomView }) {
  const race = view.state?.race ?? null;
  return (
    <div className="race-room">
      <div className="race-room__main stack">
        {race?.status === 'playing' ? <WatchCard view={view} race={race} /> : null}
        {race?.status === 'over' ? <ResultsCard view={view} race={race} /> : null}
        <MembersCard session={session} view={view} />
      </div>
      <aside className="race-room__side stack">
        <OptionsCard session={session} view={view} />
        <LinkCard view={view} />
        {view.you ? (
          <PhraseCard
            chat={view.chat}
            you={view.you}
            nameOf={(id) => nameOf(view, id)}
            onSay={(phrase) => session.say(phrase)}
            disabled={view.connection !== 'open'}
          />
        ) : null}
      </aside>
    </div>
  );
}

/** A race on that this device does not race in: its standings, to watch. */
function WatchCard({ view, race }: { view: RaceRoomView; race: RaceRoomRace }) {
  const standings = raceStandings(race, view.members);
  const clock =
    race.phase === 'live' && race.phaseEnds !== null ? (
      <PhaseClock
        ends={race.phaseEnds}
        label={race.format === 'timed' ? 'Time left' : 'Round time'}
      />
    ) : null;
  return (
    <Card as="section" aria-labelledby="race-room-watch-title" data-testid="race-room-watch">
      <h2 id="race-room-watch-title" className="live__title">
        Race {race.number} is on
      </h2>
      <p className="live-game__status" role="status">
        {raceLine(race)}{' '}
        {view.you ? 'You race in the next one.' : 'Join the room to race in the next one.'}
      </p>
      {clock}
      <StandingsList race={race} standings={standings} me={view.you} />
    </Card>
  );
}

/** The last race's places, best first. */
function ResultsCard({ view, race }: { view: RaceRoomView; race: RaceRoomRace }) {
  const standings = raceStandings(race, view.members);
  const mine = standings.find((s) => s.id === view.you);
  const scored = anyScore(race.format, standings);
  return (
    <Card as="section" aria-labelledby="race-room-results-title" data-testid="race-room-places">
      <div className="hub__head">
        <span className="hub__icon">
          <Icon name="trophy" size={22} />
        </span>
        <h2 id="race-room-results-title" className="live__title">
          Race {race.number}: the places
        </h2>
      </div>
      {mine ? (
        <p className="race-room__verdict" data-testid="race-room-verdict">
          {raceVerdict(race.format, standings, mine)}
        </p>
      ) : null}
      <ol className="race-room__standings">
        {standings.map((s) => (
          <li
            key={s.id}
            className={`race-room__standing${s.id === view.you ? ' race-room__standing--you' : ''}`}
          >
            <span className="race-room__place">{standingPlace(s, scored)}</span>
            <span className="race-room__who">
              <span className="race-room__name">
                {s.name}
                {s.id === view.you ? ' (you)' : ''}
              </span>
              {race.format === 'timed' ? (
                <span className="small muted race-room__detail">
                  {s.progress.strikes === 1 ? '1 wrong' : `${s.progress.strikes} wrong`}
                </span>
              ) : null}
            </span>
            <span className="race-room__score">{standingScore(race.format, s)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Who is in the room, and what this device can do: join, start, wait, or leave. */
function MembersCard({ session, view }: { session: RaceRoomSession; view: RaceRoomView }) {
  const name = useLivePrefs((s) => s.name);
  const showRating = useLivePrefs((s) => s.showRating);
  const rating = useProgress((s) => Math.round(s.puzzleRating));
  const race = view.state?.race ?? null;
  const here = view.members.filter((m) => m.here).length;
  const host = view.members.find((m) => m.id === view.host) ?? null;
  const isHost = view.you !== null && view.you === view.host;
  const full = view.members.length >= view.max;
  const open = view.connection === 'open';
  const playing = race?.status === 'playing';
  const again = (view.state?.count ?? 0) > 0;

  return (
    <Card as="section" aria-labelledby="race-room-members-title" data-testid="race-room-members">
      <div className="live__head">
        <h2 id="race-room-members-title" className="live__title">
          Players
        </h2>
        <p className="small muted live__aside">
          {view.members.length} of {view.max}
        </p>
      </div>
      <ul className="race-room__members" role="list">
        {view.members.map((m) => (
          <li key={m.id} className="race-room__member">
            <span className="race-room__name">
              {m.name}
              {m.rating !== null ? <span className="live-game__rating"> {m.rating}</span> : null}
            </span>
            {m.id === view.host ? <Badge tone="accent">Host</Badge> : null}
            {m.id === view.you ? <Badge>You</Badge> : null}
            <span className={`race-room__presence${m.here ? ' race-room__presence--here' : ''}`}>
              <span className="race-room__dot" aria-hidden="true" />
              {m.here ? 'Here' : 'Away'}
            </span>
          </li>
        ))}
      </ul>

      <div className="race-room__actions">
        {view.you === null ? (
          <>
            <p className="small race-room__lead">
              {full ? (
                'This room is full.'
              ) : (
                <>
                  Join under your name, <b>{name}</b>
                  {showRating ? ` (${rating})` : ''}.
                </>
              )}
            </p>
            <Button
              variant="primary"
              onClick={() => session.join()}
              disabled={!open || full || view.joining}
              data-testid="race-room-join"
            >
              {view.joining ? 'Joining…' : 'Join the room'}
            </Button>
          </>
        ) : isHost ? (
          playing ? (
            <p className="small muted race-room__lead">
              A race is on. You can start another once it is over.
            </p>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={() => session.start()}
                disabled={!open || here < RACE_ROOM.minRacers || view.dealing}
                data-testid="race-room-start"
              >
                {view.dealing
                  ? 'Dealing the puzzles…'
                  : again
                    ? 'Race again'
                    : `Start with ${here} ${here === 1 ? 'player' : 'players'}`}
              </Button>
              <p className="small muted race-room__lead" role="status">
                {here < RACE_ROOM.minRacers
                  ? 'A race takes at least two players here: send the link.'
                  : again
                    ? `${here} players here race. New puzzles for each race.`
                    : 'Everyone here races. Whoever comes later races in the next one.'}
              </p>
            </>
          )
        ) : (
          <p className="small muted race-room__lead" role="status">
            {playing
              ? 'A race is on: you race in the next one.'
              : `Waiting for ${host?.name ?? 'the host'} to start ${again ? 'another race' : 'the race'}.`}
          </p>
        )}
        {view.you !== null ? (
          <Button variant="ghost" size="sm" onClick={() => session.leave()} disabled={!open}>
            Leave the room
          </Button>
        ) : null}
      </div>
      {view.error ? (
        <p className="small live-game__error" role="alert">
          {view.error}
        </p>
      ) : null}
    </Card>
  );
}

const FORMAT_OPTIONS = RACE_ROOM.formats.map((format) => ({
  value: format,
  label: RACE_ROOM_FORMAT_NAMES[format],
}));

/** The next race's options: the host chooses them, everyone sees them. */
function OptionsCard({ session, view }: { session: RaceRoomSession; view: RaceRoomView }) {
  const opts = view.state?.opts ?? null;
  const isHost = view.you !== null && view.you === view.host;
  const editable = isHost && view.state?.race?.status !== 'playing' && view.connection === 'open';
  if (!opts) return null;
  return (
    <Card as="section" aria-labelledby="race-room-options-title">
      <h2 id="race-room-options-title" className="live__title">
        {view.state?.race ? 'The next race' : 'The race'}
      </h2>
      {editable ? (
        <div className="stack-sm">
          <div className="live__row">
            <span className="live__label">Format</span>
            <Segmented<RaceRoomFormat>
              ariaLabel="Format"
              value={opts.format}
              onChange={(format) => session.setOptions({ ...opts, format })}
              options={FORMAT_OPTIONS}
            />
          </div>
          <Field label="Puzzle rating">
            {(id) => (
              <Select
                id={id}
                value={opts.level}
                onChange={(e) => session.setOptions({ ...opts, level: Number(e.target.value) })}
              >
                {RACE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      ) : (
        <p className="race-room__chosen">{describeRaceRoom(opts)}</p>
      )}
      <p className="small muted live__aside">{RACE_ROOM_FORMAT_HINTS[opts.format]}</p>
    </Card>
  );
}

/** The room's link, to send to the others. */
function LinkCard({ view }: { view: RaceRoomView }) {
  const link = raceRoomLink(view.id);
  const places = view.max - view.members.length;
  const phone = onPhone();
  return (
    <Card as="section" aria-labelledby="race-room-link-title">
      <h2 id="race-room-link-title" className="live__title">
        Invite
      </h2>
      <p className="small">
        {places > 0
          ? `Send this link: up to ${places} more can join, in the app.`
          : 'The room is full.'}
      </p>
      <p className="race-room__link" data-testid="race-room-link">
        {link}
      </p>
      <Button
        onClick={() => void shareLink(link, 'A puzzle race room', 'Link copied.')}
        data-testid="race-room-share"
      >
        <Icon name="link" size={18} />
        <span>{phone ? 'Share link' : 'Copy link'}</span>
      </Button>
    </Card>
  );
}

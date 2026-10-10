import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  LinkButton,
  Segmented,
  Spinner,
  Switch,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { useTicker } from '@/lib/useTicker';
import { siteConfig } from '@/site.config';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import {
  ID_PATTERN,
  MAX_INCREMENT_SECONDS,
  MAX_MINUTES,
  parseTimeControl,
  QUICK_TIME_CONTROLS,
} from '../../../relay/src/live/shared.mjs';
import { lichessSeekAllowed, reconnectLichessForLive } from './lichessLive';
import {
  describeTimeControl,
  formatElapsed,
  joinLink,
  lichessStatus,
  myColorText,
  othersHere,
  type PlaceStatus,
  posterColorText,
  relayStatus,
  speedName,
} from './liveView';
import { useLobby } from './lobby';
import { useLivePrefs } from './prefs';
import type { ColorChoice, LobbyConnection, MySeek } from './types';
import './live.css';

/** After this long with nobody, the waiting room suggests a game against the computer meanwhile. */
const NUDGE_MS = 3 * 60_000;

const COLOR_OPTIONS: { value: ColorChoice; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
];

/**
 * The waiting room: post a game at a tap, or join one of the games others
 * posted. A posted game stays up while the player uses the rest of the app; the
 * bar under the header says so, and leads to the board once someone joins.
 */
export default function LivePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const connection = useLobby((s) => s.connection);
  const mine = useLobby((s) => s.mine);
  const pairing = useLobby((s) => s.pairing);
  const notice = useLobby((s) => s.notice);

  useEffect(() => {
    document.title = `Play online · ${siteConfig.name}`;
  }, []);

  // The waiting room stays connected while this page shows (and while a game is posted).
  useEffect(() => useLobby.getState().watch(), []);

  // A shared link (?join=<id>): join its game once, and leave the address bar clean so a reload
  // does not join again.
  const joinedRef = useRef(false);
  useEffect(() => {
    if (!searchParams.has('join')) return;
    const id = searchParams.get('join') ?? '';
    setSearchParams({}, { replace: true });
    if (joinedRef.current) return;
    joinedRef.current = true;
    if (ID_PATTERN.test(id)) useLobby.getState().join(id);
    else toast('That link does not lead to a game.', { tone: 'warning' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // Paired while this page shows: straight to the board (elsewhere the bar offers the way).
  useEffect(() => {
    if (!pairing) return;
    void navigate(pairing.path);
    useLobby.getState().clearPairing();
  }, [pairing, navigate]);

  return (
    <div>
      <div className="page-header page-header--lean">
        <h1>Play online</h1>
        <p>
          Play a person in real time. Post a game and carry on with anything else in the app — you
          will hear when someone joins — or join one of the games below. Casual games, and no engine
          help.
        </p>
      </div>

      <div className="stack">
        <ConnectionStatus connection={connection} />
        {notice ? (
          <Alert tone="warning">
            <div className="live__notice" data-testid="live-notice">
              <span>{notice}</span>
              <Button size="sm" variant="ghost" onClick={() => useLobby.getState().clearNotice()}>
                Dismiss
              </Button>
            </div>
          </Alert>
        ) : null}

        <div className="live__layout">
          <div className="live__post">
            {mine ? <WaitingCard mine={mine} /> : <PostCard connection={connection} />}
          </div>
          <OpenGamesCard connection={connection} posted={!!mine} />
          <NameCard posted={!!mine} />
        </div>
      </div>
    </div>
  );
}

function ConnectionStatus({ connection }: { connection: LobbyConnection }) {
  if (connection === 'unavailable') {
    return (
      <Alert tone="warning">
        {siteConfig.syncRelay.length > 0
          ? 'Live games are not set up on this relay yet.'
          : 'This copy of the app has no relay for live games.'}
      </Alert>
    );
  }
  if (connection === 'connecting' || connection === 'retrying') {
    return (
      <div className="live__connection" data-testid="live-connection">
        <Spinner
          label={connection === 'connecting' ? 'Connecting to the waiting room…' : 'Reconnecting…'}
        />
      </div>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Posting                                                            */
/* ------------------------------------------------------------------ */

function PostCard({ connection }: { connection: LobbyConnection }) {
  const prefs = useLivePrefs();
  const account = useLichess((s) => s.account);
  const [privateGame, setPrivateGame] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  // A game only people with the link may join is never posted on Lichess, where anyone could
  // accept it.
  const lichessOn = !!account && prefs.lichess && !privateGame;

  const post = (tc: string) => {
    prefs.update({ tc });
    useLobby.getState().post({
      tc,
      color: prefs.color,
      private: privateGame,
      lichess: lichessOn ? { rated: prefs.lichessRated } : null,
    });
  };

  /** Without the relay a time control can still go to Lichess, if Lichess takes it. */
  const nowhereToPost = (tc: string) => {
    if (connection !== 'unavailable') return false;
    const spec = parseTimeControl(tc);
    return !(lichessOn && spec && lichessSeekAllowed(spec));
  };

  return (
    <Card as="section" aria-labelledby="live-post-title" data-testid="live-post">
      <h2 id="live-post-title" className="live__title">
        Post a game
      </h2>
      <div className="stack-sm">
        <div className="live__row">
          <span className="live__label">Your colour</span>
          <Segmented<ColorChoice>
            ariaLabel="Your colour"
            value={prefs.color}
            onChange={(color) => prefs.update({ color })}
            options={COLOR_OPTIONS}
          />
        </div>
        <p className="live__label" id="live-tc-label">
          Tap a time control to post your game
        </p>
        <div className="live__tcs" role="group" aria-labelledby="live-tc-label">
          {QUICK_TIME_CONTROLS.map((tc) => (
            <button
              key={tc}
              type="button"
              className="live__tc"
              onClick={() => post(tc)}
              disabled={nowhereToPost(tc)}
            >
              <span className="live__tc-time">{tc}</span>{' '}
              <span className="live__tc-speed">{speedName(tc)}</span>
            </button>
          ))}
          <button
            type="button"
            className="live__tc live__tc--custom"
            onClick={() => setCustomOpen(true)}
          >
            <span className="live__tc-time">Custom</span>{' '}
            <span className="live__tc-speed">Set your own</span>
          </button>
        </div>
        <Switch
          checked={privateGame}
          onChange={setPrivateGame}
          label="Only people with the link"
          description="Your game stays out of the list. Share its link once it is posted."
        />
        {account ? (
          <>
            <Switch
              checked={prefs.lichess && !privateGame}
              onChange={(lichess) => prefs.update({ lichess })}
              disabled={privateGame}
              label="Also look on Lichess"
              description={
                privateGame
                  ? 'Not for a game only people with the link may join.'
                  : 'Your game is posted on Lichess too; whoever accepts first plays you. Rapid and slower games only.'
              }
            />
            {lichessOn ? (
              <Switch
                checked={prefs.lichessRated}
                onChange={(lichessRated) => prefs.update({ lichessRated })}
                label="Rated on Lichess"
                description="A game played on Lichess counts towards your rating there."
              />
            ) : null}
          </>
        ) : (
          <p className="small muted live__aside">
            <Link to="/settings#lichess">Sign in to Lichess in Settings</Link> to look for opponents
            there too.
          </p>
        )}
      </div>
      <CustomDialog
        open={customOpen}
        initial={prefs.tc}
        onClose={() => setCustomOpen(false)}
        onPost={post}
      />
    </Card>
  );
}

/** Whole minutes and seconds, as typed: digits only, so "1e2" or "-1" never pass. */
function customTimeControl(minutes: string, seconds: string): string | null {
  if (!/^\d{1,3}$/.test(minutes.trim()) || !/^\d{1,3}$/.test(seconds.trim())) return null;
  return parseTimeControl(`${Number(minutes)}+${Number(seconds)}`)?.id ?? null;
}

function CustomDialog({
  open,
  initial,
  onClose,
  onPost,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onPost: (tc: string) => void;
}) {
  const [minutes, setMinutes] = useState(() => {
    const spec = parseTimeControl(initial);
    return String(spec ? spec.initialMs / 60_000 : 10);
  });
  const [seconds, setSeconds] = useState(() => {
    const spec = parseTimeControl(initial);
    return String(spec ? spec.incrementMs / 1000 : 5);
  });
  const tc = customTimeControl(minutes, seconds);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Custom time control"
      actions={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!tc}
            onClick={() => {
              if (!tc) return;
              onPost(tc);
              close();
            }}
          >
            Post
          </Button>
        </>
      )}
    >
      <div className="stack-sm">
        <Field label="Minutes per side" hint={`1 to ${MAX_MINUTES}.`}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MINUTES}
              step={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          )}
        </Field>
        <Field label="Seconds added per move" hint={`0 to ${MAX_INCREMENT_SECONDS}.`}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_INCREMENT_SECONDS}
              step={1}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          )}
        </Field>
        <p className="small muted" role="status" data-testid="live-custom-preview">
          {tc
            ? describeTimeControl(tc)
            : `Whole minutes from 1 to ${MAX_MINUTES}, and seconds from 0 to ${MAX_INCREMENT_SECONDS}.`}
        </p>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Waiting                                                            */
/* ------------------------------------------------------------------ */

/** Shares the join link where the device can (a phone's share sheet), copies it otherwise. */
async function shareGame(mine: MySeek): Promise<void> {
  const url = joinLink(mine.id);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `A ${mine.tc} game of chess`, url });
      return;
    } catch (err) {
      // Closing the share sheet is a choice, not a failure; anything else falls back to copying.
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied.', { tone: 'success' });
  } catch {
    toast('Could not copy the link.', { tone: 'warning' });
  }
}

function PlaceLine({ place }: { place: PlaceStatus }) {
  return (
    <li className={`live__place live__place--${place.tone}`}>
      {place.tone === 'busy' ? (
        <span className="spinner live__place-mark" aria-hidden="true" />
      ) : (
        <Icon
          name={place.tone === 'done' ? 'check' : 'warning'}
          size={18}
          className="live__place-mark"
        />
      )}
      <span>{place.text}</span>
    </li>
  );
}

function WaitingCard({ mine }: { mine: MySeek }) {
  const now = useTicker(true);
  const waited = Math.max(0, now - mine.postedAt);
  const lichess = lichessStatus(mine.lichess);

  const allowLichess = () => {
    reconnectLichessForLive('/play/online').catch(() => {
      toast('Could not reach Lichess. Try again in a moment.', { tone: 'warning' });
    });
  };

  return (
    <Card as="section" aria-labelledby="live-wait-title" data-testid="live-waiting">
      <div className="row row--between">
        <h2 id="live-wait-title" className="live__title">
          Waiting for an opponent
        </h2>
        <span className="live__elapsed" role="timer" data-testid="live-elapsed">
          {formatElapsed(waited)}
        </span>
      </div>
      <p className="live__summary">
        {describeTimeControl(mine.tc)} · {myColorText(mine.color)}
        {mine.private ? ' · Only people with the link' : ''}
      </p>
      <ul className="live__places" role="list" aria-live="polite">
        <PlaceLine place={relayStatus(mine.relay)} />
        {lichess ? <PlaceLine place={lichess} /> : null}
      </ul>
      {mine.lichess.status === 'needs-permission' ? (
        <Button size="sm" onClick={allowLichess} className="live__allow">
          Allow live games on Lichess
        </Button>
      ) : null}
      <div className="row live__actions">
        <Button onClick={() => useLobby.getState().cancel()}>Cancel</Button>
        <Button variant="primary" onClick={() => void shareGame(mine)}>
          Share link
        </Button>
      </div>
      <p className="small muted live__aside">
        You can leave this page: your game stays posted while the app is open.
      </p>
      {waited >= NUDGE_MS ? (
        <div className="live__later">
          <Alert tone="info">
            <div className="live__nudge" data-testid="live-nudge">
              <span>
                Nobody yet. Play the human-like computer while you wait? Your game stays posted.
              </span>
              <LinkButton size="sm" to="/play?opponent=humanlike">
                Play the human-like computer
              </LinkButton>
            </div>
          </Alert>
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The open games and the player's name                               */
/* ------------------------------------------------------------------ */

function OpenGamesCard({ connection, posted }: { connection: LobbyConnection; posted: boolean }) {
  const seeks = useLobby((s) => s.seeks);
  const players = useLobby((s) => s.players);
  const open = connection === 'open';

  return (
    <Card as="section" aria-labelledby="live-open-title" className="live__open">
      <div className="live__head">
        <h2 id="live-open-title" className="live__title">
          Open games
        </h2>
        {open ? (
          <p className="small muted live__aside" data-testid="live-players">
            {othersHere(players)}
          </p>
        ) : null}
      </div>
      {seeks.length > 0 ? (
        <>
          {posted ? (
            <p className="small muted live__aside">Joining a game withdraws your own.</p>
          ) : null}
          <ul className="live__seeks" role="list">
            {seeks.map((seek) => (
              <li key={seek.id} className="live__seek">
                <span className="live__seek-who">
                  <span className="live__seek-name">{seek.name}</span>
                  {seek.rating !== null ? (
                    <>
                      {' '}
                      <span className="live__seek-rating">{seek.rating}</span>
                    </>
                  ) : null}
                </span>
                <span className="live__seek-what small muted">
                  {describeTimeControl(seek.tc)} · {posterColorText(seek.color)}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  className="live__seek-join"
                  disabled={!open}
                  title={posted ? 'Joining withdraws your own posted game.' : undefined}
                  aria-label={`Join ${seek.name}’s ${seek.tc} game`}
                  onClick={() => useLobby.getState().join(seek.id)}
                >
                  Join
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : open ? (
        <EmptyState icon={<Icon name="people" size={36} />} title="No open games right now">
          <p className="live__empty">
            Post one: it stays up while you use the rest of the app, and you will hear when someone
            joins.
          </p>
        </EmptyState>
      ) : (
        <p className="small muted live__aside">
          {connection === 'unavailable'
            ? 'No open games to show.'
            : 'The open games show once the waiting room is connected.'}
        </p>
      )}
    </Card>
  );
}

function NameCard({ posted }: { posted: boolean }) {
  const name = useLivePrefs((s) => s.name);
  const showRating = useLivePrefs((s) => s.showRating);
  const rating = useProgress((s) => Math.round(s.puzzleRating));

  return (
    <Card as="section" aria-labelledby="live-name-title" className="live__name">
      <h2 id="live-name-title" className="live__title">
        Your name
      </h2>
      <div className="stack-sm">
        <div className="live__row">
          <p className="live__playas" data-testid="live-name">
            You play as <b>{name}</b>
          </p>
          <Button size="sm" onClick={() => useLivePrefs.getState().rollName()} disabled={posted}>
            New name
          </Button>
        </div>
        <Switch
          checked={showRating}
          onChange={(next) => useLivePrefs.getState().update({ showRating: next })}
          disabled={posted}
          label="Show my puzzle rating"
          description={`${rating}, shown beside your name.`}
        />
        {/* The posted game carries the name and the rating it was posted with. */}
        {posted ? (
          <p className="small muted live__aside">Cancel your posted game to change these.</p>
        ) : null}
        <p className="small muted live__aside">
          Other players see this name and, if you choose, your puzzle rating. Nothing anyone types
          reaches anyone else: names are made up from two word lists, and messages are a few set
          phrases. Moves go through the app’s relay, which deletes a game shortly after it ends.
        </p>
      </div>
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Dialog, Field, Icon, Segmented, Select, Switch } from '@/components/ui';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import {
  CORRESPONDENCE_DAYS,
  CORRESPONDENCE_GAMES,
  isDuel,
  parseTimeControl,
  QUICK_TIME_CONTROLS,
} from '../../../relay/src/live/shared.mjs';
import { lichessSeekAllowed } from './lichessLive';
import { describeTimeControl } from './liveView';
import { useLobby } from './lobby';
import {
  ARBITER_PACE_NAMES,
  ARBITER_PACES,
  ARMY_BUDGETS,
  gameName,
  ONLINE_GAMES,
  onlineGame,
  RACE_FORMAT_HINTS,
  RACE_FORMAT_NAMES,
  RACE_FORMATS,
  RACE_LEVELS,
} from './onlineGames';
import { useLivePrefs } from './prefs';
import { RACE_ROOM_FORMAT_HINTS, RACE_ROOM_FORMAT_NAMES } from './raceRoomView';
import { makeGroupRoom, raceRoomPath } from './rooms';
import type {
  ArbiterPace,
  ColorChoice,
  GameKind,
  GameOptions,
  RaceFormat,
  RaceRoomFormat,
} from './types';
import './live.css';

/** A puzzle race against one opponent (posted), or a room for up to eight (a link to send). */
type RaceWho = 'one' | 'room';
const RACE_WHO: { value: RaceWho; label: string }[] = [
  { value: 'one', label: 'One opponent' },
  { value: 'room', label: 'A room for up to eight' },
];
const ROOM_FORMATS = Object.keys(RACE_ROOM_FORMAT_NAMES) as RaceRoomFormat[];

const COLOR_OPTIONS: { value: ColorChoice; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
];

/** The race level nearest the player's puzzle rating. */
function levelNear(rating: number): number {
  return RACE_LEVELS.reduce((best, level) =>
    Math.abs(level - rating) < Math.abs(best - rating) ? level : best,
  );
}

/** The correspondence time controls ("3d"), offered when inviting a friend to chess or Chess960. */
const CORRESPONDENCE_TCS = CORRESPONDENCE_DAYS.map((days) => `${days}d`);

/**
 * Sets up a game to post: any of the games two people can play, with its
 * options. Posted in the open, or (inviting a friend) only for people with
 * its link. Inviting starts from a game of chess and lets the player choose
 * another; a game's own Play button starts from that game. An invitation to a
 * game of chess, or of Chess960, may be a correspondence game (days a move):
 * its board opens at once, with the link to send.
 */
export function GameDialog({
  open,
  kind,
  invite,
  room = false,
  onClose,
}: {
  open: boolean;
  /** The game to set up (the invitation's first choice). */
  kind: GameKind;
  /** A private game, for a friend with the link: the game can be changed here. */
  invite: boolean;
  /** A puzzle race: start from a room for up to eight rather than one opponent. */
  room?: boolean;
  onClose: () => void;
}) {
  const prefs = useLivePrefs();
  const account = useLichess((s) => s.account);
  const puzzleRating = useProgress((s) => s.puzzleRating);
  const [game, setGame] = useState<GameKind>(kind);
  const [tc, setTc] = useState(prefs.tc);
  const [color, setColor] = useState<ColorChoice>(prefs.color);
  const [budget, setBudget] = useState<number>(30);
  const [format, setFormat] = useState<RaceFormat>('best3');
  const [level, setLevel] = useState(() => levelNear(puzzleRating));
  const [pace, setPace] = useState<ArbiterPace>('normal');
  const [privateGame, setPrivateGame] = useState(invite);
  // A puzzle race for a room: its format, and the room being made (its page is next).
  const navigate = useNavigate();
  const [raceWho, setRaceWho] = useState<RaceWho>(room ? 'room' : 'one');
  const [roomFormat, setRoomFormat] = useState<RaceRoomFormat>('rounds');
  const [making, setMaking] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const roomRace = game === 'race' && raceWho === 'room';

  // Each opening starts from the game asked for, with the latest choices.
  useEffect(() => {
    if (!open) return;
    setRaceWho(room ? 'room' : 'one');
    setRoomError(null);
    setGame(kind);
    setPrivateGame(invite);
    setTc(useLivePrefs.getState().tc);
    setColor(useLivePrefs.getState().color);
  }, [open, kind, invite, room]);

  /** Makes the race room, then goes to its page, where its link is. */
  const makeRoom = async (close: () => void) => {
    setMaking(true);
    setRoomError(null);
    try {
      const id = await makeGroupRoom('race', { format: roomFormat, level });
      close();
      void navigate(raceRoomPath(id));
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'The room could not be made.');
    } finally {
      setMaking(false);
    }
  };

  const duel = isDuel(game);
  const info = onlineGame(game);
  // Days a move: chess and Chess960, by invitation only.
  const corrOffered = invite && CORRESPONDENCE_GAMES.includes(game);
  const correspondence = corrOffered && CORRESPONDENCE_TCS.includes(tc);
  const opts: GameOptions =
    game === 'army'
      ? { budget }
      : game === 'race'
        ? { format, level }
        : game === 'arbiter'
          ? { pace }
          : {};
  // Lichess takes games of chess from apps, in the open, at rapid and slower speeds.
  const spec = parseTimeControl(tc);
  const lichessOn =
    !!account &&
    prefs.lichess &&
    game === 'chess' &&
    !privateGame &&
    !!spec &&
    lichessSeekAllowed(spec);
  const realtime = spec?.kind === 'realtime' ? spec.id : useLivePrefs.getState().tc;
  const tcs = QUICK_TIME_CONTROLS.includes(realtime)
    ? QUICK_TIME_CONTROLS
    : [...QUICK_TIME_CONTROLS, realtime];

  // A game without correspondence: back to a game at once.
  useEffect(() => {
    if (!corrOffered && parseTimeControl(tc)?.kind === 'correspondence') {
      setTc(useLivePrefs.getState().tc);
    }
  }, [corrOffered, tc]);

  const post = () => {
    if (!duel && !spec) return;
    if (correspondence) {
      useLobby.getState().invite({ game, tc, color });
      return;
    }
    useLobby.getState().post({
      game,
      opts,
      tc: duel ? null : tc,
      color: duel ? 'random' : color,
      private: privateGame,
      lichess: lichessOn ? { rated: prefs.lichessRated } : null,
    });
  };

  const choices: { kind: GameKind; name: string }[] = [
    { kind: 'chess', name: 'Chess' },
    ...ONLINE_GAMES.map((g) => ({ kind: g.kind, name: g.name })),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={invite ? 'Invite a friend' : gameName(game)}
      actions={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={(!duel && !spec) || making}
            data-testid="game-dialog-post"
            onClick={() => {
              if (roomRace) {
                void makeRoom(close);
                return;
              }
              post();
              close();
            }}
          >
            {roomRace
              ? making
                ? 'Making the room…'
                : 'Make the room'
              : privateGame
                ? 'Create the link'
                : 'Post'}
          </Button>
        </>
      )}
    >
      <div className="stack-sm" data-testid="game-dialog">
        {invite ? (
          <>
            <p className="muted live__dialog-lead">
              Your game waits for whoever opens its link, and stays out of the list of open games.
            </p>
            <Field label="Game">
              {(id) => (
                <Select
                  id={id}
                  value={game}
                  onChange={(e) => setGame(e.target.value as GameKind)}
                  data-testid="game-dialog-game"
                >
                  {choices.map((choice) => (
                    <option key={choice.kind} value={choice.kind}>
                      {choice.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        ) : null}
        {info ? (
          <p className="live__dialog-about">
            <Icon name={roomRace ? 'people' : info.icon} size={20} className="live__dialog-icon" />
            <span>
              {roomRace
                ? 'Up to eight race the same puzzles. You get a link to send: whoever opens it joins under their name, and you start the race once they are in.'
                : info.description}
            </span>
          </p>
        ) : null}

        {!duel ? (
          <>
            <Field
              label="Time control"
              hint={
                correspondence
                  ? 'Each of you has these days for every move, and plays whenever suits. Its link opens the game for your friend, and its board opens for you at once.'
                  : spec
                    ? describeTimeControl(spec.id)
                    : undefined
              }
            >
              {(id) => (
                <Select
                  id={id}
                  value={tc}
                  onChange={(e) => setTc(e.target.value)}
                  data-testid="game-dialog-tc"
                >
                  {corrOffered ? (
                    <>
                      <optgroup label="At once">
                        {tcs.map((option) => (
                          <option key={option} value={option}>
                            {describeTimeControl(option)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Correspondence">
                        {CORRESPONDENCE_TCS.map((option) => (
                          <option key={option} value={option}>
                            {describeTimeControl(option)}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : (
                    tcs.map((option) => (
                      <option key={option} value={option}>
                        {describeTimeControl(option)}
                      </option>
                    ))
                  )}
                </Select>
              )}
            </Field>
            <div className="live__row">
              <span className="live__label">Your colour</span>
              <Segmented<ColorChoice>
                ariaLabel="Your colour"
                value={color}
                onChange={setColor}
                options={COLOR_OPTIONS}
              />
            </div>
          </>
        ) : null}

        {game === 'army' ? (
          <div className="live__row">
            <span className="live__label">Budget</span>
            <Segmented<number>
              ariaLabel="Budget"
              value={budget}
              onChange={setBudget}
              options={ARMY_BUDGETS.map((b) => ({ value: b, label: `${b} points` }))}
            />
          </div>
        ) : null}

        {game === 'race' ? (
          <>
            {invite ? null : (
              <div className="live__row">
                <span className="live__label">Race against</span>
                <Segmented<RaceWho>
                  ariaLabel="Race against"
                  value={raceWho}
                  onChange={setRaceWho}
                  options={RACE_WHO}
                />
              </div>
            )}
            {roomRace ? (
              <Field label="Format" hint={RACE_ROOM_FORMAT_HINTS[roomFormat]}>
                {(id) => (
                  <Select
                    id={id}
                    value={roomFormat}
                    onChange={(e) => setRoomFormat(e.target.value as RaceRoomFormat)}
                    data-testid="game-dialog-room-format"
                  >
                    {ROOM_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {RACE_ROOM_FORMAT_NAMES[f]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label="Format" hint={RACE_FORMAT_HINTS[format]}>
                {(id) => (
                  <Select
                    id={id}
                    value={format}
                    onChange={(e) => setFormat(e.target.value as RaceFormat)}
                    data-testid="game-dialog-format"
                  >
                    {RACE_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {RACE_FORMAT_NAMES[f]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field
              label="Puzzle rating"
              hint={
                (roomRace ? roomFormat : format) === 'timed'
                  ? 'The race starts a little below it, and climbs.'
                  : 'Every puzzle is near it.'
              }
            >
              {(id) => (
                <Select id={id} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                  {RACE_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        ) : null}

        {game === 'arbiter' ? (
          <div className="live__row">
            <span className="live__label">Pace</span>
            <Segmented<ArbiterPace>
              ariaLabel="Pace"
              value={pace}
              onChange={setPace}
              options={ARBITER_PACES.map((p) => ({ value: p, label: ARBITER_PACE_NAMES[p] }))}
            />
          </div>
        ) : null}

        {invite || roomRace ? null : (
          <Switch
            checked={privateGame}
            onChange={setPrivateGame}
            label="Only people with the link"
            description="Your game stays out of the list. Share its link once it is posted."
          />
        )}
        {roomRace && roomError ? (
          <p className="small live-game__error" role="alert" data-testid="game-dialog-error">
            {roomError}
          </p>
        ) : null}
        {game === 'chess' && !privateGame && account && prefs.lichess ? (
          <p className="small muted live__aside">
            {lichessOn
              ? 'Posted on Lichess too: whoever accepts first plays you.'
              : 'Lichess takes rapid and slower games only: this one waits here.'}
          </p>
        ) : null}
        {/* Looking on Lichess too is for standard chess: a Chess960 game is posted here only. */}
        {game === 'chess960' && !privateGame && account && prefs.lichess ? (
          <p className="small muted live__aside" data-testid="game-dialog-lichess">
            Lichess takes games of standard chess only: this one waits here.
          </p>
        ) : null}
        {info?.arcade ? (
          <p className="small muted live__aside">
            New to it? <Link to={info.arcade}>Practise alone first</Link>.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

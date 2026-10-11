import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Dialog, Field, Icon, Segmented, Select, Switch } from '@/components/ui';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import { isDuel, parseTimeControl, QUICK_TIME_CONTROLS } from '../../../relay/src/live/shared.mjs';
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
import type { ArbiterPace, ColorChoice, GameKind, GameOptions, RaceFormat } from './types';
import './live.css';

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

/**
 * Sets up a game to post: any of the games two people can play, with its
 * options. Posted in the open, or (inviting a friend) only for people with
 * its link. Inviting starts from a game of chess and lets the player choose
 * another; a game's own Play button starts from that game.
 */
export function GameDialog({
  open,
  kind,
  invite,
  onClose,
}: {
  open: boolean;
  /** The game to set up (the invitation's first choice). */
  kind: GameKind;
  /** A private game, for a friend with the link: the game can be changed here. */
  invite: boolean;
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

  // Each opening starts from the game asked for, with the latest choices.
  useEffect(() => {
    if (!open) return;
    setGame(kind);
    setPrivateGame(invite);
    setTc(useLivePrefs.getState().tc);
    setColor(useLivePrefs.getState().color);
  }, [open, kind, invite]);

  const duel = isDuel(game);
  const info = onlineGame(game);
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
  const tcs = QUICK_TIME_CONTROLS.includes(tc) ? QUICK_TIME_CONTROLS : [...QUICK_TIME_CONTROLS, tc];

  const post = () => {
    if (!duel && !spec) return;
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
            disabled={!duel && !spec}
            data-testid="game-dialog-post"
            onClick={() => {
              post();
              close();
            }}
          >
            {privateGame ? 'Create the link' : 'Post'}
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
            <Icon name={info.icon} size={20} className="live__dialog-icon" />
            <span>{info.description}</span>
          </p>
        ) : null}

        {!duel ? (
          <>
            <Field label="Time control" hint={spec ? describeTimeControl(spec.id) : undefined}>
              {(id) => (
                <Select id={id} value={tc} onChange={(e) => setTc(e.target.value)}>
                  {tcs.map((option) => (
                    <option key={option} value={option}>
                      {describeTimeControl(option)}
                    </option>
                  ))}
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
            <Field
              label="Puzzle rating"
              hint={
                format === 'timed'
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

        {invite ? null : (
          <Switch
            checked={privateGame}
            onChange={setPrivateGame}
            label="Only people with the link"
            description="Your game stays out of the list. Share its link once it is posted."
          />
        )}
        {game === 'chess' && !privateGame && account && prefs.lichess ? (
          <p className="small muted live__aside">
            {lichessOn
              ? 'Posted on Lichess too: whoever accepts first plays you.'
              : 'Lichess takes rapid and slower games only: this one waits here.'}
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

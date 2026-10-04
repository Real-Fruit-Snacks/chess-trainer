import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { ClockDisplay } from '@/components/chess/ClockDisplay';
import { MoveInput } from '@/components/chess/MoveInput';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Field,
  Select,
  Spinner,
  Switch,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { START_FEN } from '@/chess/helpers';
import { MOTIF_HELP } from '@/features/analyze/commentary';
import { getLessonMeta } from '@/features/learn/lessonMeta';
import type { Fen, LongColor } from '@/chess/types';
import { EngineCrashedError } from '@/engine/EngineClient';
import { ENGINE_LEVELS } from '@/engine/levels';
import { TIME_CONTROLS } from '@/lib/clock';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { useRepertoire } from '@/store/repertoire';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { LadderCard } from './LadderCard';
import { checkStartPosition } from './startPosition';
import { canFollowBook, describeDeviation } from './openingBook';
import { type Opponent, usePlayVsEngine } from './usePlayVsEngine';
import './play.css';
import { Notated, San } from '@/chess/San';
import { useFocus } from '@/app/focus';
import { handOffToAnalysis } from '@/lib/handoff';

/** How long a blindfold "peek" shows the pieces. */
const PEEK_MS = 2000;

const CATEGORY_LABEL: Record<string, string> = {
  none: 'Untimed',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
};

export default function PlayPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const settings = useSettings();
  const play = usePlayVsEngine();
  const [setupOpen, setSetupOpen] = useState(true);
  // Focus mode: the shell drops its header and navigation while a game is on.
  const setFocus = useFocus((s) => s.set);
  const focusOn = settings.playFocus && play.started && !play.gameOver;
  useEffect(() => {
    setFocus(focusOn);
    return () => setFocus(false);
  }, [focusOn, setFocus]);
  // A hand-off from analysis, puzzles, lessons or drills: play out this position.
  const [handOff] = useState(() => checkStartPosition(searchParams.get('fen')));
  const [startFrom, setStartFrom] = useState<Fen | null>(handOff.fen);
  const [color, setColor] = useState<LongColor | 'random'>(() => {
    const requested = searchParams.get('color');
    if (requested === 'white' || requested === 'black') return requested;
    if (handOff.fen) return handOff.fen.split(' ')[1] === 'b' ? 'black' : 'white';
    return settings.playColor;
  });
  useEffect(() => {
    if (handOff.problem) {
      toast(`Cannot play from that position: ${handOff.problem}`, { tone: 'warning' });
    }
  }, [handOff.problem]);
  const [levelId, setLevelId] = useState(() => {
    const requested = Number(searchParams.get('level'));
    return ENGINE_LEVELS.some((l) => l.id === requested) ? requested : settings.playLevel;
  });
  const [timeControlId, setTimeControlId] = useState(settings.playTimeControl);
  const [opponent, setOpponent] = useState<Opponent>('engine');
  const [autoFlip, setAutoFlip] = useState(true);
  // Opening practice: follow a repertoire while the game stays in book.
  const customRepertoires = useRepertoire((s) => s.custom);
  const repertoires = [
    ...BUILT_IN_REPERTOIRES.map((r) => ({ id: r.id, name: r.name, color: r.color, pgn: r.pgn })),
    ...customRepertoires.map((r) => ({ id: r.id, name: r.name, color: r.color, pgn: r.pgn })),
  ];
  const [bookId, setBookId] = useState<string>(() => {
    const requested = searchParams.get('book');
    return requested && repertoires.some((r) => r.id === requested) ? requested : '';
  });
  const bookChoice = repertoires.find((r) => r.id === bookId) ?? null;
  const [confirmResign, setConfirmResign] = useState(false);
  // The result dialog is dismissed for one result at a time, so the next game's result opens it
  // again (a dialog closed by a new game fires its close event after the game has restarted).
  const [dismissedResult, setDismissedResult] = useState<typeof play.gameOver>(null);
  const resultOpen = !!play.gameOver && dismissedResult !== play.gameOver;
  const dismissResult = () => setDismissedResult(play.gameOver);
  // Blindfold: the pieces are hidden; "Peek" shows them for a moment. The board is revealed once
  // the game is over so the result can be reviewed.
  const [peeking, setPeeking] = useState(false);
  const [peeks, setPeeks] = useState(0);
  const blindfold = settings.playBlindfold && play.started && !play.gameOver;

  useEffect(() => {
    document.title = `Play · ${siteConfig.name}`;
  }, []);

  // Clear the hand-off from the URL so a reload starts a normal game.
  useEffect(() => {
    if (
      searchParams.has('fen') ||
      searchParams.has('color') ||
      searchParams.has('level') ||
      searchParams.has('book')
    ) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const { game, position } = { game: play.game, position: play.game.position };
  const hotSeat = play.opponent === 'human';
  const engineName = `Stockfish · ${play.level.name}`;
  const opponentName = hotSeat ? 'Two players' : engineName;
  const topColor: LongColor = play.orientation === 'white' ? 'black' : 'white';
  const bottomColor: LongColor = play.orientation;
  const nameFor = (c: LongColor) =>
    hotSeat ? (c === 'white' ? 'White' : 'Black') : c === play.playerColor ? 'You' : engineName;
  const hasClock = play.timeControl.initialMs > 0;
  const clockFor = (c: LongColor) =>
    hasClock && play.started ? (
      <ClockDisplay ms={play.clock[c]} running={play.clock.running === c && !play.gameOver} />
    ) : null;

  /** The last game's settings, so "Play again" can repeat them without the setup dialog. */
  const lastSetupRef = useRef<Parameters<typeof play.start>[0] | null>(null);

  const launch = (setup: Parameters<typeof play.start>[0]) => {
    lastSetupRef.current = setup;
    play.start(setup);
    // Only games set up here become the Play defaults (arcade games go through the hook too).
    settings.update({
      playLevel: setup.levelId,
      playColor: setup.color,
      playTimeControl: setup.timeControlId,
    });
    setSetupOpen(false);
    setPeeks(0);
    setPeeking(false);
  };

  const startGame = () => {
    const book = bookChoice && opponent === 'engine' && !startFrom ? bookChoice : undefined;
    if (book && !canFollowBook(book.pgn)) {
      toast(`“${book.name}” could not be read. Open it from Openings to copy or delete it.`, {
        tone: 'warning',
      });
      return;
    }
    launch({
      color,
      levelId,
      timeControlId,
      fen: startFrom ?? undefined,
      opponent,
      autoFlip: opponent === 'human' && autoFlip,
      coach: settings.playCoach,
      book,
    });
  };

  /** Play again: the same settings as the last game, straight away. */
  const playAgain = () => {
    const last = lastSetupRef.current;
    if (!last) {
      openSetup();
      return;
    }
    launch({ ...last, coach: settings.playCoach });
  };

  const peek = () => {
    setPeeks((n) => n + 1);
    setPeeking(true);
    window.setTimeout(() => setPeeking(false), PEEK_MS);
  };
  const customStart = play.started && play.startFen !== START_FEN;

  const openSetup = () => {
    dismissResult();
    setSetupOpen(true);
  };

  /** A ladder game: the next rung, from the initial position, with the usual settings. */
  const playLadder = (nextLevelId: number) => {
    setLevelId(nextLevelId);
    setStartFrom(null);
    setOpponent('engine');
    setBookId('');
    launch({
      color,
      levelId: nextLevelId,
      timeControlId,
      opponent: 'engine',
      autoFlip: false,
      coach: settings.playCoach,
      source: 'ladder',
      event: `Engine ladder · Level ${nextLevelId}`,
    });
  };

  const analyze = () => {
    // Analysis opens from the learner's side (between two players, as the board faces now).
    const orientation = play.opponent === 'human' ? play.orientation : play.playerColor;
    void navigate(handOffToAnalysis(play.pgn(), { orientation }));
  };

  const copyPgn = async () => {
    try {
      await navigator.clipboard.writeText(play.pgn());
      toast('PGN copied to clipboard.');
    } catch {
      toast('Could not access the clipboard.', { tone: 'warning' });
    }
  };

  const playerTurn =
    play.started &&
    !play.gameOver &&
    !play.thinking &&
    (hotSeat || position.turn === play.playerColor);
  const movableColor = playerTurn ? (hotSeat ? position.turn : play.playerColor) : undefined;

  const groupedControls = TIME_CONTROLS.reduce<Record<string, typeof TIME_CONTROLS>>((acc, tc) => {
    acc[tc.category] = [...(acc[tc.category] ?? []), tc];
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header page-header--lean">
        <h1>Play</h1>
        <p>
          Eight engine levels, from “just learned the rules” to master, with or without a clock — or
          two players at one device. Take back moves, ask for hints, or play blindfold.
        </p>
      </div>

      {play.engineStatus === 'error' ? (
        <Alert tone="danger" role="alert">
          {play.engineError instanceof EngineCrashedError
            ? 'The engine stopped responding. Retry starts a fresh one and the game carries on.'
            : `The engine could not start: ${play.engineError?.message ?? 'unknown error'}.`}{' '}
          <Button size="sm" onClick={() => void play.retryEngine()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      <div className="trainer">
        <div className="play__boardcol">
          <PlayerBar
            name={nameFor(topColor)}
            color={topColor}
            fen={position.fen}
            thinking={play.thinking && topColor !== play.playerColor}
            extra={clockFor(topColor)}
            showMaterial={!customStart}
          />
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={position.fen}
              orientation={play.orientation}
              turnColor={position.turn}
              movableColor={movableColor}
              dests={playerTurn ? position.dests : new Map()}
              lastMove={position.lastMove}
              check={position.inCheck}
              autoShapes={play.hintShapes}
              onMove={(from, to) => play.playerMove(from, to)}
              ariaLabel={`Game board, ${position.turn} to move`}
              className={blindfold && !peeking ? 'board--blindfold' : undefined}
            />
            {game.pendingPromotion ? (
              <PromotionPicker
                color={game.pendingPromotion.color}
                onSelect={play.resolvePromotion}
              />
            ) : null}
            {!play.started && !setupOpen ? (
              <div className="trainer__overlay">
                <Button variant="primary" size="lg" onClick={openSetup}>
                  New game
                </Button>
              </div>
            ) : null}
          </div>
          <PlayerBar
            name={nameFor(bottomColor)}
            color={bottomColor}
            fen={position.fen}
            thinking={play.thinking && bottomColor !== play.playerColor}
            extra={clockFor(bottomColor)}
            showMaterial={!customStart}
          />
          {blindfold ? (
            <div className="row row--between" data-testid="blindfold-bar">
              <span className="small muted">
                Blindfold · {peeks} peek{peeks === 1 ? '' : 's'}
              </span>
              <Button size="sm" onClick={peek} disabled={peeking}>
                {peeking ? 'Peeking…' : 'Peek'}
              </Button>
            </div>
          ) : null}
          {settings.moveInput && play.started ? (
            <MoveInput onMove={play.playerNotation} disabled={!playerTurn} keepFocus />
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>{play.started ? opponentName : 'No game in progress'}</strong>
              {play.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
            </div>
            {play.started ? (
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                {hotSeat
                  ? `Pass the device after each move${hasClock ? ` · ${play.timeControl.label}` : ''}.`
                  : `${play.level.description} You play ${play.playerColor}${hasClock ? ` · ${play.timeControl.label}` : ''}${play.coach ? ' · Coach on' : ''}.`}
                {play.book ? (
                  <>
                    {' '}
                    <span data-testid="book-status">
                      {play.book.status === 'in-book'
                        ? `Book: ${play.book.name} — the opponent follows your repertoire.`
                        : play.book.status === 'deviated'
                          ? `Book: ${play.book.name} — you left it at move ${Math.ceil((play.book.deviation?.ply ?? 0) / 2)}; the engine plays on.`
                          : `Book: ${play.book.name} — out of book after move ${Math.ceil((play.book.endedAtPly ?? 0) / 2)}; the engine plays on.`}
                    </span>
                  </>
                ) : null}
                {customStart ? (
                  <>
                    {' '}
                    Custom starting position ·{' '}
                    <Link to={`/analyze?fen=${encodeURIComponent(play.startFen)}`}>analyze it</Link>
                    .
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="play__actions">
              <Button variant="primary" onClick={openSetup}>
                New game
              </Button>
              <Button
                onClick={play.takeBack}
                disabled={!play.started || !!play.gameOver || position.history.length === 0}
              >
                Take back
              </Button>
              <Button
                onClick={play.hint}
                disabled={!playerTurn || play.hinting || play.engineStatus !== 'ready'}
                loading={play.hinting}
                title="Show the engine’s suggested move for you"
              >
                Hint
              </Button>
              <Button
                onClick={play.showThreat}
                disabled={
                  !playerTurn || play.hinting || position.inCheck || play.engineStatus !== 'ready'
                }
                title="Show what your opponent is threatening to play"
              >
                Threat
              </Button>
              <Button onClick={play.flip}>Flip</Button>
              <Button
                onClick={() => settings.update({ playFocus: !settings.playFocus })}
                aria-pressed={settings.playFocus}
                title="Hide the header and navigation while a game is on"
                data-testid="focus-toggle"
              >
                Focus
              </Button>
              <Button
                variant="danger"
                onClick={() => setConfirmResign(true)}
                disabled={!play.started || !!play.gameOver}
              >
                Resign
              </Button>
            </div>
            <p className="small muted play__hint" role="status" data-testid="hint-text">
              {play.hintMove ? (
                <>
                  {play.hintMove.kind === 'hint' ? 'Suggested move: ' : 'Threat: '}
                  <San san={play.hintMove.san} />
                </>
              ) : null}
            </p>
          </Card>

          {play.bookAlert ? (
            <Alert tone="warning" role="alert">
              <div data-testid="book-alert">
                <strong>Repertoire:</strong> {describeDeviation(play.bookAlert)}{' '}
                <Link to={`/openings/${play.book?.repertoireId ?? ''}`}>Review the line</Link>
                <div className="row" style={{ marginTop: 8 }}>
                  <Button size="sm" variant="primary" onClick={play.bookTakeBack}>
                    Take it back
                  </Button>
                  <Button size="sm" onClick={play.bookPlayOn}>
                    Play on
                  </Button>
                </div>
              </div>
            </Alert>
          ) : null}
          {play.coachAlert ? (
            <Alert
              tone={play.coachAlert.verdict.judgement === 'blunder' ? 'danger' : 'warning'}
              role="alert"
            >
              <div data-testid="coach-alert">
                <strong>Coach:</strong> <San san={play.coachAlert.san} /> was{' '}
                {play.coachAlert.verdict.judgement === 'blunder' ? 'a blunder' : 'a mistake'}.
                {play.coachAlert.verdict.explanation ? (
                  <>
                    {' '}
                    <Notated text={play.coachAlert.verdict.explanation.text} />
                    {(() => {
                      const help = MOTIF_HELP[play.coachAlert.verdict.explanation.motif];
                      const lesson = getLessonMeta(help.lesson);
                      return lesson ? (
                        <>
                          {' '}
                          <Link to={`/learn/${lesson.id}`}>Lesson: {lesson.title}</Link>
                        </>
                      ) : null;
                    })()}
                  </>
                ) : null}
                <div className="row" style={{ marginTop: 8 }}>
                  <Button size="sm" variant="primary" onClick={play.coachTakeBack}>
                    Take it back
                  </Button>
                  <Button size="sm" onClick={play.coachPlayOn}>
                    Play on
                  </Button>
                </div>
              </div>
            </Alert>
          ) : play.coachChecking ? (
            <p className="small muted" role="status" data-testid="coach-checking">
              Coach is checking your move…
            </p>
          ) : null}

          {!play.started || play.gameOver ? <LadderCard onPlay={playLadder} /> : null}

          <Card>
            <MoveList
              moves={position.history}
              currentPly={position.history.length}
              startsWithBlack={play.startFen.split(' ')[1] === 'b'}
              startMoveNumber={Number(play.startFen.split(' ')[5] ?? 1)}
            />
            <div className="row" style={{ marginTop: 12 }}>
              <Button
                size="sm"
                onClick={() => void copyPgn()}
                disabled={position.history.length === 0}
              >
                Copy PGN
              </Button>
              <Button size="sm" onClick={analyze} disabled={position.history.length === 0}>
                Analyze game
              </Button>
            </div>
          </Card>
        </aside>
      </div>

      {/* New game setup */}
      <Dialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="New game"
        actions={
          <>
            <Button variant="ghost" onClick={() => setSetupOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={startGame}>
              Start
            </Button>
          </>
        }
      >
        <div className="stack">
          {startFrom ? (
            <Alert tone="info">
              Starting from a custom position ({startFrom.split(' ')[1] === 'b' ? 'Black' : 'White'}{' '}
              to move).{' '}
              <Button size="sm" variant="ghost" onClick={() => setStartFrom(null)}>
                Use the initial position instead
              </Button>
            </Alert>
          ) : null}
          {play.suggestedLevel ? (
            <Alert tone="info">
              Based on your last two games, try{' '}
              <strong>
                Level {play.suggestedLevel.id} · {play.suggestedLevel.name}
              </strong>
              .{' '}
              <Button size="sm" onClick={() => setLevelId(play.suggestedLevel?.id ?? levelId)}>
                Use it
              </Button>
            </Alert>
          ) : null}
          <Field label="Opponent">
            {(id) => (
              <Select
                id={id}
                value={opponent}
                onChange={(e) => setOpponent(e.target.value as Opponent)}
              >
                <option value="engine">Stockfish (engine)</option>
                <option value="human">Another person at this device</option>
              </Select>
            )}
          </Field>
          {opponent === 'engine' && !startFrom ? (
            <Field
              label="Practise an opening"
              hint={
                bookChoice
                  ? `You play ${bookChoice.color}. The opponent follows the repertoire’s lines; when the book runs out, the engine takes over. Leaving the book pauses the game.`
                  : 'Rehearse a repertoire against a live opponent.'
              }
            >
              {(id) => (
                <Select
                  id={id}
                  value={bookId}
                  onChange={(e) => setBookId(e.target.value)}
                  data-testid="book-select"
                >
                  <option value="">No — a normal game</option>
                  {repertoires.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.color})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          {opponent === 'engine' ? (
            <Field
              label="Engine level"
              hint={`${ENGINE_LEVELS.find((l) => l.id === levelId)?.description ?? ''} The rating in brackets is a rough guide, not a measured strength.`}
            >
              {(id) => (
                <Select
                  id={id}
                  value={levelId}
                  onChange={(e) => setLevelId(Number(e.target.value))}
                >
                  {ENGINE_LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      Level {l.id} · {l.name} (~{l.approxElo})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Switch
              checked={autoFlip}
              onChange={setAutoFlip}
              label="Turn the board after every move"
              description="The board faces whoever is to move."
            />
          )}
          {bookChoice && opponent === 'engine' && !startFrom ? null : (
            <Field label={opponent === 'human' ? 'Board faces' : 'Your colour'}>
              {(id) => (
                <Select
                  id={id}
                  value={color}
                  onChange={(e) => setColor(e.target.value as LongColor | 'random')}
                >
                  <option value="white">White</option>
                  <option value="black">Black</option>
                  <option value="random">Random</option>
                </Select>
              )}
            </Field>
          )}
          <Field
            label="Time control"
            hint={
              timeControlId === 'none'
                ? 'No clock — take as long as you like. Good while learning.'
                : 'Run out of time and you lose. 10 + 5 is a good first rapid game; the engine always moves quickly.'
            }
          >
            {(id) => (
              <Select
                id={id}
                value={timeControlId}
                onChange={(e) => setTimeControlId(e.target.value)}
              >
                {Object.entries(groupedControls).map(([category, controls]) => (
                  <optgroup key={category} label={CATEGORY_LABEL[category] ?? category}>
                    {controls.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          <Switch
            checked={settings.moveInput}
            onChange={(next) => settings.update({ moveInput: next })}
            label="Keyboard move entry"
            description="Type moves like Nf3 or e2e4 under the board."
          />
          {opponent === 'engine' ? (
            <Switch
              checked={settings.playCoach}
              onChange={(next) => settings.update({ playCoach: next })}
              label="Coach mode"
              description={
                timeControlId === 'none'
                  ? 'After a mistake the game pauses, explains what went wrong and offers a take-back.'
                  : 'Only in untimed games — the coach needs time to check each move.'
              }
            />
          ) : null}
          <Switch
            checked={settings.playBlindfold}
            onChange={(next) => settings.update({ playBlindfold: next })}
            label="Blindfold"
            description="The pieces are hidden — follow the moves in the notation panel and play by clicking squares. Peek when you must."
          />
        </div>
      </Dialog>

      {/* Resign confirmation */}
      <ConfirmDialog
        open={confirmResign}
        title="Resign this game?"
        cancelLabel="Keep playing"
        confirmLabel="Resign"
        danger
        onConfirm={play.resign}
        onClose={() => setConfirmResign(false)}
      >
        <p className="muted">
          {hotSeat
            ? `${position.turn === 'white' ? 'White' : 'Black'} (the side to move) resigns.`
            : 'The game will be recorded as a loss.'}
        </p>
      </ConfirmDialog>

      {/* Game over */}
      <Dialog
        open={resultOpen}
        onClose={dismissResult}
        title={
          hotSeat
            ? play.gameOver?.result === '1-0'
              ? 'White wins'
              : play.gameOver?.result === '0-1'
                ? 'Black wins'
                : 'Draw'
            : play.gameOver?.verdict === 'win'
              ? 'You won!'
              : play.gameOver?.verdict === 'loss'
                ? 'Game over'
                : 'Draw'
        }
        actions={
          <>
            <Button variant="ghost" onClick={dismissResult}>
              Show the board
            </Button>
            <Button onClick={analyze}>Analyze game</Button>
            <Button onClick={openSetup}>New game</Button>
            <Button variant="primary" onClick={playAgain} title="Same opponent, colour and clock">
              Play again
            </Button>
          </>
        }
      >
        <p>
          {play.gameOver ? (
            <>
              <strong>{play.gameOver.result}</strong>{' '}
              {play.gameOver.reason === 'time' ? 'on time' : `by ${play.gameOver.reason}`}.{' '}
              {play.coachInterventions > 0
                ? `The coach stepped in ${play.coachInterventions} time${play.coachInterventions === 1 ? '' : 's'}. `
                : ''}
              {play.book ? (
                <span data-testid="book-summary">
                  {play.book.status === 'deviated' && play.book.deviation
                    ? `${describeDeviation(play.book.deviation)} That move is back in your review queue. `
                    : `You followed the ${play.book.name} for ${Math.ceil((play.book.endedAtPly ?? 0) / 2)} moves. `}
                </span>
              ) : null}
              {hotSeat
                ? 'Analyze the game together to find the turning points.'
                : play.suggestedLevel
                  ? play.suggestedLevel.id > play.level.id
                    ? `Two wins in a row — Level ${play.suggestedLevel.id} (${play.suggestedLevel.name}) should give you a better fight.`
                    : `Two losses in a row — try Level ${play.suggestedLevel.id} (${play.suggestedLevel.name}) to work on fundamentals, then come back.`
                  : play.gameOver.verdict === 'loss'
                    ? 'Tip: analyze the game to find the turning point.'
                    : play.gameOver.verdict === 'win' && play.level.id < ENGINE_LEVELS.length
                      ? 'Nicely done. Win again at this level and we will suggest the next one.'
                      : ''}
            </>
          ) : null}
        </p>
      </Dialog>
    </div>
  );
}

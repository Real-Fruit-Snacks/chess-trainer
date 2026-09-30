import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { ClockDisplay } from '@/components/chess/ClockDisplay';
import { MoveInput } from '@/components/chess/MoveInput';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { Alert, Button, Card, Dialog, Field, Select, Spinner, Switch } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { isValidFen, START_FEN } from '@/chess/helpers';
import type { Fen, LongColor } from '@/chess/types';
import { ENGINE_LEVELS } from '@/engine/levels';
import { TIME_CONTROLS } from '@/lib/clock';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { type Opponent, usePlayVsEngine } from './usePlayVsEngine';
import './play.css';

/** How long a blindfold "peek" shows the pieces. */
const PEEK_MS = 2000;

export const HANDOFF_PGN_KEY = 'chess-trainer:handoff-pgn';

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
  // A hand-off from analysis, puzzles, lessons or drills: play out this position.
  const [startFrom, setStartFrom] = useState<Fen | null>(() => {
    const fen = searchParams.get('fen');
    return fen && isValidFen(fen) ? fen : null;
  });
  const [color, setColor] = useState<LongColor | 'random'>(() => {
    const requested = searchParams.get('color');
    if (requested === 'white' || requested === 'black') return requested;
    const fen = searchParams.get('fen');
    if (fen && isValidFen(fen)) return fen.split(' ')[1] === 'b' ? 'black' : 'white';
    return settings.playColor;
  });
  const [levelId, setLevelId] = useState(() => {
    const requested = Number(searchParams.get('level'));
    return ENGINE_LEVELS.some((l) => l.id === requested) ? requested : settings.playLevel;
  });
  const [timeControlId, setTimeControlId] = useState(settings.playTimeControl);
  const [opponent, setOpponent] = useState<Opponent>('engine');
  const [autoFlip, setAutoFlip] = useState(true);
  const [confirmResign, setConfirmResign] = useState(false);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  // Blindfold: the pieces are hidden; "Peek" shows them for a moment.
  const [peeking, setPeeking] = useState(false);
  const [peeks, setPeeks] = useState(0);
  const blindfold = settings.playBlindfold && play.started;

  useEffect(() => {
    document.title = `Play · ${siteConfig.name}`;
  }, []);

  // Clear the hand-off from the URL so a reload starts a normal game.
  useEffect(() => {
    if (searchParams.has('fen') || searchParams.has('color') || searchParams.has('level')) {
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

  const startGame = () => {
    play.start({
      color,
      levelId,
      timeControlId,
      fen: startFrom ?? undefined,
      opponent,
      autoFlip: opponent === 'human' && autoFlip,
    });
    setSetupOpen(false);
    setGameOverDismissed(false);
    setPeeks(0);
    setPeeking(false);
  };

  const peek = () => {
    setPeeks((n) => n + 1);
    setPeeking(true);
    window.setTimeout(() => setPeeking(false), PEEK_MS);
  };
  const customStart = play.started && play.startFen !== START_FEN;

  const openSetup = () => {
    setGameOverDismissed(true);
    setSetupOpen(true);
  };

  const analyze = () => {
    sessionStorage.setItem(HANDOFF_PGN_KEY, play.pgn());
    void navigate('/analyze?from=game');
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
      <div className="page-header">
        <h1>Play</h1>
        <p>
          Eight engine levels, from “just learned the rules” to master, with or without a clock — or
          two players at one device. Take back moves, ask for hints, or play blindfold.
        </p>
      </div>

      {play.engineStatus === 'error' ? (
        <Alert tone="danger" role="alert">
          The engine could not start: {play.engineError?.message}{' '}
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
            <MoveInput onMove={play.playerNotation} disabled={!playerTurn} />
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
                  : `${play.level.description} You play ${play.playerColor}${hasClock ? ` · ${play.timeControl.label}` : ''}.`}
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
                disabled={!play.started || position.history.length === 0}
              >
                Take back
              </Button>
              <Button
                onClick={play.hint}
                disabled={!playerTurn || play.hinting || play.engineStatus !== 'ready'}
                loading={play.hinting}
                title="Show the engine's suggested move for you"
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
                variant="danger"
                onClick={() => setConfirmResign(true)}
                disabled={!play.started || !!play.gameOver}
              >
                Resign
              </Button>
            </div>
          </Card>

          <Card>
            <MoveList
              moves={position.history}
              currentPly={position.history.length}
              onSelectPly={() => undefined}
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
          {opponent === 'engine' ? (
            <Field label="Strength" hint={ENGINE_LEVELS.find((l) => l.id === levelId)?.description}>
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
          <Switch
            checked={settings.playBlindfold}
            onChange={(next) => settings.update({ playBlindfold: next })}
            label="Blindfold"
            description="The pieces are hidden — follow the moves in the notation panel and play by clicking squares. Peek when you must."
          />
        </div>
      </Dialog>

      {/* Resign confirmation */}
      <Dialog
        open={confirmResign}
        onClose={() => setConfirmResign(false)}
        title="Resign this game?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmResign(false)}>
              Keep playing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                play.resign();
                setConfirmResign(false);
              }}
            >
              Resign
            </Button>
          </>
        }
      >
        <p className="muted">
          {hotSeat
            ? `${position.turn === 'white' ? 'White' : 'Black'} (the side to move) resigns.`
            : 'The game will be recorded as a loss.'}
        </p>
      </Dialog>

      {/* Game over */}
      <Dialog
        open={!!play.gameOver && !gameOverDismissed}
        onClose={() => setGameOverDismissed(true)}
        title={
          hotSeat
            ? play.gameOver?.result === '1-0'
              ? 'White wins'
              : play.gameOver?.result === '0-1'
                ? 'Black wins'
                : 'Draw'
            : play.gameOver?.verdict === 'win'
              ? 'You won! 🎉'
              : play.gameOver?.verdict === 'loss'
                ? 'Game over'
                : 'Draw'
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => setGameOverDismissed(true)}>
              Review board
            </Button>
            <Button onClick={analyze}>Analyze game</Button>
            <Button variant="primary" onClick={openSetup}>
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

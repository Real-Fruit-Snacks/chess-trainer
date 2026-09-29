import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { Alert, Button, Card, Dialog, Field, Select, Spinner } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import type { LongColor } from '@/chess/types';
import { ENGINE_LEVELS } from '@/engine/levels';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { usePlayVsEngine } from './usePlayVsEngine';
import './play.css';

export const HANDOFF_PGN_KEY = 'chess-trainer:handoff-pgn';

export default function PlayPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const play = usePlayVsEngine();
  const [setupOpen, setSetupOpen] = useState(true);
  const [color, setColor] = useState<LongColor | 'random'>(settings.playColor);
  const [levelId, setLevelId] = useState(settings.playLevel);
  const [confirmResign, setConfirmResign] = useState(false);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

  useEffect(() => {
    document.title = `Play · ${siteConfig.name}`;
  }, []);

  const { game, position } = { game: play.game, position: play.game.position };
  const engineName = `Stockfish · ${play.level.name}`;
  const topColor: LongColor = play.orientation === 'white' ? 'black' : 'white';
  const bottomColor: LongColor = play.orientation;
  const nameFor = (c: LongColor) => (c === play.playerColor ? 'You' : engineName);

  const startGame = () => {
    play.start(color, levelId);
    setSetupOpen(false);
    setGameOverDismissed(false);
  };

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
    play.started && !play.gameOver && position.turn === play.playerColor && !play.thinking;

  return (
    <div>
      <div className="page-header">
        <h1>Play the engine</h1>
        <p>
          Eight strength levels, from “just learned the rules” to master. Take back moves and ask
          for hints while you learn.
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
          />
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={position.fen}
              orientation={play.orientation}
              turnColor={position.turn}
              movableColor={playerTurn ? play.playerColor : undefined}
              dests={playerTurn ? position.dests : new Map()}
              lastMove={position.lastMove}
              check={position.inCheck}
              autoShapes={play.hintShapes}
              onMove={(from, to) => play.playerMove(from, to)}
              ariaLabel={`Game board, ${position.turn} to move`}
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
          />
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>{play.started ? engineName : 'No game in progress'}</strong>
              {play.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
            </div>
            {play.started ? (
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                {play.level.description} You play {play.playerColor}.
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
                disabled={!playerTurn || play.hinting}
                loading={play.hinting}
              >
                Hint
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
              startsWithBlack={false}
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
          <Field label="Strength" hint={ENGINE_LEVELS.find((l) => l.id === levelId)?.description}>
            {(id) => (
              <Select id={id} value={levelId} onChange={(e) => setLevelId(Number(e.target.value))}>
                {ENGINE_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    Level {l.id} · {l.name} (~{l.approxElo})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Your colour">
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
        <p className="muted">The game will be recorded as a loss.</p>
      </Dialog>

      {/* Game over */}
      <Dialog
        open={!!play.gameOver && !gameOverDismissed}
        onClose={() => setGameOverDismissed(true)}
        title={
          play.gameOver?.verdict === 'win'
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
              <strong>{play.gameOver.result}</strong> by {play.gameOver.reason}.{' '}
              {play.gameOver.verdict === 'loss' && play.level.id > 1
                ? 'Tip: analyze the game to find the turning point, or drop a level to work on fundamentals.'
                : play.gameOver.verdict === 'win' && play.level.id < ENGINE_LEVELS.length
                  ? 'Ready for the next level?'
                  : ''}
            </>
          ) : null}
        </p>
      </Dialog>
    </div>
  );
}

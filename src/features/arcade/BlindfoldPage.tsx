import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Button, Card, Field, Select, Spinner, Stat, LinkButton } from '@/components/ui';
import type { LongColor } from '@/chess/types';
import { getLevel } from '@/engine/levels';
import { usePlayVsEngine } from '@/features/play/usePlayVsEngine';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { AnalyzeGameButton, EngineLevelField } from './arcadeControls';
import { useArcadeFocus } from './arcadeGame';
import { EngineGameBoard, GameMoves } from './EngineGameBoard';
import {
  BLINDFOLD_PEEKS,
  BLINDFOLD_SCORING,
  blindfoldScore,
  describeBlindfold,
  PEEK_MS,
} from './blindfold';
import './arcade.css';

export default function BlindfoldPage() {
  const play = usePlayVsEngine();
  const settings = useSettings();
  const recordArcade = useProgress((s) => s.recordArcade);
  const best = useProgress((s) => s.arcade.blindfold);
  const [levelId, setLevelId] = useState(settings.playLevel);
  const [color, setColor] = useState<LongColor | 'random'>('white');
  /** The setup card is up (before the first game, and after "New game"). */
  const [settingUp, setSettingUp] = useState(true);
  const [peeksUsed, setPeeksUsed] = useState(0);
  const [peeking, setPeeking] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const recordedRef = useRef(false);
  const peekTimer = useRef<number | null>(null);

  useEffect(() => {
    document.title = `Blindfold · ${siteConfig.name}`;
    return () => {
      if (peekTimer.current) window.clearTimeout(peekTimer.current);
    };
  }, []);

  useArcadeFocus(play.started && !play.gameOver);

  /** A game with the chosen level and colour (Play again keeps them). */
  const begin = () => {
    recordedRef.current = false;
    setSettingUp(false);
    setPeeksUsed(0);
    setPeeking(false);
    setLastScore(null);
    play.start({
      color,
      levelId,
      timeControlId: 'none',
      opponent: 'engine',
      coach: false,
      source: 'arcade',
      event: `Blindfold · Level ${levelId}`,
    });
  };

  const peek = () => {
    if (peeksUsed >= BLINDFOLD_PEEKS || peeking) return;
    setPeeksUsed((n) => n + 1);
    setPeeking(true);
    peekTimer.current = window.setTimeout(() => setPeeking(false), PEEK_MS);
  };

  useEffect(() => {
    if (!play.gameOver || recordedRef.current) return;
    recordedRef.current = true;
    const score = blindfoldScore(play.gameOver.verdict, peeksUsed, play.level.id);
    setLastScore(score);
    recordArcade(
      'blindfold',
      score,
      describeBlindfold(play.gameOver.verdict, peeksUsed, `Level ${play.level.id}`),
    );
  }, [play.gameOver, peeksUsed, play.level.id, recordArcade]);

  const peeksLeft = BLINDFOLD_PEEKS - peeksUsed;
  const over = play.gameOver;
  const blindfold = play.started && !peeking && !over;

  const overlay = settingUp ? (
    <Card className="arcade__summary">
      <h2>Blindfold</h2>
      <p className="muted">
        The pieces stay hidden; the move list is all you get. You may peek {BLINDFOLD_PEEKS} times.
      </p>
      <div className="stack" style={{ textAlign: 'left' }}>
        <EngineLevelField value={levelId} onChange={setLevelId} testId="blindfold-level" />
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
      <div className="row" style={{ marginTop: 12 }}>
        <Button
          variant="primary"
          size="lg"
          onClick={begin}
          disabled={play.engineStatus === 'error'}
          data-testid="blindfold-start"
        >
          Start
        </Button>
      </div>
    </Card>
  ) : over ? (
    <Card className="arcade__summary" data-testid="blindfold-result">
      <h2>
        {over.verdict === 'win' ? 'You win' : over.verdict === 'draw' ? 'Draw' : 'The engine wins'}
      </h2>
      <div className="arcade__scoreline">
        <Stat value={lastScore ?? 0} label="Score" />
        <Stat value={peeksLeft} label="Peeks to spare" />
        <Stat value={best?.best ?? lastScore ?? 0} label="Best" />
      </div>
      <p className="muted">
        {over.reason.charAt(0).toUpperCase() + over.reason.slice(1)} against Level {play.level.id} ·{' '}
        {getLevel(play.level.id).name}.
        {over.verdict === 'loss' ? ' A loss scores nothing, whatever the peeks.' : ''}
      </p>
      <div className="row arcade__summary-actions">
        <Button
          variant="primary"
          onClick={begin}
          title="The same engine level and colour"
          data-testid="blindfold-again"
        >
          Play again
        </Button>
        <Button onClick={() => setSettingUp(true)} data-testid="blindfold-new">
          New game
        </Button>
        <AnalyzeGameButton pgn={play.pgn} orientation={play.playerColor} />
        <LinkButton to="/arcade">Arcade</LinkButton>
      </div>
    </Card>
  ) : null;

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Blindfold
        </p>
        <h1>Blindfold</h1>
        <p>
          A full game against the engine with the pieces hidden. Three peeks; a win with peeks to
          spare is the top score.
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
        <EngineGameBoard
          play={play}
          engineName={`Stockfish · ${play.level.name}`}
          ariaLabel={`Blindfold board, ${play.game.position.turn} to move`}
          overlay={overlay}
          blindfold={blindfold}
          // Captured material would give the position away.
          showMaterial={false}
          below={
            play.started && !over ? (
              <div className="row row--between" data-testid="blindfold-bar">
                <span className="small muted">
                  {peeksLeft} peek{peeksLeft === 1 ? '' : 's'} left
                </span>
                <Button
                  size="sm"
                  onClick={peek}
                  disabled={peeking || peeksLeft === 0}
                  data-testid="blindfold-peek"
                >
                  {peeking ? 'Peeking…' : 'Peek'}
                </Button>
              </div>
            ) : null
          }
        />

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>{play.started ? `Stockfish · ${play.level.name}` : 'No game yet'}</strong>
              {play.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
            </div>
            <p
              className="small muted"
              style={{ margin: '4px 0 0' }}
              data-testid="blindfold-scoring"
            >
              {BLINDFOLD_SCORING}
              {best ? ` Best: ${best.best} — ${best.detail ?? ''}.` : ''}
            </p>
          </Card>
          <GameMoves play={play} />
        </aside>
      </div>
    </div>
  );
}

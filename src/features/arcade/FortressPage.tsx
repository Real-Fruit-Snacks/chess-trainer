import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Spinner,
  Stat,
  LinkButton,
} from '@/components/ui';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import {
  AnalyzeGameButton,
  EngineLevelField,
  FocusToggle,
  GameExportButtons,
} from './arcadeControls';
import { useArcadeFocus } from './arcadeGame';
import {
  describeTier,
  formatEval,
  FORTRESS_SCORING,
  fortressScore,
  fortressScoreDetail,
  health,
  HOLD_MOVES,
  LIVES,
} from './fortress';
import { describeGame, fortressTier } from './positions';
import { useFortress } from './useFortress';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useFocusBoardAfterSetup } from '@/components/setup/useFocusBoardAfterSetup';
import { getLevel } from '@/engine/levels';
import '@/features/play/play.css';
import './arcade.css';

/** No pieces: the board before the first position of a run. */
const EMPTY_BOARD = '8/8/8/8/8/8/8/8 w - - 0 1';

const OUTCOME_TEXT: Record<NonNullable<ReturnType<typeof useFortress>['outcome']>, string> = {
  survived: `Held for ${HOLD_MOVES} moves. The fortress stands.`,
  drawn: 'A draw: the fortress stands.',
  won: 'You even won it. The fortress stands.',
  collapsed: 'The evaluation fell too far: the fortress collapsed.',
  mated: 'Checkmate: the fortress collapsed.',
  resigned: 'Given up: the fortress collapsed.',
};

export default function FortressPage() {
  const fortress = useFortress();
  const settings = useSettings();
  const recordArcade = useProgress((s) => s.recordArcade);
  const best = useProgress((s) => s.arcade.fortress);
  const [levelId, setLevelId] = useState(Math.min(settings.playLevel, 6));
  /** "New game": the setup card again, to choose another engine level. */
  const [settingUp, setSettingUp] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Fortress · ${siteConfig.name}`;
  }, []);

  const { position } = fortress.game;
  const { phase, current } = fortress;
  // The setup screen: before the first run, and after "New game".
  const setupShown = phase === 'idle' || settingUp;
  const boardColRef = useRef<HTMLDivElement>(null);
  useFocusBoardAfterSetup(setupShown, boardColRef);
  useArcadeFocus(phase !== 'idle' && phase !== 'over');

  const playerTurn =
    phase === 'playing' && !fortress.busy && position.turn === fortress.playerColor;
  const bar = health(fortress.cp);
  const barClass = bar < 0.34 ? 'arcade__health--low' : bar < 0.67 ? 'arcade__health--mid' : '';
  const evaluation = formatEval(fortress.cp);

  /** A run against the chosen level (Play again keeps it). */
  const begin = () => {
    recordedRef.current = false;
    setSettingUp(false);
    fortress.startRun(levelId);
  };

  useEffect(() => {
    if (phase !== 'over' || recordedRef.current) return;
    recordedRef.current = true;
    const score = fortressScore(fortress.held, fortress.level.id);
    setLastScore(score);
    recordArcade(
      'fortress',
      score,
      fortressScoreDetail(fortress.held, fortress.level.id, fortress.level.name),
    );
  }, [phase, fortress.held, fortress.level.id, fortress.level.name, recordArcade]);

  const tier = current ? fortressTier(current) : null;
  // While setting up, the level chosen; during a run, the level it is played at.
  const engineName = `Stockfish · ${(setupShown ? getLevel(levelId) : fortress.level).name}`;
  const opponentColor = fortress.playerColor === 'white' ? 'black' : 'white';

  const setupScreen = (
    <SetupScreen
      intro={`You start clearly worse. Hold the position for ${HOLD_MOVES} moves — or reach a draw — and it counts; if the evaluation drops too far, it falls. ${LIVES} lives, and the positions get harder as you go.`}
      onStart={begin}
      startDisabled={fortress.engineStatus === 'error' || fortress.pool.length === 0}
      startTestId="fortress-start"
      focusOnMount={settingUp}
      back={settingUp ? { label: 'Back to the board', onClick: () => setSettingUp(false) } : null}
    >
      <EngineLevelField value={levelId} onChange={setLevelId} testId="fortress-level" describe />
      <p className="small muted setup__note">
        {FORTRESS_SCORING}
        {best ? ` Your best: ${best.detail}.` : ''}
      </p>
    </SetupScreen>
  );

  const overlay = setupShown ? null : phase === 'held' || phase === 'fallen' ? (
    <Card className="arcade__summary" data-testid="fortress-outcome">
      <h2>{phase === 'held' ? 'Held!' : 'Fallen'}</h2>
      <p className="muted">
        {fortress.outcome ? OUTCOME_TEXT[fortress.outcome] : ''}{' '}
        {phase === 'fallen'
          ? `${fortress.lives} ${fortress.lives === 1 ? 'life' : 'lives'} left.`
          : `${fortress.held} held so far.`}
      </p>
      <div className="row arcade__summary-actions">
        <Button variant="primary" onClick={fortress.nextPosition} data-testid="fortress-next">
          Next position
        </Button>
        <AnalyzeGameButton pgn={fortress.pgn} orientation={fortress.playerColor} />
      </div>
    </Card>
  ) : phase === 'over' ? (
    <Card className="arcade__summary" data-testid="fortress-result">
      <h2>Run over</h2>
      <div className="arcade__scoreline">
        <Stat value={fortress.held} label="Positions held" />
        <Stat value={lastScore} label="Score" />
        <Stat value={best ? Math.max(best.best, lastScore) : lastScore} label="Best" />
      </div>
      <p className="muted">
        {fortress.outcome ? OUTCOME_TEXT[fortress.outcome] : ''} Against Level {fortress.level.id} ·{' '}
        {fortress.level.name}.
      </p>
      <div className="row arcade__summary-actions">
        <Button
          variant="primary"
          onClick={begin}
          title="A new run at the same engine level"
          data-testid="fortress-again"
        >
          Play again
        </Button>
        <Button onClick={() => setSettingUp(true)} data-testid="fortress-new">
          New game
        </Button>
        <AnalyzeGameButton pgn={fortress.pgn} orientation={fortress.playerColor} />
        <LinkButton to="/arcade">Arcade</LinkButton>
      </div>
    </Card>
  ) : null;

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Fortress
        </p>
        <h1>Fortress</h1>
        <p>
          Hold a worse position. The evaluation is your health bar: keep it above the line for{' '}
          {HOLD_MOVES} moves and the position counts as held.
        </p>
      </div>

      {fortress.engineStatus === 'error' ? (
        <Alert tone="danger" role="alert">
          The engine could not start: {fortress.engineError?.message}{' '}
          <Button size="sm" onClick={() => void fortress.retryEngine()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      <div className={setupShown ? 'trainer trainer--setup' : 'trainer'}>
        <div className="play__boardcol" ref={boardColRef}>
          <PlayerBar
            name={engineName}
            color={opponentColor}
            fen={position.fen}
            thinking={fortress.busy === 'opponent'}
            showMaterial={false}
          />
          <div className="trainer__board">
            {setupShown ? (
              // The positions are drawn as the run goes: the board waits, empty, until then.
              <Board
                fen={EMPTY_BOARD}
                orientation="white"
                viewOnly
                ariaLabel="The board, empty until the first position is set up"
              />
            ) : (
              <Board
                fen={position.fen}
                orientation={fortress.playerColor}
                turnColor={position.turn}
                movableColor={playerTurn ? fortress.playerColor : undefined}
                dests={playerTurn ? position.dests : new Map()}
                lastMove={position.lastMove}
                check={position.inCheck}
                onMove={(from, to) => fortress.playerMove(from, to)}
                ariaLabel={`Fortress board, ${position.turn} to move`}
              />
            )}
            {fortress.game.pendingPromotion ? (
              <PromotionPicker
                color={fortress.game.pendingPromotion.color}
                onSelect={fortress.resolvePromotion}
              />
            ) : null}
            {overlay ? <div className="trainer__overlay">{overlay}</div> : null}
          </div>
          <PlayerBar
            name="You"
            color={fortress.playerColor}
            fen={position.fen}
            thinking={fortress.busy === 'grading'}
            showMaterial={false}
          />
        </div>

        <aside className="trainer__panel stack">
          {setupShown ? (
            setupScreen
          ) : (
            <>
              <Card>
                <div className="row row--between">
                  <strong>{current ? `Position ${fortress.held + 1}` : 'Fortress'}</strong>
                  <span className="row">
                    {tier ? <Badge>{describeTier(tier)}</Badge> : null}
                    {fortress.engineStatus === 'loading' ? (
                      <Spinner label="Loading engine" />
                    ) : null}
                  </span>
                </div>
                {current ? (
                  <p className="small muted" style={{ margin: '4px 0 0' }}>
                    {describeGame(current)}. You defend as {fortress.playerColor}.
                  </p>
                ) : null}
                <div
                  className={`arcade__health ${barClass}`}
                  role="progressbar"
                  aria-label="Health"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(bar * 100)}
                  aria-valuetext={`${Math.round(bar * 100)}%, evaluation ${evaluation}`}
                  data-testid="fortress-health"
                >
                  <span style={{ width: `${bar * 100}%` }} />
                </div>
                <div className="arcade__scoreline arcade__scoreline--panel">
                  <Stat value={`${fortress.movesMade}/${HOLD_MOVES}`} label="Moves held" />
                  <Stat
                    value={<span data-testid="fortress-eval">{evaluation}</span>}
                    label="Evaluation"
                  />
                  <Stat value={fortress.lives} label="Lives" />
                </div>
                <p
                  className={`arcade__status${phase === 'playing' ? '' : ' arcade__status--idle'}`}
                  role="status"
                  data-testid="fortress-status"
                >
                  {phase === 'playing'
                    ? fortress.busy === 'opponent'
                      ? 'The attacker is thinking…'
                      : fortress.busy === 'grading'
                        ? 'Measuring the damage…'
                        : 'Your move. Hold on.'
                    : ''}
                </p>
                <div className="row arcade__game-actions">
                  {phase === 'playing' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmGiveUp(true)}
                      data-testid="fortress-give-up"
                    >
                      Give up this position
                    </Button>
                  ) : null}
                  <FocusToggle />
                </div>
              </Card>
              <Card>
                <MoveList
                  moves={position.history}
                  currentPly={position.history.length}
                  startsWithBlack={position.startFen.split(' ')[1] === 'b'}
                  startMoveNumber={Number(position.startFen.split(' ')[5] ?? 1)}
                />
                <div className="row arcade__game-actions">
                  <GameExportButtons
                    pgn={fortress.pgn}
                    orientation={fortress.playerColor}
                    disabled={position.history.length === 0}
                  />
                </div>
              </Card>
            </>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmGiveUp && phase === 'playing'}
        title="Give up this position?"
        confirmLabel="Give up"
        cancelLabel="Keep defending"
        danger
        onConfirm={fortress.giveUp}
        onClose={() => setConfirmGiveUp(false)}
      >
        <p className="muted">
          It counts as fallen and costs a life:{' '}
          {fortress.lives <= 1
            ? 'it is your last, so the run ends.'
            : `${fortress.lives - 1} ${fortress.lives - 1 === 1 ? 'life' : 'lives'} left after this.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}

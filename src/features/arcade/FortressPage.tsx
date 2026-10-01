import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Select,
  Spinner,
  Stat,
  LinkButton,
} from '@/components/ui';
import { ENGINE_LEVELS } from '@/engine/levels';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { describeTier, fortressScoreDetail, health, HOLD_MOVES, LIVES } from './fortress';
import { describeGame, fortressTier } from './positions';
import { useFortress } from './useFortress';
import '@/features/play/play.css';
import './arcade.css';

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
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Fortress · ${siteConfig.name}`;
  }, []);

  const { position } = fortress.game;
  const { phase, current } = fortress;
  const playerTurn =
    phase === 'playing' && !fortress.busy && position.turn === fortress.playerColor;
  const bar = health(fortress.cp);
  const barClass = bar < 0.34 ? 'arcade__health--low' : bar < 0.67 ? 'arcade__health--mid' : '';

  const begin = () => {
    recordedRef.current = false;
    fortress.startRun(levelId);
  };

  useEffect(() => {
    if (phase !== 'over' || recordedRef.current) return;
    recordedRef.current = true;
    recordArcade(
      'fortress',
      fortress.held,
      fortressScoreDetail(fortress.held, fortress.level.name),
    );
  }, [phase, fortress.held, fortress.level.name, recordArcade]);

  const tier = current ? fortressTier(current) : null;
  const engineName = `Stockfish · ${fortress.level.name}`;
  const opponentColor = fortress.playerColor === 'white' ? 'black' : 'white';

  const overlay =
    phase === 'idle' ? (
      <Card className="arcade__summary">
        <h2>Fortress</h2>
        <p className="muted">
          You start clearly worse. Hold the position for {HOLD_MOVES} moves — or reach a draw — and
          it counts. If the evaluation drops too far, it falls. {LIVES} lives, positions get harder
          as you go. {fortress.pool.length} positions in the pool.
        </p>
        <div className="stack" style={{ textAlign: 'left' }}>
          <Field label="The attacker">
            {(id) => (
              <Select
                id={id}
                value={levelId}
                onChange={(e) => setLevelId(Number(e.target.value))}
                data-testid="fortress-level"
              >
                {ENGINE_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    Level {l.id} · {l.name} (~{l.approxElo})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {best ? <p className="small muted">Best: {best.detail}</p> : null}
        <div className="row" style={{ marginTop: 12 }}>
          <Button
            variant="primary"
            size="lg"
            onClick={begin}
            disabled={fortress.engineStatus === 'error' || fortress.pool.length === 0}
            data-testid="fortress-start"
          >
            Start
          </Button>
        </div>
      </Card>
    ) : phase === 'held' || phase === 'fallen' ? (
      <Card className="arcade__summary" data-testid="fortress-outcome">
        <h2>{phase === 'held' ? 'Held!' : 'Fallen'}</h2>
        <p className="muted">
          {fortress.outcome ? OUTCOME_TEXT[fortress.outcome] : ''}{' '}
          {phase === 'fallen'
            ? `${fortress.lives} ${fortress.lives === 1 ? 'life' : 'lives'} left.`
            : `${fortress.held} held so far.`}
        </p>
        <div className="row">
          <Button variant="primary" onClick={fortress.nextPosition} data-testid="fortress-next">
            Next position
          </Button>
          {current ? (
            <LinkButton to={`/analyze?fen=${encodeURIComponent(current.fen)}`}>
              Analyze it
            </LinkButton>
          ) : null}
        </div>
      </Card>
    ) : phase === 'over' ? (
      <Card className="arcade__summary" data-testid="fortress-result">
        <h2>Run over</h2>
        <div className="arcade__scoreline">
          <Stat value={fortress.held} label="Positions held" />
          <Stat value={best ? Math.max(best.best, fortress.held) : fortress.held} label="Best" />
        </div>
        <p className="muted">
          {fortress.outcome ? OUTCOME_TEXT[fortress.outcome] : ''} Against {fortress.level.name}.
        </p>
        <div className="row">
          <Button variant="primary" onClick={begin}>
            New run
          </Button>
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

      <div className="trainer">
        <div className="play__boardcol">
          <PlayerBar
            name={engineName}
            color={opponentColor}
            fen={position.fen}
            thinking={fortress.busy === 'opponent'}
            showMaterial={false}
          />
          <div className="trainer__board" style={{ position: 'relative' }}>
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
          <Card>
            <div className="row row--between">
              <strong>{current ? `Position ${fortress.held + 1}` : 'Fortress'}</strong>
              <span className="row">
                {tier ? <Badge>{describeTier(tier)}</Badge> : null}
                {fortress.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
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
              data-testid="fortress-health"
            >
              <span style={{ width: `${bar * 100}%` }} />
            </div>
            <div className="arcade__scoreline" style={{ margin: '8px 0 0' }}>
              <Stat value={`${fortress.movesMade}/${HOLD_MOVES}`} label="Moves held" />
              <Stat value={(fortress.cp / 100).toFixed(1)} label="Evaluation" />
              <Stat value={fortress.lives} label="Lives" />
            </div>
            <p className="arcade__status" role="status" data-testid="fortress-status">
              {phase === 'playing'
                ? fortress.busy === 'opponent'
                  ? 'The attacker is thinking…'
                  : fortress.busy === 'grading'
                    ? 'Measuring the damage…'
                    : 'Your move. Hold on.'
                : ''}
            </p>
            {phase === 'playing' ? (
              <Button size="sm" variant="ghost" onClick={fortress.giveUp}>
                Give up this position
              </Button>
            ) : null}
          </Card>
          <Card>
            <MoveList
              moves={position.history}
              currentPly={position.history.length}
              onSelectPly={() => undefined}
              startsWithBlack={position.startFen.split(' ')[1] === 'b'}
              startMoveNumber={Number(position.startFen.split(' ')[5] ?? 1)}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

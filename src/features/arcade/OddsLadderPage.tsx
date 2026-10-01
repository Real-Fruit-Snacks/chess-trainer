import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Icon, Spinner, LinkButton } from '@/components/ui';
import { usePlayVsEngine } from '@/features/play/usePlayVsEngine';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { EngineGameBoard, GameMoves } from './EngineGameBoard';
import { advanceOdds, describeRung, ODDS_RUNGS, oddsFen } from './odds';
import '@/features/play/play.css';
import './arcade.css';

/** Full strength: the top engine level. */
const ENGINE_LEVEL_ID = 8;

export default function OddsLadderPage() {
  const play = usePlayVsEngine();
  const ladder = useProgress((s) => s.oddsLadder);
  const setOddsLadder = useProgress((s) => s.setOddsLadder);
  const [rungIndex, setRungIndex] = useState(ladder.rung);
  const [confirmResign, setConfirmResign] = useState(false);
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Odds Ladder · ${siteConfig.name}`;
  }, []);

  const begin = (index: number) => {
    const rung = ODDS_RUNGS[index];
    if (!rung) return;
    setRungIndex(index);
    recordedRef.current = false;
    setConfirmResign(false);
    play.start({
      color: 'white',
      levelId: ENGINE_LEVEL_ID,
      timeControlId: 'none',
      fen: oddsFen(rung),
      opponent: 'engine',
      coach: false,
    });
  };

  // The ladder moves once per finished game.
  useEffect(() => {
    if (!play.gameOver || recordedRef.current) return;
    recordedRef.current = true;
    setOddsLadder(advanceOdds(useProgress.getState().oddsLadder, rungIndex, play.gameOver.verdict));
  }, [play.gameOver, rungIndex, setOddsLadder]);

  const rung = ODDS_RUNGS[rungIndex];
  const over = play.gameOver;
  const climbed = over?.verdict === 'win' && rungIndex === ladder.rung - 1;
  const atTop = ladder.rung === ODDS_RUNGS.length - 1;

  const overlay = !play.started ? (
    <Card className="arcade__summary">
      <h2>{describeRung(ladder.rung)}</h2>
      <p className="muted">
        {ODDS_RUNGS[ladder.rung]?.handicap} You play White against Stockfish at full strength. Win
        to climb.
      </p>
      <div className="row">
        <Button
          variant="primary"
          size="lg"
          onClick={() => begin(ladder.rung)}
          disabled={play.engineStatus === 'error'}
          data-testid="odds-start"
        >
          Start
        </Button>
      </div>
    </Card>
  ) : over ? (
    <Card className="arcade__summary" data-testid="odds-result">
      <h2>
        {over.verdict === 'win' ? 'You win' : over.verdict === 'draw' ? 'Draw' : 'The engine wins'}
      </h2>
      <p className="muted">
        {over.reason.charAt(0).toUpperCase() + over.reason.slice(1)}.{' '}
        {climbed
          ? atTop
            ? 'You have climbed the whole ladder: the engine now plays a level game.'
            : `You climb to ${describeRung(ladder.rung)}.`
          : over.verdict === 'win'
            ? 'A win on a lower rung; the ladder stays where it is.'
            : 'The ladder stays where it is. Try again.'}
      </p>
      <div className="row">
        <Button variant="primary" onClick={() => begin(ladder.rung)} data-testid="odds-next">
          {climbed ? 'Next rung' : 'Play again'}
        </Button>
        <LinkButton to="/arcade">Arcade</LinkButton>
      </div>
    </Card>
  ) : null;

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Odds Ladder
        </p>
        <h1>Odds Ladder</h1>
        <p>
          Full-strength Stockfish gives you a head start. Beat it and the head start shrinks: queen,
          rook, knight, bishop, pawn — then a level game.
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
          engineName="Stockfish (full strength)"
          ariaLabel={`Odds ladder board, ${play.game.position.turn} to move`}
          overlay={overlay}
          showMaterial={false}
        />

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>{play.started && rung ? describeRung(rungIndex) : 'Odds Ladder'}</strong>
              {play.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
            </div>
            {play.started && rung ? (
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                {rung.handicap} No take-backs, no hints: a win has to be earned.
              </p>
            ) : null}
            <ol className="ladder__rungs" data-testid="odds-rungs" style={{ marginTop: 12 }}>
              {ODDS_RUNGS.map((r, i) => {
                const results = ladder.results[i];
                const state =
                  i < ladder.rung ? 'climbed' : i === ladder.rung ? 'current' : 'locked';
                return (
                  <li
                    key={r.id}
                    className={`ladder__rung ladder__rung--${state}`}
                    data-testid={`odds-rung-${i}`}
                  >
                    <span className="row">
                      {state === 'climbed' ? (
                        <Icon name="check" size={16} title="Climbed" />
                      ) : (
                        <Icon name="circle" size={16} />
                      )}
                      <span>
                        <strong>{r.name}</strong>
                        {results ? (
                          <span className="small muted">
                            {' '}
                            · {results.wins}W {results.losses}L
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="row">
                      {state === 'current' ? <Badge tone="accent">Current</Badge> : null}
                      {state !== 'locked' && (!play.started || play.gameOver) ? (
                        <Button size="sm" variant="ghost" onClick={() => begin(i)}>
                          Play
                        </Button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>

          <GameMoves
            play={play}
            onResign={() => setConfirmResign(true)}
            extra={
              confirmResign && play.started && !play.gameOver ? (
                <>
                  <span className="small muted">Resign?</span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      play.resign();
                      setConfirmResign(false);
                    }}
                  >
                    Yes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmResign(false)}>
                    No
                  </Button>
                </>
              ) : null
            }
          />
        </aside>
      </div>
    </div>
  );
}

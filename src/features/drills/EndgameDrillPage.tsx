import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { MoveList } from '@/components/chess/MoveList';
import { Alert, Button, Card, Spinner, Stat } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { type EndgameDrill, getDrill } from './endgameDrills';
import { useDrillGame } from './useDrillGame';
import '@/features/play/play.css';
import './drills.css';

export default function EndgameDrillPage() {
  const { drillId = '' } = useParams<{ drillId: string }>();
  const drill = getDrill(drillId);

  useEffect(() => {
    document.title = `${drill?.title ?? 'Drill'} · ${siteConfig.name}`;
  }, [drill]);

  if (!drill) {
    return (
      <div>
        <div className="page-header">
          <h1>Drill not found</h1>
          <p>
            <Link to="/drills">Back to all drills</Link>
          </p>
        </div>
      </div>
    );
  }

  return <DrillGame key={drill.id} drill={drill} />;
}

function DrillGame({ drill }: { drill: EndgameDrill }) {
  const game = useDrillGame();
  const best = useProgress((s) => s.drills[drill.id]);
  const { position } = game.game;
  const userColor = drill.color;
  const engineColor = userColor === 'white' ? 'black' : 'white';
  const playerTurn = game.phase === 'playing' && position.turn === userColor && !game.thinking;
  const startsWithBlack = (game.startFen ?? '').split(' ')[1] === 'b';
  const startMoveNumber = Number((game.startFen ?? '').split(' ')[5] ?? 1);

  return (
    <div>
      <div className="page-header">
        <p className="card__eyebrow">
          <Link to="/drills">Drills</Link> / {drill.group}
        </p>
        <h1>{drill.title}</h1>
        <p>{drill.description}</p>
      </div>

      {game.engineStatus === 'error' ? (
        <Alert tone="danger" role="alert">
          The engine could not start: {game.engineError?.message}{' '}
          <Button size="sm" onClick={() => void game.retryEngine()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      <div className="trainer">
        <div className="play__boardcol">
          <PlayerBar
            name={`Stockfish (full strength)`}
            color={engineColor}
            fen={position.fen}
            thinking={game.thinking}
            showMaterial={false}
          />
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={position.fen}
              orientation={userColor}
              turnColor={position.turn}
              movableColor={playerTurn ? userColor : undefined}
              dests={playerTurn ? position.dests : new Map()}
              lastMove={position.lastMove}
              check={position.inCheck}
              autoShapes={game.hintShapes}
              onMove={(from, to) => game.playerMove(from, to)}
              ariaLabel={`${drill.title} board, ${position.turn} to move`}
            />
            {game.game.pendingPromotion ? (
              <PromotionPicker
                color={game.game.pendingPromotion.color}
                onSelect={game.resolvePromotion}
              />
            ) : null}
            {game.phase === 'idle' ? (
              <div className="trainer__overlay">
                <Card className="drill__summary">
                  <h2 style={{ marginTop: 0 }}>{drill.title}</h2>
                  <p className="muted">
                    You play {userColor}.{' '}
                    {drill.goal === 'mate'
                      ? `Checkmate within ${drill.moveLimit} moves.`
                      : drill.goal === 'promote'
                        ? `Promote the pawn within ${drill.moveLimit} moves.`
                        : drill.goal === 'capture'
                          ? `Win the opponent's last piece (or mate) within ${drill.moveLimit} moves.`
                          : `Hold the draw for ${drill.moveLimit} moves.`}
                  </p>
                  <div className="row">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => game.start(drill)}
                      disabled={game.engineStatus === 'error'}
                    >
                      Start
                    </Button>
                  </div>
                </Card>
              </div>
            ) : null}
            {game.result ? (
              <div className="trainer__overlay">
                <Card className="drill__summary">
                  <p className="card__eyebrow">
                    {game.result.outcome === 'won' ? 'Well done' : 'Not this time'}
                  </p>
                  <h2 style={{ margin: '4px 0' }}>{game.result.reason}</h2>
                  <p className="muted">
                    {game.result.moves} move{game.result.moves === 1 ? '' : 's'} played
                    {best?.detail && game.result.outcome === 'won' ? ` · best: ${best.detail}` : ''}
                  </p>
                  <div className="row">
                    <Button variant="primary" onClick={() => game.start(drill)}>
                      New position
                    </Button>
                    <Button onClick={game.restart}>Same position</Button>
                    <Link className="btn" to="/drills">
                      All drills
                    </Link>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
          <PlayerBar name="You" color={userColor} fen={position.fen} showMaterial={false} />
        </div>

        <aside className="trainer__panel stack">
          <Card>
            {game.engineStatus === 'loading' ? (
              <p className="small muted" style={{ margin: '0 0 8px' }}>
                <Spinner label="Loading engine" /> Loading engine…
              </p>
            ) : null}
            <div className="drill__hud">
              <Stat value={game.userMoves} label={`Moves (limit ${drill.moveLimit})`} />
              <Stat value={best?.best ? (best.detail ?? 'Done') : '–'} label="Best" />
              <Stat value={best?.attempts ?? 0} label="Attempts" />
            </div>
            <div className="puzzle-actions">
              <Button
                onClick={game.hint}
                disabled={!playerTurn || game.hinting || game.engineStatus !== 'ready'}
                loading={game.hinting}
              >
                Hint
              </Button>
              <Button variant="ghost" onClick={game.giveUp} disabled={game.phase !== 'playing'}>
                Give up
              </Button>
              {game.startFen ? (
                <Link
                  className="btn btn--ghost"
                  to={`/analyze?fen=${encodeURIComponent(position.fen)}`}
                >
                  Analyze
                </Link>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="drill__tip">
              <strong>Technique.</strong> {drill.tip}
            </div>
          </Card>

          <Card>
            <MoveList
              moves={position.history}
              currentPly={position.history.length}
              onSelectPly={() => undefined}
              startsWithBlack={startsWithBlack}
              startMoveNumber={startMoveNumber}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

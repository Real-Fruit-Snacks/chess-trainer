import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { MoveList } from '@/components/chess/MoveList';
import { Alert, Button, Card, Spinner, Stat, LinkButton } from '@/components/ui';
import type { LongColor } from '@/chess/types';
import { getLessonMeta } from '@/features/learn/lessonMeta';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { type EndgameDrill, getDrill } from './endgameDrills';
import { buildEndgameLadder } from './endgameLadder';
import { pickStartFen, useDrillGame } from './useDrillGame';
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
  const allResults = useProgress((s) => s.drills);
  const ladder = buildEndgameLadder(allResults);
  const rung = ladder.rungs.find((r) => r.drill.id === drill.id);
  const nextRung = ladder.rungs.find((r) => !r.done && r.drill.id !== drill.id) ?? null;
  const lesson = drill.lessonId ? getLessonMeta(drill.lessonId) : undefined;
  // `?pos=N` starts from the drill's N-th fixed position (links from lessons and tests).
  const [searchParams] = useSearchParams();
  const requested = Number(searchParams.get('pos'));
  const fixedStart =
    drill.positions !== 'random' && Number.isInteger(requested) && requested >= 0
      ? drill.positions[requested]
      : undefined;
  // The board shows the position that Start will use, so the task is visible before playing.
  const [preview] = useState(() => fixedStart ?? pickStartFen(drill));
  const begin = () => game.start(drill, preview);
  const { position } = game.game;
  const shownFen = game.phase === 'idle' ? preview : position.fen;
  const shownTurn: LongColor = shownFen.split(' ')[1] === 'b' ? 'black' : 'white';
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
          {rung ? ` · Rung ${rung.rung} of ${ladder.total}` : ''}
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
            fen={shownFen}
            thinking={game.thinking}
            showMaterial={false}
          />
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={shownFen}
              orientation={userColor}
              turnColor={shownTurn}
              movableColor={playerTurn ? userColor : undefined}
              dests={playerTurn ? position.dests : new Map()}
              lastMove={position.lastMove}
              check={position.inCheck}
              autoShapes={game.hintShapes}
              onMove={(from, to) => game.playerMove(from, to)}
              ariaLabel={`${drill.title} board, ${shownTurn} to move`}
            />
            {game.game.pendingPromotion ? (
              <PromotionPicker
                color={game.game.pendingPromotion.color}
                onSelect={game.resolvePromotion}
              />
            ) : null}
            {game.phase === 'idle' ? (
              <div className="trainer__overlay">
                <Card className="summary">
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
                      onClick={begin}
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
                <Card className="summary">
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
                    {game.result.outcome === 'won' && nextRung ? (
                      <LinkButton
                        to={`/drills/endgame/${nextRung.drill.id}`}
                        data-testid="drill-next-rung"
                      >
                        Next rung: {nextRung.drill.title}
                      </LinkButton>
                    ) : (
                      <LinkButton to="/drills">All drills</LinkButton>
                    )}
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
          <PlayerBar name="You" color={userColor} fen={shownFen} showMaterial={false} />
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
                <LinkButton variant="ghost" to={`/analyze?fen=${encodeURIComponent(position.fen)}`}>
                  Analyze
                </LinkButton>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="drill__tip">
              <strong>Technique.</strong> {drill.tip}
            </div>
            {lesson ? (
              <p className="small" style={{ margin: '8px 0 0' }}>
                Theory: <Link to={`/learn/${lesson.id}`}>{lesson.title}</Link>
              </p>
            ) : null}
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

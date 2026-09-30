import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { TreeMoveList } from '@/components/chess/TreeMoveList';
import { Alert, Button, Card, Kbd, Stat, Switch } from '@/components/ui';
import { GameTree } from '@/chess/tree';
import { describeDue } from '@/lib/srs';
import { useNow } from '@/lib/useNow';
import { siteConfig } from '@/site.config';
import { cardsFor, useRepertoire } from '@/store/repertoire';
import { cardKey, isLearnerMove, repertoireStats } from './model';
import { getBuiltInRepertoire, type Repertoire } from './repertoires';
import { useRepertoireTrainer } from './useRepertoireTrainer';
import './openings.css';

export default function RepertoirePage() {
  const { repertoireId = '' } = useParams<{ repertoireId: string }>();
  const custom = useRepertoire((s) => s.custom);
  const repertoire: Repertoire | undefined = useMemo(() => {
    const builtIn = getBuiltInRepertoire(repertoireId);
    if (builtIn) return builtIn;
    const own = custom.find((c) => c.id === repertoireId);
    return own
      ? {
          id: own.id,
          name: own.name,
          color: own.color,
          line: 'Custom repertoire',
          description: 'Imported from your own PGN.',
          level: 'intermediate',
          pgn: own.pgn,
        }
      : undefined;
  }, [repertoireId, custom]);

  useEffect(() => {
    document.title = `${repertoire?.name ?? 'Repertoire'} · ${siteConfig.name}`;
  }, [repertoire]);

  if (!repertoire) {
    return (
      <div>
        <div className="page-header">
          <h1>Repertoire not found</h1>
          <p>
            <Link to="/openings">Back to openings</Link>
          </p>
        </div>
      </div>
    );
  }
  return <RepertoireTrainer key={repertoire.id} repertoire={repertoire} />;
}

function RepertoireTrainer({ repertoire }: { repertoire: Repertoire }) {
  const tree = useMemo(() => GameTree.fromPgn(repertoire.pgn), [repertoire.pgn]);
  const trainer = useRepertoireTrainer(repertoire.id, tree, repertoire.color);
  const allCards = useRepertoire((s) => s.cards);
  const resetRepertoire = useRepertoire((s) => s.resetRepertoire);
  const cards = useMemo(() => cardsFor(allCards, repertoire.id), [allCards, repertoire.id]);
  const now = useNow();
  const stats = useMemo(
    () => repertoireStats(tree, repertoire.color, cards, now),
    [tree, repertoire.color, cards, now],
  );
  const [explore, setExplore] = useState(false);
  const [exploreVersion, setExploreVersion] = useState(0);

  // Keyboard: space/enter shows the move, n = next line.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === ' ' && trainer.phase === 'learner') {
        e.preventDefault();
        trainer.showMove();
      }
      if (e.key === 'n' && trainer.phase === 'lineDone') trainer.nextLine();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trainer]);

  const { board, phase } = trainer;
  const learnerTurn = phase === 'learner';
  const currentNode = trainer.line[trainer.index];
  const currentCard =
    currentNode && isLearnerMove(currentNode, repertoire.color)
      ? cards[cardKey(currentNode)]
      : undefined;
  const lineSan = trainer.line.map((n, i) => {
    const number = n.parent?.fen.split(' ')[5] ?? '1';
    const white = n.parent?.fen.split(' ')[1] === 'w';
    return `${white ? `${number}. ` : i === 0 ? `${number}... ` : ''}${n.san}`;
  });

  const status = (() => {
    switch (phase) {
      case 'idle':
        return stats.learned === 0
          ? 'Nothing learned yet — start with the main lines.'
          : stats.due > 0
            ? `${stats.due} move${stats.due === 1 ? '' : 's'} due for review${stats.fresh ? ` and ${stats.fresh} new to learn` : ''}.`
            : stats.fresh > 0
              ? `${stats.fresh} new move${stats.fresh === 1 ? '' : 's'} left to learn.`
              : `All caught up. Next review ${describeDue(
                  Object.values(cards).sort((a, b) => a.due - b.due)[0],
                  now,
                )}.`;
      case 'opponent':
        return 'Opponent plays…';
      case 'learner':
        return trainer.showing
          ? currentCard && currentCard.reps > 0
            ? 'Play the move shown.'
            : 'New move — play the arrow to learn it.'
          : 'Your move. What does the repertoire say?';
      case 'lineDone':
        return `Line complete: ${trainer.lineResult.correct}/${trainer.lineResult.total} recalled.`;
      case 'sessionDone':
        return trainer.session.total
          ? `Session over: ${trainer.session.correct}/${trainer.session.total} moves recalled across ${trainer.session.lines} line${trainer.session.lines === 1 ? '' : 's'}.`
          : 'Nothing due right now. Switch off “due only” to practise anyway.';
      default:
        return '';
    }
  })();

  return (
    <div>
      <div className="page-header">
        <p className="card__eyebrow">
          <Link to="/openings">Openings</Link> / {repertoire.color}
        </p>
        <h1>{repertoire.name}</h1>
        <p>{repertoire.description}</p>
      </div>

      <div className="trainer">
        <div className="trainer__board" style={{ position: 'relative' }}>
          {explore ? (
            <ExploreBoard tree={tree} color={repertoire.color} version={exploreVersion} />
          ) : (
            <Board
              fen={board.fen}
              orientation={repertoire.color}
              turnColor={board.turn}
              movableColor={learnerTurn ? repertoire.color : undefined}
              dests={learnerTurn ? board.dests : new Map()}
              lastMove={board.lastMove}
              check={board.check}
              shapes={trainer.shapes}
              highlights={
                trainer.wrongMove ? new Map([[trainer.wrongMove[1], 'wrong']]) : undefined
              }
              onMove={(from, to) => trainer.playMove(from, to)}
              ariaLabel={`${repertoire.name} training board, ${board.turn} to move`}
            />
          )}
          {trainer.needsPromotion ? (
            <PromotionPicker color={repertoire.color} onSelect={trainer.resolvePromotion} />
          ) : null}
          {!explore && (phase === 'idle' || phase === 'sessionDone') ? (
            <div className="trainer__overlay">
              <Card className="drill__summary">
                {phase === 'sessionDone' ? (
                  <>
                    <p className="card__eyebrow">Session complete</p>
                    <h2 style={{ margin: '4px 0' }}>
                      {trainer.session.correct}/{trainer.session.total} recalled
                    </h2>
                  </>
                ) : (
                  <h2 style={{ marginTop: 0 }}>{repertoire.name}</h2>
                )}
                <p className="muted">{status}</p>
                <div className="row">
                  <Button variant="primary" size="lg" onClick={trainer.start}>
                    {stats.learned === 0
                      ? 'Start learning'
                      : stats.due > 0
                        ? 'Review due moves'
                        : stats.fresh > 0
                          ? 'Learn new lines'
                          : 'Practise'}
                  </Button>
                  <Button size="lg" onClick={() => setExplore(true)}>
                    Explore lines
                  </Button>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Switch
                    checked={trainer.dueOnly}
                    onChange={trainer.setDueOnly}
                    label="Due moves only"
                  />
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          {explore ? (
            <Card>
              <div className="row row--between">
                <strong>Explore</strong>
                <Button size="sm" onClick={() => setExplore(false)}>
                  Back to training
                </Button>
              </div>
              <p className="small muted">Click any move to see the position and its note.</p>
              <ExploreMoves
                tree={tree}
                onChange={() => setExploreVersion((v) => v + 1)}
                version={exploreVersion}
              />
            </Card>
          ) : (
            <>
              <Card>
                <p
                  className={`puzzle-status${phase === 'lineDone' ? ' puzzle-status--solved' : ''}`}
                  role="status"
                >
                  {status}
                </p>
                {trainer.tip ? <Alert tone="info">{trainer.tip}</Alert> : null}
                <div className="puzzle-actions">
                  {learnerTurn ? (
                    <Button onClick={trainer.showMove} disabled={trainer.showing}>
                      Show move <Kbd>Space</Kbd>
                    </Button>
                  ) : null}
                  {phase === 'lineDone' ? (
                    <Button variant="primary" onClick={trainer.nextLine}>
                      Next line <Kbd>N</Kbd>
                    </Button>
                  ) : null}
                  {phase !== 'idle' && phase !== 'sessionDone' ? (
                    <Button variant="ghost" onClick={trainer.stop}>
                      End session
                    </Button>
                  ) : null}
                </div>
                {trainer.line.length ? (
                  <p className="openings__line mono small" aria-label="Current line">
                    {lineSan.map((san, i) => (
                      <span
                        key={i}
                        className={
                          i < trainer.index
                            ? 'openings__line-played'
                            : i === trainer.index
                              ? 'openings__line-current'
                              : 'openings__line-upcoming'
                        }
                      >
                        {i < trainer.index || phase === 'lineDone'
                          ? san
                          : i === trainer.index && trainer.showing
                            ? san
                            : '·'}{' '}
                      </span>
                    ))}
                  </p>
                ) : null}
              </Card>

              <Card>
                <div className="puzzle-stats">
                  <Stat value={stats.due} label="Due" />
                  <Stat value={`${stats.learned}/${stats.total}`} label="Learned" />
                  <Stat
                    value={`${trainer.session.correct}/${trainer.session.total}`}
                    label="This session"
                  />
                </div>
                {currentCard ? (
                  <p className="small muted" style={{ margin: '8px 0 0' }}>
                    This move: seen {currentCard.reps + currentCard.lapses} time
                    {currentCard.reps + currentCard.lapses === 1 ? '' : 's'}, interval{' '}
                    {currentCard.interval} day
                    {currentCard.interval === 1 ? '' : 's'}.
                  </p>
                ) : null}
              </Card>

              <details className="small">
                <summary className="muted">Reset progress for this repertoire</summary>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => resetRepertoire(repertoire.id)}
                  style={{ marginTop: 8 }}
                >
                  Forget all {stats.total} moves
                </Button>
              </details>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Read-only board following the explore cursor. */
function ExploreBoard({
  tree,
  color,
  version,
}: {
  tree: GameTree;
  color: 'white' | 'black';
  version: number;
}) {
  const node = tree.current;
  const turn = node.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const last = node.uci ? ([node.uci.slice(0, 2), node.uci.slice(2, 4)] as [never, never]) : null;
  return (
    <Board
      key={version}
      fen={node.fen}
      orientation={color}
      turnColor={turn}
      lastMove={last}
      viewOnly
      ariaLabel="Repertoire explorer board"
    />
  );
}

function ExploreMoves({
  tree,
  onChange,
  version,
}: {
  tree: GameTree;
  onChange: () => void;
  version: number;
}) {
  return (
    <>
      <TreeMoveList
        tree={tree}
        version={version}
        current={tree.current}
        onSelect={(node) => {
          tree.goTo(node);
          onChange();
        }}
      />
      {tree.current.comment ? <Alert tone="info">{tree.current.comment}</Alert> : null}
    </>
  );
}

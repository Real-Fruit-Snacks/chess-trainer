import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Chess, type Square } from 'chess.js';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { ExplorerPanel } from '@/components/chess/ExplorerPanel';
import { TreeMoveList } from '@/components/chess/TreeMoveList';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Kbd,
  LinkButton,
  NotFound,
  Stat,
  Switch,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { isPromotionMove, legalDests, parseUci, toUci, tryMove } from '@/chess/helpers';
import { GameTree, type TreeNode } from '@/chess/tree';
import type { MoveInput, PromotionPiece, San, Uci } from '@/chess/types';
import { shareUrl } from '@/lib/shareCodes';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { describeDue, isNew } from '@/lib/srs';
import { useNow } from '@/lib/useNow';
import { siteConfig } from '@/site.config';
import { cardsFor, useRepertoire } from '@/store/repertoire';
import { cardKey, isLearnerMove, repertoireStats } from './model';
import { getBuiltInRepertoire, type Repertoire } from './repertoires';
import { useRepertoireTrainer } from './useRepertoireTrainer';
import './openings.css';
import { Notated } from '@/chess/San';

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
          description: 'Your own lines. Explore them to add moves and notes.',
          level: 'intermediate',
          openingTags: [],
          pgn: own.pgn,
        }
      : undefined;
  }, [repertoireId, custom]);

  useEffect(() => {
    document.title = `${repertoire?.name ?? 'Repertoire'} · ${siteConfig.name}`;
  }, [repertoire]);

  // A custom repertoire's PGN comes from storage (an import, a shared link, a backup): a damaged
  // one gets a way out here instead of crashing the page on every visit.
  const pgn = repertoire?.pgn;
  const parsed = useMemo(() => {
    if (pgn === undefined) return null;
    try {
      return { tree: GameTree.fromPgn(pgn), problem: null };
    } catch (err) {
      return { tree: null, problem: err instanceof Error ? err.message : String(err) };
    }
  }, [pgn]);

  if (!repertoire) {
    return (
      <NotFound title="Repertoire not found" backTo="/openings" backLabel="Back to openings">
        <p>This repertoire is not built in and is not one of your own.</p>
      </NotFound>
    );
  }
  if (!parsed?.tree) {
    return <UnreadableRepertoire repertoire={repertoire} problem={parsed?.problem ?? null} />;
  }
  return <RepertoireTrainer key={repertoire.id} repertoire={repertoire} tree={parsed.tree} />;
}

/** A stored repertoire whose PGN no longer parses: say so, and offer to copy or delete it. */
function UnreadableRepertoire({
  repertoire,
  problem,
}: {
  repertoire: Repertoire;
  problem: string | null;
}) {
  const navigate = useNavigate();
  const removeCustom = useRepertoire((s) => s.removeCustom);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCustom = repertoire.id.startsWith('custom-');
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(repertoire.pgn);
      toast('The repertoire’s text was copied to the clipboard.', { tone: 'success' });
    } catch {
      toast('Could not access the clipboard.', { tone: 'warning' });
    }
  };
  return (
    <div>
      <div className="page-header">
        <p className="card__eyebrow">
          <Link to="/openings">Openings</Link> / {colorLabel(repertoire.color)}
        </p>
        <h1>{repertoire.name}</h1>
      </div>
      <Card data-testid="repertoire-unreadable">
        <Alert tone="danger">
          This repertoire could not be read{problem ? ` (${problem})` : ''}. Its moves cannot be
          shown or trained.
        </Alert>
        <p className="small muted">
          {isCustom
            ? 'Copy its text to repair it elsewhere and import it again, or delete it.'
            : 'Reload the app; if this stays, please report it.'}
        </p>
        <div className="row">
          <Button onClick={() => void copyText()}>Copy its text</Button>
          {isCustom ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete this repertoire
            </Button>
          ) : null}
          <LinkButton variant="ghost" to="/openings">
            Back to openings
          </LinkButton>
        </div>
      </Card>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${repertoire.name}”?`}
        cancelLabel="Keep it"
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          removeCustom(repertoire.id);
          toast('Repertoire deleted.');
          void navigate('/openings');
        }}
        onClose={() => setConfirmDelete(false)}
      >
        <p className="muted">
          Its lines and your review history for them will be removed. This cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function RepertoireTrainer({ repertoire, tree }: { repertoire: Repertoire; tree: GameTree }) {
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const isCustom = repertoire.id.startsWith('custom-');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareRepertoire = async () => {
    let url: string;
    try {
      url = await shareUrl('/openings', {
        kind: 'repertoire',
        name: repertoire.name,
        color: repertoire.color,
        pgn: repertoire.pgn,
      });
    } catch {
      toast('This browser cannot make a share link.', { tone: 'warning' });
      return;
    }
    if (canShare) {
      try {
        await navigator.share({ title: repertoire.name, url });
        return;
      } catch (err) {
        // Cancelled: nothing to report. Anything else falls back to the clipboard.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — it adds this repertoire to whoever opens it.', { tone: 'success' });
    } catch {
      toast('Could not copy the link.', { tone: 'warning' });
    }
  };
  const updateCustom = useRepertoire((s) => s.updateCustom);
  // The explore cursor is a path of moves so it survives the tree being rebuilt after an edit.
  const [explorePath, setExplorePath] = useState<San[]>([]);
  const exploreNode = useMemo(() => nodeAtPath(tree, explorePath), [tree, explorePath]);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(
    null,
  );

  const selectNode = (node: TreeNode) => {
    setExplorePath(tree.pathTo(node).map((n) => n.san));
    setNoteDraft(null);
  };

  /** Applies an edit to the tree, saves it and moves the cursor to `focus` (or the returned node). */
  const commitEdit = (mutate: () => TreeNode | null | undefined) => {
    const node = mutate();
    updateCustom(repertoire.id, { pgn: tree.toPgn() });
    if (node) selectNode(node);
  };

  const addExploreMove = (input: MoveInput | San): boolean => {
    const move = tryMove(new Chess(exploreNode.fen), input);
    if (!move) {
      toast('That move is not legal here.', { tone: 'warning' });
      return false;
    }
    const uci = toUci(move);
    const existing = exploreNode.children.find((c) => c.uci === uci);
    if (existing) {
      selectNode(existing);
      return true;
    }
    if (!isCustom) {
      toast('That move is not in this repertoire. Add it to one of your own from Analyze.', {
        tone: 'info',
      });
      return false;
    }
    commitEdit(() => {
      tree.goTo(exploreNode);
      return tree.addMove(input, { navigate: false });
    });
    return true;
  };

  const onExploreMove = (from: Square, to: Square) => {
    if (isPromotionMove(new Chess(exploreNode.fen), from, to)) {
      setPendingPromotion({ from, to });
      return;
    }
    addExploreMove({ from, to });
  };

  const resolveExplorePromotion = (piece: PromotionPiece | null) => {
    const pending = pendingPromotion;
    setPendingPromotion(null);
    if (!pending || !piece) return;
    addExploreMove({ from: pending.from, to: pending.to, promotion: piece });
  };

  const onExplorerPlay = (uci: Uci) => {
    addExploreMove(parseUci(uci));
  };

  const saveNote = () => {
    if (noteDraft === null) return;
    const text = noteDraft.trim();
    commitEdit(() => {
      exploreNode.comment = text ? text : undefined;
      return exploreNode;
    });
    setNoteDraft(null);
  };

  const deleteFromHere = () => {
    const parent = exploreNode.parent;
    if (!parent) return;
    commitEdit(() => {
      tree.deleteNode(exploreNode);
      return parent;
    });
    toast('Line removed.');
  };

  const makeMainLine = () => {
    commitEdit(() => {
      tree.promoteToMain(exploreNode);
      return exploreNode;
    });
  };

  const exploreDests = useMemo(
    () =>
      explore && isCustom ? legalDests(new Chess(exploreNode.fen)) : new Map<Square, Square[]>(),
    [explore, isCustom, exploreNode],
  );

  // Keyboard: Space shows the move, N = next line. The shared rule: either case, never with a
  // modifier, never from a field, a dialog or the board (role="application"), which types squares.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // N is a single-key shortcut (off with the setting); Space keeps working.
      const key = pageShortcutKey(e);
      if (key === ' ' && trainer.phase === 'learner') {
        e.preventDefault();
        trainer.showMove();
      }
      if (key === 'n' && trainer.phase === 'lineDone') trainer.nextLine();
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
  /** Moves of the current line already revealed: those played, and the one being shown. */
  const lineMoveShown = (i: number) =>
    i < trainer.index || phase === 'lineDone' || (i === trainer.index && trainer.showing);
  const hiddenMoves = trainer.line.filter((_, i) => !lineMoveShown(i)).length;
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
          ? isNew(currentCard)
            ? 'New move — play the arrow to learn it.'
            : 'Play the move shown.'
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
          <Link to="/openings">Openings</Link> / {colorLabel(repertoire.color)}
        </p>
        <h1>{repertoire.name}</h1>
        <p>{repertoire.description}</p>
      </div>

      <div className="trainer">
        <div className="trainer__board" style={{ position: 'relative' }}>
          {explore ? (
            <ExploreBoard
              node={exploreNode}
              color={repertoire.color}
              editable={isCustom}
              dests={exploreDests}
              onMove={onExploreMove}
            />
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
          {trainer.needsPromotion && !explore ? (
            <PromotionPicker color={repertoire.color} onSelect={trainer.resolvePromotion} />
          ) : null}
          {pendingPromotion ? (
            <PromotionPicker
              color={exploreNode.fen.split(' ')[1] === 'b' ? 'black' : 'white'}
              onSelect={resolveExplorePromotion}
            />
          ) : null}
          {!explore && (phase === 'idle' || phase === 'sessionDone') ? (
            <div className="trainer__overlay">
              <Card className="summary">
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
                    {isCustom ? 'Edit lines' : 'Explore lines'}
                  </Button>
                  <LinkButton size="lg" to={`/play?book=${encodeURIComponent(repertoire.id)}`}>
                    Practise in a game
                  </LinkButton>
                  <Button size="lg" variant="ghost" onClick={() => void shareRepertoire()}>
                    {canShare ? 'Share' : 'Copy link'}
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
            <>
              <Card data-testid="explore-panel">
                <div className="row row--between">
                  <strong>{isCustom ? 'Edit lines' : 'Explore'}</strong>
                  <Button size="sm" onClick={() => setExplore(false)}>
                    Back to training
                  </Button>
                </div>
                <p className="small muted">
                  {isCustom
                    ? 'Click a move to jump to it. Play on the board to add moves; every new branch becomes a line to learn.'
                    : 'Click any move to see the position and its note.'}
                </p>
                <TreeMoveList tree={tree} version={0} current={exploreNode} onSelect={selectNode} />
                {noteDraft === null && exploreNode.comment ? (
                  <Alert tone="info">
                    <Notated text={exploreNode.comment} />
                  </Alert>
                ) : null}
                {isCustom && exploreNode.parent ? (
                  <div className="stack" style={{ marginTop: 8 }}>
                    <div className="row">
                      <Button
                        size="sm"
                        onClick={() => setNoteDraft(exploreNode.comment ?? '')}
                        disabled={noteDraft !== null}
                      >
                        {exploreNode.comment ? 'Edit note' : 'Add note'}
                      </Button>
                      {!tree.isMainLine(exploreNode) ? (
                        <Button size="sm" onClick={makeMainLine}>
                          Make main line
                        </Button>
                      ) : null}
                      <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                        Delete from here
                      </Button>
                    </div>
                    {noteDraft !== null ? (
                      <>
                        <textarea
                          className="textarea"
                          rows={2}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          aria-label="Note for this move"
                          placeholder="Why this move? What is the plan?"
                        />
                        <div className="row">
                          <Button size="sm" variant="primary" onClick={saveNote}>
                            Save note
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setNoteDraft(null)}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </Card>
              <ExplorerPanel fen={exploreNode.fen} onPlay={onExplorerPlay} />
            </>
          ) : (
            <>
              <Card>
                <p
                  className={`puzzle-status${phase === 'lineDone' ? ' puzzle-status--solved' : ''}`}
                  role="status"
                >
                  <Notated text={status} />
                </p>
                {trainer.tip ? (
                  <Alert tone="info">
                    <Notated text={trainer.tip} />
                  </Alert>
                ) : null}
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
                  <p className="openings__line mono small">
                    <span className="sr-only">Current line: </span>
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
                        {lineMoveShown(i) ? (
                          <Notated text={san} />
                        ) : (
                          <span aria-hidden="true">·</span>
                        )}{' '}
                      </span>
                    ))}
                    {hiddenMoves > 0 ? (
                      <span className="sr-only">
                        and {hiddenMoves} move{hiddenMoves === 1 ? '' : 's'} still to find
                      </span>
                    ) : null}
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
                  onClick={() => setConfirmForget(true)}
                  style={{ marginTop: 8 }}
                >
                  Forget all {stats.total} moves
                </Button>
              </details>
            </>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this line?"
        confirmLabel="Delete from here"
        danger
        onConfirm={deleteFromHere}
        onClose={() => setConfirmDelete(false)}
      >
        <p className="muted">
          <Notated text={exploreNode.san} /> and every move after it
          {countBelow(exploreNode) > 0
            ? ` (${countBelow(exploreNode)} more move${countBelow(exploreNode) === 1 ? '' : 's'})`
            : ''}{' '}
          are removed from the repertoire, with their notes and review history. This cannot be
          undone.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmForget}
        title={`Forget all ${stats.total} moves?`}
        confirmLabel="Forget all moves"
        danger
        onConfirm={() => {
          resetRepertoire(repertoire.id);
          toast('Progress for this repertoire was reset.');
        }}
        onClose={() => setConfirmForget(false)}
      >
        <p className="muted">
          The review schedule for every move in {repertoire.name} starts again from scratch. The
          lines themselves are kept. This cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function colorLabel(color: 'white' | 'black'): string {
  return color === 'white' ? 'White' : 'Black';
}

/** Moves below a node (its whole subtree, the node itself excluded). */
function countBelow(node: TreeNode): number {
  let count = 0;
  const stack = [...node.children];
  for (let next = stack.pop(); next; next = stack.pop()) {
    count += 1;
    stack.push(...next.children);
  }
  return count;
}

/** Follows a path of SAN moves from the root as far as it exists. */
function nodeAtPath(tree: GameTree, path: readonly San[]): TreeNode {
  let node = tree.root;
  for (const san of path) {
    const next = node.children.find((c) => c.san === san);
    if (!next) break;
    node = next;
  }
  return node;
}

/** Board following the explore cursor; movable when the repertoire can be edited. */
function ExploreBoard({
  node,
  color,
  editable,
  dests,
  onMove,
}: {
  node: TreeNode;
  color: 'white' | 'black';
  editable: boolean;
  dests: Map<Square, Square[]>;
  onMove: (from: Square, to: Square) => void;
}) {
  const turn = node.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const last = node.uci ? ([node.uci.slice(0, 2), node.uci.slice(2, 4)] as [never, never]) : null;
  return (
    <Board
      fen={node.fen}
      orientation={color}
      turnColor={turn}
      movableColor={editable ? turn : undefined}
      dests={editable ? dests : new Map()}
      lastMove={last}
      viewOnly={!editable}
      onMove={onMove}
      ariaLabel={editable ? 'Repertoire editor board' : 'Repertoire explorer board'}
    />
  );
}

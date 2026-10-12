import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Chess, type Square } from 'chess.js';
import { Board, type DrawShape } from '@/components/board/Board';
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
import {
  castlingKingDest,
  isPromotionMove,
  legalDests,
  parseUci,
  toUci,
  tryMove,
} from '@/chess/helpers';
import { GameTree, type TreeNode } from '@/chess/tree';
import type { Fen, MoveInput, PromotionPiece, San, Uci } from '@/chess/types';
import { scrollBackTo } from '@/lib/scroll';
import { shareUrl } from '@/lib/shareCodes';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { describeDue, isNew } from '@/lib/srs';
import { useExplorer } from '@/lib/useExplorer';
import { useFocusWhile } from '@/lib/useFocusWhile';
import { useNow } from '@/lib/useNow';
import { useStackedLayout } from '@/lib/useStackedLayout';
import { siteConfig } from '@/site.config';
import { cardsFor, useRepertoire } from '@/store/repertoire';
import { useSettings } from '@/store/settings';
import { copyName, findCopy, makeEditableCopy } from './copyRepertoire';
import { GapAnswerCard, type GapAnswerFix, GapFinderPanel } from './GapFinder';
import { type Gap, type GapOptions, lineText, replayGap, suggestAnswer } from './gaps';
import { cardKey, isLearnerMove, repertoireStats } from './model';
import { getBuiltInRepertoire, type Repertoire } from './repertoires';
import { useGapOptions, useGapScan, useOtherAnswers } from './useGapScan';
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

/** What the column beside the board is for. */
type Mode = 'train' | 'explore' | 'gaps' | 'answer';

/** A gap being answered on the board. */
interface GapFix extends GapAnswerFix {
  replyMove: [Square, Square];
}

/** What a page opened to answer a gap is sent (a built-in repertoire's new copy). */
interface GapResume {
  gapAnswer: { line: San[]; reply: San; share: number | null; games: number | null };
  gapOptions: GapOptions;
}

function fixFromGap(gap: Gap): GapFix {
  return {
    line: gap.line,
    reply: gap.reply.san,
    fenBefore: gap.fen,
    fenAfter: gap.fenAfter,
    replyMove: [gap.replyFrom, gap.replyTo],
    share: gap.reply.share,
    games: gap.games,
  };
}

/** The gap a page was opened to answer, checked against its tree; null when there is none. */
function readGapResume(
  state: unknown,
  tree: GameTree,
): { fix: GapFix; options: GapOptions | undefined } | null {
  if (typeof state !== 'object' || state === null) return null;
  const { gapAnswer, gapOptions } = state as Partial<GapResume>;
  if (typeof gapAnswer !== 'object' || typeof gapAnswer.reply !== 'string') return null;
  const line: unknown = gapAnswer.line;
  if (!Array.isArray(line) || !line.every((san): san is San => typeof san === 'string')) {
    return null;
  }
  const replayed = replayGap(tree.root.fen, line, gapAnswer.reply);
  if (!replayed) return null;
  const options =
    typeof gapOptions === 'object' &&
    (gapOptions.database === 'lichess' || gapOptions.database === 'masters') &&
    Number.isInteger(gapOptions.depth)
      ? { database: gapOptions.database, depth: gapOptions.depth }
      : undefined;
  return {
    fix: {
      line,
      reply: replayed.reply,
      fenBefore: replayed.fenBefore,
      fenAfter: replayed.fenAfter,
      replyMove: [replayed.from, replayed.to],
      share: typeof gapAnswer.share === 'number' ? gapAnswer.share : null,
      games: typeof gapAnswer.games === 'number' ? gapAnswer.games : null,
    },
    options,
  };
}

/** An arrow for a move given in SAN; none when it is not legal. */
function arrowFor(fen: Fen, san: San, brush: string): DrawShape[] {
  const move = tryMove(new Chess(fen), san);
  return move ? [{ orig: move.from, dest: move.to, brush }] : [];
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
  const location = useLocation();
  const navigate = useNavigate();
  // A copy made to answer a gap opens on that gap: the built-in repertoire's page sends it.
  const [resume] = useState(() =>
    repertoire.id.startsWith('custom-') ? readGapResume(location.state, tree) : null,
  );
  const [mode, setMode] = useState<Mode>(resume ? 'answer' : 'train');
  const explore = mode === 'explore';
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
  const [explorePath, setExplorePath] = useState<San[]>(() => resume?.fix.line ?? []);
  const exploreNode = useMemo(() => nodeAtPath(tree, explorePath), [tree, explorePath]);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(
    null,
  );

  // The gap finder: its options, its run and the gap shown on the board.
  const [gapOptions, setGapOptions] = useGapOptions(resume?.options);
  const elsewhere = useOtherAnswers(repertoire.id, repertoire.color);
  const scan = useGapScan(tree, repertoire.color, gapOptions, elsewhere);
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);
  const selectedGap =
    scan.report.gaps.find((g) => g.id === selectedGapId) ?? scan.report.gaps[0] ?? null;
  const [gapFix, setGapFix] = useState<GapFix | null>(() => resume?.fix ?? null);
  const [copyFor, setCopyFor] = useState<Gap | null>(null);
  const custom = useRepertoire((s) => s.custom);
  const existingCopy = isCustom ? undefined : findCopy(repertoire, custom);
  const explorerOn = useSettings((s) => s.explorer);
  const answering = mode === 'answer' && gapFix !== null;
  const answerLookup = useExplorer(
    answering ? gapFix.fenAfter : null,
    explorerOn,
    gapOptions.database,
  );
  const suggestion =
    answerLookup.status === 'ready'
      ? suggestAnswer(answerLookup.result, gapOptions.database)
      : null;
  const boardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const stacked = useStackedLayout();

  // What opened the page is spent once read: a reload starts from the repertoire itself.
  useEffect(() => {
    if (location.state == null) return;
    void navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: null },
    );
  }, [location.state, location.pathname, location.search, location.hash, navigate]);

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

  const openGaps = () => {
    setGapFix(null);
    setPendingPromotion(null);
    setMode('gaps');
    // On a phone the panel is under the board: go to it.
    if (stacked) {
      requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' }),
      );
    }
  };

  /** "Add an answer": the editor on the gap, or first a copy of a built-in repertoire. */
  const answerFromGap = (gap: Gap) => {
    setSelectedGapId(gap.id);
    if (!isCustom) {
      setCopyFor(gap);
      return;
    }
    setGapFix(fixFromGap(gap));
    setPendingPromotion(null);
    setMode('answer');
    scrollBackTo(boardRef.current);
  };

  /** Adds the gap's reply and the learner's answer to it, with the line to them if missing. */
  const answerGap = (input: MoveInput | San): boolean => {
    const fix = gapFix;
    if (!fix || !isCustom) return false;
    const answer = tryMove(new Chess(fix.fenAfter), input);
    if (!answer) {
      toast('That move is not legal here.', { tone: 'warning' });
      return false;
    }
    const before = countBelow(tree.root);
    commitEdit(() => {
      tree.goStart();
      for (const san of [...fix.line, fix.reply]) {
        if (!tree.addMove(san, { navigate: true })) return null;
      }
      return tree.addMove(answer.san, { navigate: false });
    });
    const added = countBelow(tree.root) - before;
    const both = lineText(fix.fenBefore, [fix.reply, answer.san]);
    const path = [...fix.line, fix.reply, answer.san];
    setGapFix(null);
    setMode('gaps');
    toast(
      added === 0
        ? `The repertoire already has ${both}.`
        : added === 1
          ? `Added ${lineText(fix.fenAfter, [answer.san])} after ${lineText(fix.fenBefore, [fix.reply])}.`
          : added === 2
            ? `Added ${both}.`
            : `Added ${both}, and the ${added - 2} moves before them.`,
      {
        tone: 'success',
        actionLabel: 'Edit the line',
        onAction: () => {
          setExplorePath(path);
          setNoteDraft(null);
          setMode('explore');
        },
      },
    );
    return true;
  };

  /** Makes the editable copy (or opens the one made before) and answers the gap there. */
  const copyAndAnswer = () => {
    const gap = copyFor;
    if (!gap) return;
    const { copy, moved } = makeEditableCopy(repertoire);
    toast(
      existingCopy
        ? `Opened “${copy.name}”.`
        : moved > 0
          ? `Made “${copy.name}”, with your progress.`
          : `Made “${copy.name}”.`,
      { tone: 'success' },
    );
    const state: GapResume = {
      gapAnswer: {
        line: gap.line,
        reply: gap.reply.san,
        share: gap.reply.share,
        games: gap.games,
      },
      gapOptions,
    };
    void navigate(`/openings/${copy.id}`, { state });
  };

  /** The position on the editing board: the gap's, while one is answered. */
  const editFen = answering ? gapFix.fenAfter : exploreNode.fen;

  const playOnEditor = (input: MoveInput) => {
    if (answering) answerGap(input);
    else addExploreMove(input);
  };

  const onExploreMove = (from: Square, to: Square) => {
    if (isPromotionMove(new Chess(editFen), from, to)) {
      setPendingPromotion({ from, to });
      return;
    }
    playOnEditor({ from, to });
  };

  const resolveExplorePromotion = (piece: PromotionPiece | null) => {
    const pending = pendingPromotion;
    setPendingPromotion(null);
    if (!pending || !piece) return;
    playOnEditor({ from: pending.from, to: pending.to, promotion: piece });
  };

  const onExplorerPlay = (uci: Uci) => {
    const { from, to, promotion } = parseUci(uci);
    // The explorer may write castling as the king taking its rook (e1h1): the board says g1.
    const dest = castlingKingDest(exploreNode.fen, from, to);
    addExploreMove(promotion ? { from, to: dest, promotion } : { from, to: dest });
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

  const editable = (explore && isCustom) || answering;
  const exploreDests = useMemo(
    () => (editable ? legalDests(new Chess(editFen)) : new Map<Square, Square[]>()),
    [editable, editFen],
  );
  const suggestionArrow = useMemo(
    () => (answering && suggestion ? arrowFor(editFen, suggestion.san, 'green') : undefined),
    [answering, suggestion, editFen],
  );
  const gapArrow = useMemo<DrawShape[]>(
    () =>
      selectedGap
        ? [{ orig: selectedGap.replyFrom, dest: selectedGap.replyTo, brush: 'yellow' }]
        : [],
    [selectedGap],
  );

  // Keyboard: Space shows the move; Enter or → goes on after a note, and to the next line
  // (as does N). The shared rule: either case, never with a modifier, never from a field, a
  // dialog or the board (role="application"), which types squares.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // N is a single-key shortcut (off with the setting); Space, Enter and → keep working.
      const key = pageShortcutKey(e);
      const goOn = key === 'Enter' || key === 'ArrowRight';
      if (key === ' ' && trainer.phase === 'learner') trainer.showMove();
      else if (goOn && trainer.phase === 'explained') trainer.playOn();
      else if ((goOn || key === 'n') && trainer.phase === 'lineDone') trainer.nextLine();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trainer]);

  // The way on has the focus, so Enter takes it — without scrolling the page to it.
  const playOnRef = useRef<HTMLButtonElement>(null);
  const nextLineRef = useRef<HTMLButtonElement>(null);
  useFocusWhile(playOnRef, trainer.phase === 'explained');
  useFocusWhile(nextLineRef, trainer.phase === 'lineDone');

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
      case 'explained': {
        const played = trainer.line[trainer.index - 1];
        return played ? `Right: ${played.san} is in your repertoire.` : 'Right.';
      }
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
        <div className="trainer__board" style={{ position: 'relative' }} ref={boardRef}>
          {explore ? (
            <EditBoard
              fen={exploreNode.fen}
              lastMove={squaresOf(exploreNode.uci)}
              color={repertoire.color}
              editable={isCustom}
              dests={exploreDests}
              onMove={onExploreMove}
              ariaLabel={isCustom ? 'Repertoire editor board' : 'Repertoire explorer board'}
            />
          ) : answering ? (
            <EditBoard
              fen={gapFix.fenAfter}
              lastMove={gapFix.replyMove}
              color={repertoire.color}
              editable
              dests={exploreDests}
              onMove={onExploreMove}
              autoShapes={suggestionArrow}
              ariaLabel={`Repertoire editor board: your answer to ${lineText(gapFix.fenBefore, [gapFix.reply])}`}
            />
          ) : mode === 'gaps' ? (
            <Board
              fen={selectedGap?.fen ?? tree.root.fen}
              orientation={repertoire.color}
              lastMove={selectedGap?.lastMove ?? null}
              viewOnly
              autoShapes={gapArrow}
              ariaLabel={
                selectedGap
                  ? `Gap board: ${lineText(selectedGap.fen, [selectedGap.reply.san])} comes here, and the repertoire has no answer`
                  : `${repertoire.name}: the starting position`
              }
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
          {trainer.needsPromotion && mode === 'train' ? (
            <PromotionPicker color={repertoire.color} onSelect={trainer.resolvePromotion} />
          ) : null}
          {pendingPromotion && (explore || answering) ? (
            <PromotionPicker
              color={editFen.split(' ')[1] === 'b' ? 'black' : 'white'}
              onSelect={resolveExplorePromotion}
            />
          ) : null}
          {mode === 'train' && (phase === 'idle' || phase === 'sessionDone') ? (
            <div className="trainer__overlay">
              {/* What to do next is said once, in the status beside the board. */}
              <Card className="summary">
                {phase === 'sessionDone' && trainer.session.total > 0 ? (
                  <>
                    <p className="card__eyebrow">Session complete</p>
                    <h2 style={{ margin: '4px 0 12px' }}>
                      {trainer.session.correct}/{trainer.session.total} recalled
                    </h2>
                  </>
                ) : (
                  <h2 style={{ margin: '0 0 12px' }}>{repertoire.name}</h2>
                )}
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
                  <Button size="lg" onClick={() => setMode('explore')}>
                    {isCustom ? 'Edit lines' : 'Explore lines'}
                  </Button>
                  <Button size="lg" onClick={openGaps}>
                    Find gaps
                  </Button>
                  <LinkButton
                    size="lg"
                    to={`/play/computer?book=${encodeURIComponent(repertoire.id)}`}
                  >
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

        <aside className="trainer__panel stack" ref={panelRef}>
          {mode === 'gaps' ? (
            <GapFinderPanel
              startFen={tree.root.fen}
              scan={scan}
              options={gapOptions}
              onOptions={(next) => {
                scan.stop();
                setGapOptions(next);
              }}
              selectedId={selectedGap?.id ?? null}
              onSelect={(gap) => {
                setSelectedGapId(gap.id);
                scrollBackTo(boardRef.current);
              }}
              onAnswer={answerFromGap}
              onClose={() => setMode('train')}
            />
          ) : answering ? (
            <GapAnswerCard
              startFen={tree.root.fen}
              color={repertoire.color}
              fix={gapFix}
              database={gapOptions.database}
              explorer={answerLookup}
              suggestion={suggestion}
              onAnswer={(san) => answerGap(san)}
              onCancel={openGaps}
            />
          ) : explore ? (
            <>
              <Card data-testid="explore-panel">
                <div className="row row--between">
                  <strong>{isCustom ? 'Edit lines' : 'Explore'}</strong>
                  <Button size="sm" onClick={() => setMode('train')}>
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
                  {phase === 'explained' ? (
                    <Button
                      ref={playOnRef}
                      variant="primary"
                      onClick={trainer.playOn}
                      data-testid="repertoire-play-on"
                    >
                      Continue <Kbd>Enter</Kbd>
                    </Button>
                  ) : null}
                  {phase === 'lineDone' ? (
                    <Button
                      ref={nextLineRef}
                      variant="primary"
                      onClick={trainer.nextLine}
                      data-testid="repertoire-next-line"
                    >
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

      <ConfirmDialog
        open={copyFor !== null}
        title={existingCopy ? `Answer it in “${existingCopy.name}”?` : 'Make your own copy?'}
        confirmLabel={existingCopy ? 'Open my copy' : 'Make a copy'}
        onConfirm={copyAndAnswer}
        onClose={() => setCopyFor(null)}
      >
        <p className="muted">
          Built-in repertoires cannot be changed.{' '}
          {existingCopy
            ? `Your copy of ${repertoire.name} can: the answer goes there.`
            : `A copy of ${repertoire.name} is yours to edit and train, listed with your repertoires as “${copyName(repertoire.name)}”. The answer goes into it.`}
        </p>
        {!existingCopy && stats.learned > 0 ? (
          <p className="muted">
            The {stats.learned} move{stats.learned === 1 ? '' : 's'} you have learned here move to
            the copy with their review dates, so nothing is learned twice.
          </p>
        ) : null}
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

/** A move's squares from its UCI, for the board's last-move mark; null at the root. */
function squaresOf(uci: Uci): [Square, Square] | null {
  return uci.length >= 4 ? [uci.slice(0, 2) as Square, uci.slice(2, 4) as Square] : null;
}

/** The editing board: the explore cursor's position or a gap's; movable when it can be edited. */
function EditBoard({
  fen,
  lastMove,
  color,
  editable,
  dests,
  onMove,
  autoShapes,
  ariaLabel,
}: {
  fen: Fen;
  lastMove: [Square, Square] | null;
  color: 'white' | 'black';
  editable: boolean;
  dests: Map<Square, Square[]>;
  onMove: (from: Square, to: Square) => void;
  autoShapes?: DrawShape[];
  ariaLabel: string;
}) {
  const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  return (
    <Board
      fen={fen}
      orientation={color}
      turnColor={turn}
      movableColor={editable ? turn : undefined}
      dests={editable ? dests : new Map()}
      lastMove={lastMove}
      viewOnly={!editable}
      onMove={onMove}
      autoShapes={autoShapes}
      ariaLabel={ariaLabel}
    />
  );
}

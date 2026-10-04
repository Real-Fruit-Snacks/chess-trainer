import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { EngineLines, EngineStatus } from '@/components/chess/EngineLines';
import { EvalBar } from '@/components/chess/EvalBar';
import { EvalGraph } from '@/components/chess/EvalGraph';
import { MoveInput } from '@/components/chess/MoveInput';
import { TreeMoveList, TreeNavigation } from '@/components/chess/TreeMoveList';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  LinkButton,
  ProgressBar,
  Segmented,
  Switch,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import type { LongColor } from '@/chess/types';
import { buildShareFragment, readShareFragment, SHARE_LINK_WARN_CHARS } from '@/lib/shareLink';
import { describeCategory, describeDtm, type TablebaseCategory } from '@/lib/tablebase';
import { safeSourceUrl } from '@/lib/gameImport';
import { displayOpeningName } from '@/lib/openings';
import { siteConfig } from '@/site.config';
import { type ReviewDepth, useSettings } from '@/store/settings';
import { clearHandoff, readHandoff } from '@/lib/handoff';
import {
  gameTitle,
  type MainLine,
  ownPuzzleFromMoment,
  type OwnPuzzleMeta,
  ownPuzzlesFromReview,
} from '@/features/puzzles/ownPuzzles';
import { useProgress } from '@/store/progress';
import { BoardEditor } from './BoardEditor';
import { ImportPanel } from './ImportPanel';
import { LibraryDialog, SaveAnalysisDialog } from './LibraryDialog';
import type { SavedAnalysis } from '@/store/analyses';
import { ExplorerPanel } from '@/components/chess/ExplorerPanel';
import { PositionReportCard } from './PositionReportCard';
import type { DrawShape } from '@/components/board/Board';
import { AddToRepertoireDialog } from '@/features/openings/AddToRepertoireDialog';
import { lineOf } from '@/features/openings/mergeLine';
import { START_FEN } from '@/chess/helpers';
import { getLessonMeta } from '@/features/learn/lessonMeta';
import { themeName } from '@/features/puzzles/themes';
import { explainReviewedMove, MOTIF_HELP } from './commentary';
import { keyMoments, type ReviewSummary } from './gameReview';
import { useAnalysis } from './useAnalysis';
import './analyze.css';
import { Icon } from '@/components/ui';
import { Notated, San } from '@/chess/San';
import { characterShortcutsOn } from '@/lib/shortcutKey';

const GLYPH_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '–' },
  { value: 1, label: '!' },
  { value: 2, label: '?' },
  { value: 3, label: '!!' },
  { value: 4, label: '??' },
  { value: 5, label: '!?' },
  { value: 6, label: '?!' },
];

function categoryClass(category: TablebaseCategory): string {
  if (category === 'win' || category === 'cursed-win' || category === 'maybe-win') return 'win';
  if (category === 'loss' || category === 'blessed-loss' || category === 'maybe-loss') {
    return 'loss';
  }
  return 'draw';
}

export default function AnalyzePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const analysis = useAnalysis();
  const settings = useSettings();
  const ownPuzzleRating = useProgress((s) => Math.round(s.puzzleRating));
  const [orientation, setOrientation] = useState<LongColor>('white');
  const [saveOpen, setSaveOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [repertoireOpen, setRepertoireOpen] = useState(false);
  const [reportShapes, setReportShapes] = useState<DrawShape[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<SavedAnalysis | null>(null);
  /** The library entry the board was opened from, so "Save" can update it instead of duplicating. */
  const [openEntry, setOpenEntry] = useState<SavedAnalysis | null>(null);
  const dialogsOpen = saveOpen || libraryOpen || editorOpen || repertoireOpen || confirmReset;

  useEffect(() => {
    document.title = `Analyze · ${siteConfig.name}`;
  }, []);

  // Handoffs: ?fen=… from puzzles/lessons, ?from=game after playing the engine, ?pgn=… from elsewhere.
  useEffect(() => {
    const fen = searchParams.get('fen');
    const from = searchParams.get('from');
    const pgnParam = searchParams.get('pgn');
    if (fen) {
      if (!analysis.loadFen(fen)) toast('That FEN could not be loaded.', { tone: 'warning' });
      else setOrientation(fen.split(' ')[1] === 'b' ? 'black' : 'white');
    } else if (from === 'game') {
      const handoff = readHandoff();
      if (handoff && analysis.loadPgn(handoff.pgn)) {
        setOrientation(handoff.orientation ?? 'white');
        // Kept until now so a reload mid-way still found the game.
        clearHandoff();
      } else if (!handoff) {
        toast('No game was handed over — play a game or import one.', { tone: 'info' });
      }
    } else if (pgnParam) {
      if (!analysis.loadPgn(pgnParam)) toast('That PGN could not be loaded.', { tone: 'warning' });
    } else {
      return;
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared links carry the game in the fragment: #z=<deflated PGN>&ply=N, #pgn=… or #fen=….
  useEffect(() => {
    const fragment = location.hash;
    if (!fragment || fragment.length < 3) return;
    let cancelled = false;
    void readShareFragment(fragment).then((read) => {
      if (cancelled) return;
      if (!read.ok) {
        toast(
          read.kind === 'unsupported'
            ? 'This browser cannot open compressed links. Ask for the game as a PGN instead.'
            : read.kind === 'too-large'
              ? 'That link is too large to be a chess game.'
              : 'That link does not contain a game.',
          { tone: 'warning' },
        );
        return;
      }
      const shared = read.params;
      if (shared.pgn) {
        if (!analysis.loadPgn(shared.pgn, shared.ply, shared.line)) {
          toast('The game in that link could not be loaded.', { tone: 'warning' });
          return;
        }
        if (shared.name) toast(`Opened the shared analysis “${shared.name}”.`, { tone: 'info' });
      } else if (shared.fen) {
        if (!analysis.loadFen(shared.fen)) {
          toast('The position in that link could not be loaded.', { tone: 'warning' });
          return;
        }
        setOrientation(shared.fen.split(' ')[1] === 'b' ? 'black' : 'white');
      }
      // Leave the fragment in place so the link stays reloadable and copyable.
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per link
  }, [location.hash]);

  // Keyboard navigation. Letters are case-insensitive (Caps Lock), modified keys
  // are left to the browser, and nothing fires from form fields, the board
  // (which has its own keys) or while a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('[role="application"], dialog, [role="dialog"]'))
      ) {
        return;
      }
      if (dialogsOpen || document.querySelector('dialog[open]')) return;
      switch (event.key.length === 1 ? event.key.toLowerCase() : event.key) {
        case 'ArrowLeft':
          analysis.back();
          break;
        case 'ArrowRight':
          analysis.forward();
          break;
        case 'Home':
          analysis.goStart();
          break;
        case 'End':
          analysis.goEnd();
          break;
        case 'f':
          if (event.shiftKey || !characterShortcutsOn()) return;
          setOrientation((o) => (o === 'white' ? 'black' : 'white'));
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [analysis, dialogsOpen]);

  const { viewed, current, tree } = analysis;
  const score = analysis.lines.get(1)?.score ?? null;
  const mainLine = useMemo(() => tree.mainLine(), [tree, analysis.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = useMemo<MainLine>(
    () => ({
      fens: [tree.startFen, ...mainLine.map((n) => n.fen)],
      sans: mainLine.map((n) => n.san),
    }),
    [tree, mainLine],
  );
  const hasMoves = mainLine.length > 0;
  const hasContent = hasMoves || tree.root.children.length > 0 || !!tree.root.comment;
  const isMain = useMemo(() => tree.isMainLine(current), [tree, current]);
  // Guarded by SAN: after "Move up" the move at this ply may be a different one.
  const reviewedCurrent = analysis.reviewFor(current);
  const sourceUrl = safeSourceUrl(tree.headers.Site) ?? safeSourceUrl(tree.headers.Link);
  const onHighlight = useCallback((shapes: DrawShape[]) => setReportShapes(shapes), []);
  const reset = () => {
    analysis.reset();
    setOpenEntry(null);
  };
  const openFromLibrary = (entry: SavedAnalysis) => {
    if (!analysis.loadPgn(entry.pgn)) {
      toast('That analysis could not be loaded.', { tone: 'warning' });
      return;
    }
    setOpenEntry(entry);
    toast(`Opened “${entry.name}”.`, { tone: 'success' });
  };
  const currentGlyph = current.nags.find((n) => n >= 1 && n <= 6) ?? 0;
  const siblings = current.parent?.children ?? [];
  const siblingIndex = siblings.indexOf(current);
  // Lines can only join a repertoire when they start from the normal starting position.
  const canAddToRepertoire = tree.startFen === START_FEN && current.ply > 0;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`);
    } catch {
      toast('Clipboard unavailable.', { tone: 'warning' });
    }
  };

  const copyLink = async () => {
    const fragment = await buildShareFragment(
      hasMoves
        ? {
            pgn: analysis.pgn(),
            ply: current.ply,
            // Off the main line the ply is not enough: send the moves that lead here.
            line: isMain ? undefined : analysis.path.map((n) => n.uci),
          }
        : { fen: viewed.fen },
    );
    const url = `${window.location.origin}${window.location.pathname}#${fragment}`;
    await copy(url, 'Link');
    if (url.length > SHARE_LINK_WARN_CHARS) {
      toast(
        `This link is ${url.length.toLocaleString()} characters long — some apps cut links around 2,000. If it fails to open, share the PGN instead.`,
        { tone: 'warning' },
      );
    }
  };

  const downloadPgn = () => {
    const blob = new Blob([analysis.pgn()], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis.pgn';
    a.click();
    URL.revokeObjectURL(url);
  };

  const moveLabel = `${viewed.moveNumber}${viewed.turn === 'black' ? '…' : '.'}`;

  return (
    <div>
      <div className="page-header page-header--lean row row--between">
        <div>
          <h1>Analyze</h1>
          <p>
            The analysis board: set up any position, paste a game, explore variations, and let
            Stockfish show you the best lines.
          </p>
        </div>
        <div className="row">
          <Button onClick={() => setShowImport((v) => !v)}>
            {showImport ? 'Close import' : 'Import FEN / PGN'}
          </Button>
          <Button onClick={() => setEditorOpen(true)}>Board editor</Button>
          <Button
            onClick={() => setSaveOpen(true)}
            disabled={!hasMoves}
            data-testid="save-analysis"
          >
            {openEntry ? `Update “${openEntry.name}”` : 'Save'}
          </Button>
          <Button onClick={() => setLibraryOpen(true)} data-testid="open-library">
            Library
          </Button>
          <Button
            variant="ghost"
            onClick={() => (hasContent ? setConfirmReset(true) : reset())}
            data-testid="reset-board"
          >
            Reset board
          </Button>
        </div>
      </div>

      {showImport ? (
        <Card className="analyze__import">
          <ImportPanel
            onLoadFen={(fen) => {
              const ok = analysis.loadFen(fen);
              if (ok) setOrientation(fen.split(' ')[1] === 'b' ? 'black' : 'white');
              return ok;
            }}
            onLoadPgn={analysis.loadPgn}
            onDone={() => setShowImport(false)}
          />
        </Card>
      ) : null}

      {analysis.engineStatus === 'error' ? (
        <Alert tone="danger" role="alert">
          The engine could not start: {analysis.engineError?.message}{' '}
          <Button size="sm" onClick={() => void analysis.retryEngine()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      <div className="trainer">
        <div className="analyze__boardcol">
          <div className="trainer__board" style={{ position: 'relative' }}>
            <EvalBar
              score={analysis.engineOn ? score : null}
              turn={viewed.turn}
              orientation={orientation}
              result={viewed.result}
            />
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Board
                fen={viewed.fen}
                orientation={orientation}
                turnColor={viewed.turn}
                movableColor="both"
                dests={viewed.dests}
                lastMove={viewed.lastMove}
                check={viewed.inCheck}
                autoShapes={reportShapes.length ? reportShapes : analysis.bestMoveShape}
                onMove={(from, to) => analysis.playMove(from, to)}
                ariaLabel={`Analysis board, ${viewed.turn} to move`}
              />
              {analysis.pendingPromotion ? (
                <PromotionPicker
                  color={analysis.pendingPromotion.color}
                  onSelect={analysis.resolvePromotion}
                />
              ) : null}
            </div>
          </div>
          <div className="analyze__under">
            <div className="analyze__strip">
              <TreeNavigation
                canBack={current.parent !== null}
                canForward={current.children.length > 0}
                onStart={analysis.goStart}
                onBack={analysis.back}
                onForward={analysis.forward}
                onEnd={analysis.goEnd}
              />
              <span className="analyze__strip-move small" aria-live="polite" aria-atomic="true">
                {current.parent ? (
                  <>
                    {moveNumberLabel(current, tree.startFen)} <San san={current.san} />
                    {!isMain ? <span className="faint"> · variation</span> : null}
                  </>
                ) : hasMoves ? (
                  'Start position'
                ) : (
                  ''
                )}
              </span>
            </div>
            {analysis.opening ? (
              <span className="analyze__opening" aria-live="polite">
                <Badge tone="neutral">{analysis.opening.eco}</Badge>{' '}
                {displayOpeningName(analysis.opening.name)}
              </span>
            ) : (
              <span className="analyze__opening muted small">
                {hasMoves ? 'Out of book' : 'Play moves or import a game to see the opening name.'}
              </span>
            )}
            {settings.moveInput ? <MoveInput onMove={analysis.playNotation} /> : null}
          </div>
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between" style={{ marginBottom: 8 }}>
              <Switch checked={analysis.engineOn} onChange={analysis.setEngineOn} label="Engine" />
              <div className="row">
                <label className="small muted">
                  Lines{' '}
                  <select
                    className="select analyze__mini"
                    value={settings.analysisLines}
                    onChange={(e) => settings.update({ analysisLines: Number(e.target.value) })}
                    aria-label="Number of engine lines"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="small muted">
                  Depth{' '}
                  <select
                    className="select analyze__mini"
                    value={settings.analysisDepth}
                    onChange={(e) => settings.update({ analysisDepth: Number(e.target.value) })}
                    aria-label="Search depth"
                  >
                    {[12, 15, 18, 20, 22, 24].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <EngineLines
              fen={viewed.fen}
              turn={viewed.turn}
              lines={analysis.lines}
              count={settings.analysisLines}
              thinking={analysis.thinking}
              onPlayMove={analysis.playUci}
              moveLabel={moveLabel}
            />
            <div style={{ marginTop: 8 }}>
              <EngineStatus
                name={analysis.engineName}
                depth={analysis.depthReached}
                nps={analysis.nps}
                thinking={analysis.thinking}
                loading={analysis.engineStatus === 'idle' || analysis.engineStatus === 'loading'}
              />
            </div>
          </Card>

          {analysis.tablebase.status !== 'off' ? (
            <Card>
              <div className="row row--between">
                <strong>Tablebase</strong>
                <span className="small muted">Lichess · 7 pieces or fewer</span>
              </div>
              {analysis.tablebase.status === 'loading' ? (
                <p className="small muted" style={{ margin: '6px 0 0' }}>
                  Looking up…
                </p>
              ) : analysis.tablebase.status === 'error' ? (
                <p className="small muted" style={{ margin: '6px 0 0' }}>
                  Unavailable: {analysis.tablebase.message}
                </p>
              ) : (
                <>
                  <p style={{ margin: '6px 0 0' }}>
                    <strong>{describeCategory(analysis.tablebase.result.category)}</strong> for{' '}
                    {viewed.turn}
                    {analysis.tablebase.result.dtm !== null
                      ? ` · ${describeDtm(analysis.tablebase.result.dtm)}`
                      : analysis.tablebase.result.dtz !== null &&
                          analysis.tablebase.result.category !== 'draw'
                        ? ` · DTZ ${Math.abs(analysis.tablebase.result.dtz)}`
                        : ''}
                  </p>
                  <div className="tablebase__moves">
                    {analysis.tablebase.result.moves.slice(0, 12).map((m) => (
                      <button
                        type="button"
                        key={m.uci}
                        className={`tablebase__move tablebase__move--${categoryClass(m.outcome)}`}
                        onClick={() => analysis.playUci(m.uci)}
                        title={`${describeCategory(m.outcome)}${m.dtm !== null ? `, ${describeDtm(m.dtm)} (DTM ${Math.abs(m.dtm)} half-moves)` : m.dtz !== null ? `, DTZ ${Math.abs(m.dtz)}` : ''}`}
                      >
                        <San san={m.san} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Card>
          ) : null}

          <ExplorerPanel fen={viewed.fen} onPlay={analysis.playUci} />

          <PositionReportCard fen={viewed.fen} onHighlight={onHighlight} />

          <Card>
            <div className="analyze__panelnav">
              <TreeNavigation
                canBack={current.parent !== null}
                canForward={current.children.length > 0}
                onStart={analysis.goStart}
                onBack={analysis.back}
                onForward={analysis.forward}
                onEnd={analysis.goEnd}
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <TreeMoveList
                tree={tree}
                version={analysis.version}
                current={current}
                onSelect={analysis.goTo}
                judgements={analysis.judgements}
              />
            </div>
            {reviewedCurrent &&
            reviewedCurrent.judgement !== 'best' &&
            reviewedCurrent.judgement !== 'good' ? (
              <Alert
                tone={
                  reviewedCurrent.judgement === 'blunder'
                    ? 'danger'
                    : reviewedCurrent.judgement === 'mistake'
                      ? 'warning'
                      : 'info'
                }
              >
                <strong>
                  <San san={reviewedCurrent.san} />
                </strong>{' '}
                was {reviewedCurrent.judgement === 'inaccuracy' ? 'an' : 'a'}{' '}
                {reviewedCurrent.judgement}.
                {reviewedCurrent.best ? (
                  <>
                    {' '}
                    Better was{' '}
                    <strong>
                      <San san={reviewedCurrent.best} />
                    </strong>
                    .
                  </>
                ) : null}
                <MoveExplanation move={reviewedCurrent} />
                {current.parent ? (
                  <>
                    {' '}
                    <Link
                      to={`/play?fen=${encodeURIComponent(current.parent.fen)}&color=${reviewedCurrent.mover}`}
                    >
                      Retry from here vs the engine
                    </Link>
                  </>
                ) : null}
              </Alert>
            ) : null}

            {current.parent ? (
              <div className="analyze__nodetools">
                <div className="row row--between">
                  <span className="small muted">
                    {isMain ? 'Main line' : 'Variation'} · move <San san={current.san} />
                  </span>
                  <Segmented
                    ariaLabel="Annotate move"
                    value={currentGlyph}
                    options={GLYPH_OPTIONS}
                    onChange={(nag) => analysis.setGlyph(nag === 0 ? null : nag)}
                  />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  {!isMain ? (
                    <Button size="sm" onClick={() => analysis.makeMainLine()}>
                      Make main line
                    </Button>
                  ) : null}
                  {siblingIndex > 0 ? (
                    <Button size="sm" onClick={() => analysis.promoteVariation()}>
                      Move up
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => setCommentDraft(current.comment ?? '')}>
                    {current.comment ? 'Edit comment' : 'Add comment'}
                  </Button>
                  {canAddToRepertoire ? (
                    <Button size="sm" onClick={() => setRepertoireOpen(true)}>
                      Add line to repertoire
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={analysis.deleteFromHere}
                    disabled={current.children.length === 0}
                  >
                    Delete after
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => analysis.deleteVariation()}>
                    {isMain && siblings.length === 1 ? 'Delete from here' : 'Delete variation'}
                  </Button>
                </div>
                {commentDraft !== null ? (
                  <div className="stack" style={{ marginTop: 8 }}>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      aria-label="Comment on this move"
                      placeholder="Why this move? What is the plan?"
                    />
                    <div className="row">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          analysis.setComment(commentDraft);
                          setCommentDraft(null);
                        }}
                      >
                        Save comment
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCommentDraft(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="row" style={{ marginTop: 12 }}>
              <Button
                size="sm"
                onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              >
                Flip
              </Button>
              <Button size="sm" onClick={() => void copy(viewed.fen, 'FEN')}>
                Copy FEN
              </Button>
              <Button
                size="sm"
                onClick={() => void copy(analysis.pgn(), 'PGN')}
                disabled={!hasMoves}
              >
                Copy PGN
              </Button>
              <Button size="sm" onClick={downloadPgn} disabled={!hasMoves}>
                Download PGN
              </Button>
              <Button
                size="sm"
                onClick={() => void copyLink()}
                title="Copy a link that opens this game or position here"
              >
                Copy link
              </Button>
              <LinkButton
                size="sm"
                to={`/play?fen=${encodeURIComponent(viewed.fen)}&color=${viewed.turn}`}
                title="Play this position against the engine"
              >
                Play it out
              </LinkButton>
            </div>
          </Card>

          <Card>
            <div className="row row--between">
              <strong>Game review</strong>
              <div className="row">
                {analysis.reviewProgress === null ? (
                  <label className="small muted">
                    Depth{' '}
                    <select
                      className="select analyze__mini"
                      value={settings.reviewDepth}
                      onChange={(e) =>
                        settings.update({ reviewDepth: e.target.value as ReviewDepth })
                      }
                      aria-label="Review depth"
                    >
                      <option value="fast">fast</option>
                      <option value="balanced">balanced</option>
                      <option value="thorough">thorough</option>
                    </select>
                  </label>
                ) : null}
                {analysis.reviewProgress === null ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={analysis.startReview}
                    disabled={!hasMoves || analysis.engineStatus !== 'ready'}
                    title={
                      !hasMoves
                        ? 'Play or import some moves first'
                        : analysis.engineStatus !== 'ready'
                          ? 'Waiting for the engine to load'
                          : undefined
                    }
                  >
                    {analysis.review ? 'Review again' : 'Review game'}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={analysis.cancelReview}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            {analysis.reviewProgress !== null ? (
              <div style={{ marginTop: 8 }}>
                <ProgressBar value={analysis.reviewProgress} label="Review progress" />
                <p className="small muted" style={{ margin: '6px 0 0' }}>
                  Evaluating every position… {Math.round(analysis.reviewProgress * 100)}%
                  {analysis.reviewEtaMs !== null
                    ? ` · about ${Math.max(1, Math.round(analysis.reviewEtaMs / 1000))} s left`
                    : ''}
                </p>
              </div>
            ) : null}
            {analysis.review ? (
              <>
                <div style={{ marginTop: 8 }}>
                  <EvalGraph
                    wins={analysis.review.wins}
                    judgements={analysis.review.moves.map((m) => m.judgement)}
                    currentPly={isMain ? current.ply : 0}
                    onSelect={analysis.goToPly}
                    startMoveNumber={Number(tree.startFen.split(' ')[5] ?? 1)}
                    startsWithBlack={tree.startFen.split(' ')[1] === 'b'}
                  />
                </div>
                <ReviewSummaryView review={analysis.review} />
                <KeyMoments
                  review={analysis.review}
                  currentPly={isMain ? current.ply : 0}
                  onSelect={analysis.goToPly}
                  startMoveNumber={Number(tree.startFen.split(' ')[5] ?? 1)}
                  startsWithBlack={tree.startFen.split(' ')[1] === 'b'}
                  line={line}
                  meta={{
                    title: gameTitle(tree.headers),
                    url: sourceUrl ?? undefined,
                    rating: ownPuzzleRating,
                  }}
                />
              </>
            ) : null}
            {!analysis.review && analysis.reviewProgress === null ? (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                Finds inaccuracies, mistakes and blunders along the main line and shows the better
                move. Play a game against the engine, then hit <Link to="/play">Analyze game</Link>,
                or paste a PGN above.
                {hasMoves && analysis.engineStatus !== 'ready'
                  ? analysis.engineStatus === 'error'
                    ? ' The engine could not start, so the review is unavailable.'
                    : ' The review starts once the engine has loaded.'
                  : ''}
              </p>
            ) : null}
          </Card>
        </aside>
      </div>

      <AddToRepertoireDialog
        open={repertoireOpen}
        onClose={() => setRepertoireOpen(false)}
        line={repertoireOpen ? lineOf(tree, current) : []}
        defaultColor={orientation}
      />

      {saveOpen ? (
        <SaveAnalysisDialog
          open
          onClose={() => setSaveOpen(false)}
          pgn={analysis.pgn()}
          startFen={tree.startFen}
          moves={Math.ceil(mainLine.length / 2)}
          suggestedName={
            openEntry?.name ??
            (analysis.opening ? displayOpeningName(analysis.opening.name) : 'Analysis')
          }
          existing={openEntry}
          onSaved={setOpenEntry}
        />
      ) : null}
      <LibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onOpen={(entry) => {
          // Opening replaces the board: ask first when there is unsaved work on it.
          if (hasContent && entry.id !== openEntry?.id) setPendingOpen(entry);
          else openFromLibrary(entry);
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset the board?"
        confirmLabel="Reset board"
        danger
        onConfirm={reset}
        onClose={() => setConfirmReset(false)}
      >
        The moves, variations and comments on the board are not saved anywhere. Use “Save” first to
        keep them in the library.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingOpen !== null}
        title={pendingOpen ? `Open “${pendingOpen.name}”?` : 'Open analysis?'}
        confirmLabel="Open"
        onConfirm={() => {
          if (pendingOpen) openFromLibrary(pendingOpen);
        }}
        onClose={() => setPendingOpen(null)}
      >
        It replaces what is on the board now, which is not saved anywhere.
      </ConfirmDialog>
      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} title="Board editor" wide>
        {editorOpen ? (
          <BoardEditor
            initialFen={viewed.fen}
            onApply={(fen) => {
              if (analysis.loadFen(fen)) {
                setEditorOpen(false);
                setOrientation(fen.split(' ')[1] === 'b' ? 'black' : 'white');
              } else {
                toast('That position could not be loaded.', { tone: 'warning' });
              }
            }}
            onCancel={() => setEditorOpen(false)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

/** "12." or "12…" for the move that leads to `node`. */
function moveNumberLabel(node: { ply: number }, startFen: string): string {
  const startsWithBlack = startFen.split(' ')[1] === 'b';
  const startMoveNumber = Number(startFen.split(' ')[5] ?? 1);
  const index = node.ply - 1 + (startsWithBlack ? 1 : 0);
  return `${startMoveNumber + Math.floor(index / 2)}${index % 2 === 0 ? '.' : '…'}`;
}

function KeyMoments({
  review,
  currentPly,
  onSelect,
  startMoveNumber,
  startsWithBlack,
  line,
  meta,
}: {
  review: ReviewSummary;
  currentPly: number;
  onSelect: (ply: number) => void;
  startMoveNumber: number;
  startsWithBlack: boolean;
  line: MainLine;
  meta: OwnPuzzleMeta;
}) {
  const ownPuzzles = useProgress((s) => s.ownPuzzles);
  const addOwnPuzzles = useProgress((s) => s.addOwnPuzzles);
  const moments = keyMoments(review);
  const candidates = useMemo(
    () => ownPuzzlesFromReview(line, review, meta, { includeInaccuracies: true }),
    // meta is rebuilt on every render by the caller; its fields are what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [line, review, meta.title, meta.url, meta.rating],
  );
  const newCandidates = candidates.filter((p) => !ownPuzzles[p.id]);
  if (moments.length === 0) {
    return (
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        No mistakes found along the main line — nicely played.
      </p>
    );
  }
  const label = (ply: number) => {
    const index = ply - 1 + (startsWithBlack ? 1 : 0);
    return `${startMoveNumber + Math.floor(index / 2)}${index % 2 === 0 ? '.' : '…'}`;
  };
  const addOne = (ply: number) => {
    const moment = review.moves.find((m) => m.ply === ply);
    const puzzle = moment ? ownPuzzleFromMoment(line, moment, meta) : null;
    if (!puzzle) {
      toast('That moment cannot become a puzzle (no better move to find).', { tone: 'warning' });
      return;
    }
    const added = addOwnPuzzles([puzzle]);
    toast(
      added ? 'Added to My puzzles — find it under Puzzles → Mine.' : 'Already in My puzzles.',
      { tone: added ? 'success' : 'info' },
    );
  };
  const addAll = () => {
    const added = addOwnPuzzles(newCandidates);
    toast(
      added
        ? `Added ${added} puzzle${added === 1 ? '' : 's'} from this game — Puzzles → Mine.`
        : 'Every mistake of this game is already in My puzzles.',
      { tone: added ? 'success' : 'info' },
    );
  };
  return (
    <div style={{ marginTop: 8 }}>
      <div className="row row--between">
        <p className="small muted" style={{ margin: 0 }}>
          Key moments — click to jump there:
        </p>
        {candidates.length > 0 ? (
          <Button size="sm" onClick={addAll} disabled={newCandidates.length === 0}>
            {newCandidates.length === 0
              ? 'All saved as puzzles'
              : `Add ${newCandidates.length} as puzzle${newCandidates.length === 1 ? '' : 's'}`}
          </Button>
        ) : null}
      </div>
      <ol role="list" className="moments">
        {moments.map((m) => {
          const moment = review.moves.find((r) => r.ply === m.ply);
          const puzzle = moment ? ownPuzzleFromMoment(line, moment, meta) : null;
          const saved = puzzle ? !!ownPuzzles[puzzle.id] : false;
          return (
            <li key={m.ply} className="moments__row">
              <button
                type="button"
                className="moments__item"
                onClick={() => onSelect(m.ply)}
                aria-current={currentPly === m.ply ? 'true' : undefined}
              >
                <span className={`moments__move moments__move--${m.judgement ?? 'good'}`}>
                  {label(m.ply)} <San san={m.san} />
                </span>
                <span className="small">
                  {m.judgement === 'inaccuracy' ? 'an inaccuracy' : `a ${m.judgement}`} by {m.mover}
                  {m.best ? (
                    <>
                      {' — better was '}
                      <San san={m.best} />
                    </>
                  ) : null}
                </span>
                <span className="small faint">−{Math.round(m.loss * 100)}%</span>
                {moment ? (
                  <span className="small moments__why" data-testid="moment-why">
                    <Notated text={explainReviewedMove(moment)?.text ?? ''} />
                  </span>
                ) : null}
              </button>
              {puzzle ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon
                  aria-label={saved ? 'Saved as a puzzle' : 'Add to my puzzles'}
                  title={saved ? 'Saved as a puzzle' : 'Add to my puzzles'}
                  disabled={saved}
                  onClick={() => addOne(m.ply)}
                >
                  <Icon name={saved ? 'check' : 'plus'} size={14} />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ReviewSummaryView({ review }: { review: ReviewSummary }) {
  const rows: { label: string; side: 'white' | 'black' }[] = [
    { label: 'White', side: 'white' },
    { label: 'Black', side: 'black' },
  ];
  return (
    <table className="review-table" style={{ marginTop: 8 }}>
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">Accuracy</th>
          <th scope="col" title="Inaccuracies">
            ?!
          </th>
          <th scope="col" title="Mistakes">
            ?
          </th>
          <th scope="col" title="Blunders">
            ??
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, side }) => (
          <tr key={side}>
            <th scope="row">{label}</th>
            <td>{review.accuracy[side]}%</td>
            <td className="review-table__inaccuracy">{review.counts[side].inaccuracy}</td>
            <td className="review-table__mistake">{review.counts[side].mistake}</td>
            <td className="review-table__blunder">{review.counts[side].blunder}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Why a judged move was bad, in words, with the lesson and puzzle theme that
 * teach the motif. Empty when the review does not carry enough detail.
 */
function MoveExplanation({ move }: { move: ReviewSummary['moves'][number] }) {
  const explanation = useMemo(() => explainReviewedMove(move), [move]);
  if (!explanation) return null;
  const help = MOTIF_HELP[explanation.motif];
  const lesson = getLessonMeta(help.lesson);
  return (
    <span data-testid="move-explanation">
      {' '}
      <Notated text={explanation.text} />
      {lesson ? (
        <>
          {' '}
          <Link to={`/learn/${lesson.id}`}>Lesson: {lesson.title}</Link>
        </>
      ) : null}
      {help.theme ? (
        <>
          {' · '}
          <Link to={`/puzzles/themes?theme=${help.theme}`}>Practise: {themeName(help.theme)}</Link>
        </>
      ) : null}
    </span>
  );
}

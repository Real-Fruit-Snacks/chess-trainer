import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { EngineLines, EngineStatus } from '@/components/chess/EngineLines';
import { EvalBar } from '@/components/chess/EvalBar';
import { type MoveJudgement, MoveList, MoveNavigation } from '@/components/chess/MoveList';
import { Alert, Button, Card, Field, ProgressBar, Switch } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { isValidFen } from '@/chess/helpers';
import type { LongColor } from '@/chess/types';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { HANDOFF_PGN_KEY } from '@/features/play/PlayPage';
import { useAnalysis } from './useAnalysis';
import './analyze.css';

export default function AnalyzePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const analysis = useAnalysis();
  const settings = useSettings();
  const [orientation, setOrientation] = useState<LongColor>('white');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    document.title = `Analyze · ${siteConfig.name}`;
  }, []);

  // Handoffs: ?fen=… from puzzles/lessons, ?from=game after playing the engine.
  useEffect(() => {
    const fen = searchParams.get('fen');
    const from = searchParams.get('from');
    if (fen) {
      if (!analysis.loadFen(fen)) toast('That FEN could not be loaded.', { tone: 'warning' });
      else setOrientation(fen.split(' ')[1] === 'b' ? 'black' : 'white');
    } else if (from === 'game') {
      const pgn = sessionStorage.getItem(HANDOFF_PGN_KEY);
      if (pgn && analysis.loadPgn(pgn)) {
        const playedBlack = pgn.includes('[Black "You"]');
        setOrientation(playedBlack ? 'black' : 'white');
      }
    } else {
      return;
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { viewed, moves, viewPly } = analysis;
  const score = analysis.lines.get(1)?.score ?? null;
  const result = useMemo(() => {
    const status = analysis.game.position.status;
    return viewPly === moves.length && status.over && status.result !== '*' ? status.result : null;
  }, [analysis.game.position.status, viewPly, moves.length]);

  const judgements = useMemo<(MoveJudgement | undefined)[] | undefined>(
    () => analysis.review?.moves.map((m) => m.judgement),
    [analysis.review],
  );
  const reviewedCurrent = analysis.review?.moves[viewPly - 1];

  const doImport = () => {
    const text = importText.trim();
    if (!text) return;
    setImportError(null);
    if (isValidFen(text)) {
      analysis.loadFen(text);
      setShowImport(false);
      return;
    }
    if (analysis.loadPgn(text)) {
      setShowImport(false);
      return;
    }
    setImportError('Could not read that as a FEN or a PGN. Check the text and try again.');
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`);
    } catch {
      toast('Clipboard unavailable.', { tone: 'warning' });
    }
  };

  const moveLabel = `${viewed.moveNumber}${viewed.turn === 'black' ? '…' : '.'}`;

  return (
    <div>
      <div className="page-header row row--between">
        <div>
          <h1>Analysis board</h1>
          <p>Set up any position, paste a game, and let Stockfish show you the best lines.</p>
        </div>
        <div className="row">
          <Button onClick={() => setShowImport((v) => !v)}>
            {showImport ? 'Close import' : 'Import FEN / PGN'}
          </Button>
          <Button variant="ghost" onClick={analysis.reset}>
            Reset board
          </Button>
        </div>
      </div>

      {showImport ? (
        <Card className="analyze__import">
          <Field
            label="Paste a FEN or a PGN"
            hint="Games from Chess Trainer, Lichess or chess.com all work."
          >
            {(id) => (
              <textarea
                id={id}
                className="textarea"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={
                  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\n\nor\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 …'
                }
                spellCheck={false}
              />
            )}
          </Field>
          {importError ? <Alert tone="danger">{importError}</Alert> : null}
          <div className="row" style={{ marginTop: 12 }}>
            <Button variant="primary" onClick={doImport}>
              Load
            </Button>
            <Button variant="ghost" onClick={() => setImportText('')}>
              Clear
            </Button>
          </div>
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
        <div className="trainer__board" style={{ position: 'relative' }}>
          <EvalBar
            score={analysis.engineOn ? score : null}
            turn={viewed.turn}
            orientation={orientation}
            result={result}
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
              autoShapes={analysis.bestMoveShape}
              onMove={(from, to) => analysis.playMove(from, to)}
              ariaLabel={`Analysis board, ${viewed.turn} to move`}
            />
            {analysis.game.pendingPromotion ? (
              <PromotionPicker
                color={analysis.game.pendingPromotion.color}
                onSelect={analysis.resolvePromotion}
              />
            ) : null}
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
                name="Stockfish 19 lite"
                depth={analysis.depthReached}
                nps={analysis.nps}
                thinking={analysis.thinking}
              />
            </div>
          </Card>

          <Card>
            <MoveNavigation
              currentPly={viewPly}
              total={moves.length}
              onSelectPly={analysis.setViewPly}
            />
            <div style={{ marginTop: 8 }}>
              <MoveList
                moves={moves}
                currentPly={viewPly}
                onSelectPly={analysis.setViewPly}
                judgements={judgements}
                startMoveNumber={Number(analysis.game.position.startFen.split(' ')[5] ?? 1)}
                startsWithBlack={analysis.game.position.startFen.split(' ')[1] === 'b'}
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
                <strong>{reviewedCurrent.san}</strong> was{' '}
                {reviewedCurrent.judgement === 'inaccuracy' ? 'an' : 'a'}{' '}
                {reviewedCurrent.judgement}.
                {reviewedCurrent.best ? (
                  <>
                    {' '}
                    Better was <strong>{reviewedCurrent.best}</strong>.
                  </>
                ) : null}
              </Alert>
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
                onClick={() => void copy(analysis.game.pgn(), 'PGN')}
                disabled={moves.length === 0}
              >
                Copy PGN
              </Button>
            </div>
          </Card>

          <Card>
            <div className="row row--between">
              <strong>Game review</strong>
              {analysis.reviewProgress === null ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={analysis.startReview}
                  disabled={moves.length === 0 || analysis.engineStatus !== 'ready'}
                >
                  {analysis.review ? 'Review again' : 'Review game'}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={analysis.cancelReview}>
                  Cancel
                </Button>
              )}
            </div>
            {analysis.reviewProgress !== null ? (
              <div style={{ marginTop: 8 }}>
                <ProgressBar value={analysis.reviewProgress} label="Review progress" />
                <p className="small muted" style={{ margin: '6px 0 0' }}>
                  Evaluating every position… {Math.round(analysis.reviewProgress * 100)}%
                </p>
              </div>
            ) : null}
            {analysis.review ? <ReviewSummaryView review={analysis.review} /> : null}
            {!analysis.review && analysis.reviewProgress === null ? (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                Finds inaccuracies, mistakes and blunders for both sides and shows the better move.
                Play a game against the engine, then hit <Link to="/play">Analyze game</Link>, or
                paste a PGN above.
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ReviewSummaryView({
  review,
}: {
  review: NonNullable<ReturnType<typeof useAnalysis>['review']>;
}) {
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

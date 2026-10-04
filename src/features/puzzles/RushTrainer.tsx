import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { Alert, Badge, Button, Card, Kbd, Stat, Icon } from '@/components/ui';
import { formatDate, formatDuration } from '@/lib/dates';
import { NONE } from '@/lib/format';
import { shortcutKey } from '@/lib/shortcutKey';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { RUSH_STRIKES, type RushMode, useRush } from './useRush';

export function RushTrainer() {
  const puzzleRating = useProgress((s) => s.puzzleRating);
  const rushRuns = useProgress((s) => s.rushRuns);
  const rush = useRush(puzzleRating);
  const { trainer } = rush;

  const best = useMemo(
    () => ({
      timed: Math.max(0, ...rushRuns.filter((r) => r.mode === 'timed').map((r) => r.score)),
      survival: Math.max(0, ...rushRuns.filter((r) => r.mode === 'survival').map((r) => r.score)),
    }),
    [rushRuns],
  );

  // Keyboard: Enter starts a run — the 3-minute one before the first run, the last mode after.
  useEffect(() => {
    if (rush.phase !== 'finished' && rush.phase !== 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      if (shortcutKey(e) !== 'Enter') return;
      e.preventDefault();
      rush.start(rush.phase === 'finished' ? rush.mode : 'timed');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rush]);

  const solverIsMoving = rush.phase === 'running' && trainer.phase === 'solving';
  const strikeMarks = Array.from({ length: RUSH_STRIKES }, (_, i) => i < rush.strikes);
  const strikesText = `${rush.strikes} of ${RUSH_STRIKES} strikes`;

  return (
    <div className="trainer trainer--lead">
      <div className="trainer__board" style={{ position: 'relative' }}>
        <Board
          fen={trainer.position.fen}
          orientation={trainer.solverColor}
          turnColor={trainer.position.turn}
          movableColor={solverIsMoving ? trainer.solverColor : undefined}
          dests={solverIsMoving ? trainer.position.dests : new Map()}
          lastMove={trainer.position.lastMove}
          check={trainer.position.check}
          highlights={trainer.highlights}
          // Promotions always ask: some puzzles need an underpromotion.
          onMove={(from, to) => trainer.playUserMove(from, to)}
          ariaLabel={
            trainer.puzzle ? `Rush puzzle, ${trainer.solverColor} to move` : 'Puzzle Rush board'
          }
        />
        {trainer.needsPromotion ? (
          <PromotionPicker color={trainer.solverColor} onSelect={trainer.resolvePromotion} />
        ) : null}
        {rush.phase === 'idle' ? (
          <div className="trainer__overlay">
            <Card className="rush__start">
              <h2 style={{ marginTop: 0 }}>Puzzle Rush</h2>
              <p className="muted">
                Solve as many puzzles as you can. Each one is a little harder than the last, a wrong
                move is a strike, and three strikes end the run. No hints, no rating changes.
              </p>
              <div className="row">
                <Button variant="primary" size="lg" onClick={() => rush.start('timed')}>
                  3 minutes <Kbd>Enter</Kbd>
                </Button>
                <Button size="lg" onClick={() => rush.start('survival')}>
                  Survival
                </Button>
              </div>
            </Card>
          </div>
        ) : null}
        {rush.phase === 'finished' && rush.summary ? (
          <div className="trainer__overlay">
            <Card className="rush__start">
              <p className="card__eyebrow">
                {rush.summary.mode === 'timed' ? '3 minutes' : 'Survival'}
              </p>
              <h2 style={{ margin: '4px 0' }}>
                {rush.summary.score} solved
                {rush.summary.score > 0 && rush.summary.score >= best[rush.summary.mode]
                  ? ' · new best!'
                  : ''}
              </h2>
              <p className="muted">
                Peak puzzle rating {rush.summary.peakRating || NONE} · {rush.summary.strikes} strike
                {rush.summary.strikes === 1 ? '' : 's'} · {formatDuration(rush.summary.durationMs)}
              </p>
              <ol role="list" className="rush__results" aria-label="Puzzles in this run, by rating">
                {rush.summary.results.map((r, i) => (
                  <li
                    key={i}
                    className={`rush__result rush__result--${r.solved ? 'solved' : 'failed'}`}
                  >
                    <span className="sr-only">{r.solved ? 'Solved' : 'Missed'}: </span>
                    {r.rating}
                  </li>
                ))}
              </ol>
              <div className="row" style={{ marginTop: 12 }}>
                <Button variant="primary" onClick={() => rush.start(rush.summary?.mode ?? 'timed')}>
                  Play again <Kbd>Enter</Kbd>
                </Button>
                <Button
                  onClick={() => rush.start(rush.summary?.mode === 'timed' ? 'survival' : 'timed')}
                >
                  Try {rush.summary.mode === 'timed' ? 'survival' : '3 minutes'}
                </Button>
              </div>
            </Card>
          </div>
        ) : null}
      </div>

      <Card className="trainer__lead">
        <div className="rush__hud">
          <Stat
            value={formatDuration(rush.clockMs)}
            label={rush.mode === 'timed' ? 'Time left' : 'Elapsed'}
          />
          <Stat value={rush.score} label="Solved" />
          <div className="stat">
            <span className="rush__strikes" role="img" aria-label={strikesText}>
              {strikeMarks.map((hit, i) => (
                <span
                  key={i}
                  className={`rush__strike${hit ? ' rush__strike--hit' : ''}`}
                  aria-hidden="true"
                >
                  <Icon name="close" size={14} />
                </span>
              ))}
            </span>
            <span className="stat__label">Strikes</span>
          </div>
        </div>
        <p className={`puzzle-status puzzle-status--${trainer.phase}`} role="status">
          {rush.phase !== 'running'
            ? ' '
            : trainer.phase === 'solving'
              ? trainer.position.check
                ? 'Your move — you are in check!'
                : 'Your move.'
              : trainer.phase === 'solved'
                ? 'Solved!'
                : trainer.phase === 'failed'
                  ? `Missed — strike ${rush.strikes} of ${RUSH_STRIKES}. Next puzzle…`
                  : trainer.phase === 'replying'
                    ? 'Good — opponent replies…'
                    : 'Watch the opponent’s move…'}
        </p>
        {trainer.puzzle && rush.phase === 'running' ? (
          <p className="small muted" style={{ margin: 0 }}>
            <Badge>Rating {trainer.puzzle.rating}</Badge>{' '}
            {trainer.position.total > 1
              ? `${trainer.position.progress}/${trainer.position.total} moves`
              : ''}
          </p>
        ) : null}
        {rush.phase === 'running' ? (
          <div className="puzzle-actions">
            <Button variant="ghost" onClick={rush.stop}>
              End run
            </Button>
          </div>
        ) : null}
      </Card>

      <aside className="trainer__panel stack">
        {rush.error ? <Alert tone="warning">{rush.error}</Alert> : null}

        <Card>
          <div className="puzzle-stats">
            <Stat value={best.timed} label="Best · 3 minutes" />
            <Stat value={best.survival} label="Best · survival" />
            <Stat value={rushRuns.length} label="Runs" />
          </div>
          {rushRuns.length ? (
            <ul role="list" className="rush__history">
              {rushRuns.slice(0, 5).map((run) => (
                <li key={run.at}>
                  <span>{run.mode === 'timed' ? '3 min' : 'Survival'}</span>
                  <strong>{run.score}</strong>
                  <span className="muted small">peak {run.peakRating || NONE}</span>
                  <span className="muted small">{formatDate(run.at, siteConfig.locale)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              Your runs will show up here. Start around{' '}
              {Math.max(400, Math.min(puzzleRating - 500, 1500))} and climb from there.
            </p>
          )}
        </Card>

        <p className="small faint">
          Rush is unrated but still counts towards your theme statistics on the{' '}
          <Link to="/progress">Progress</Link> page. Prefer a calmer pace?{' '}
          <Link to="/puzzles">Rated puzzles</Link>.
        </p>
      </aside>
    </div>
  );
}

export type { RushMode };

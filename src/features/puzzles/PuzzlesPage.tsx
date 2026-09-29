import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import {
  Alert,
  Badge,
  Button,
  Card,
  Kbd,
  LinkButton,
  ProgressBar,
  Segmented,
  Spinner,
  Stat,
  Switch,
} from '@/components/ui';
import { formatDuration, localDateKey } from '@/lib/dates';
import { formatRating, PROVISIONAL_GAMES, STARTING_RATINGS } from '@/lib/rating';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import {
  dailyPuzzle,
  findPuzzleById,
  loadPuzzleIndex,
  type Puzzle,
  type PuzzleIndex,
  selectPuzzle,
} from './puzzleService';
import { PRACTICE_GROUPS, THEMES, themeDescription, themeName } from './themes';
import { type PuzzleOutcomeEvent, usePuzzleTrainer } from './usePuzzleTrainer';
import './puzzles.css';

type Mode = 'rated' | 'daily' | 'themes';

export default function PuzzlesPage() {
  const params = useParams<{ mode?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const onboarded = useProgress((s) => s.onboarded);

  const mode: Mode =
    params.mode === 'daily' ? 'daily' : params.mode === 'themes' ? 'themes' : 'rated';
  const themeFilter = searchParams.get('theme');
  const puzzleId = searchParams.get('id');

  useEffect(() => {
    document.title = `Puzzles · ${siteConfig.name}`;
  }, []);

  if (!onboarded) return <Onboarding />;

  return (
    <div>
      <div className="page-header row row--between">
        <div>
          <h1>Puzzles</h1>
          <p>Engine-verified tactics from real games, picked to match your level.</p>
        </div>
        <Segmented
          ariaLabel="Puzzle mode"
          value={mode}
          onChange={(m) => navigate(m === 'rated' ? '/puzzles' : `/puzzles/${m}`)}
          options={[
            { value: 'rated', label: 'Rated' },
            { value: 'daily', label: 'Daily' },
            { value: 'themes', label: 'By theme' },
          ]}
        />
      </div>

      {mode === 'themes' && !themeFilter ? (
        <ThemeCatalog />
      ) : (
        <Trainer
          key={`${mode}:${themeFilter ?? ''}:${puzzleId ?? ''}`}
          mode={mode}
          theme={themeFilter}
          puzzleId={puzzleId}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding: pick a starting rating                                 */
/* ------------------------------------------------------------------ */
function Onboarding() {
  const complete = useProgress((s) => s.completeOnboarding);
  const [choice, setChoice] = useState<(typeof STARTING_RATINGS)[number]['id']>('beginner');
  const selected = STARTING_RATINGS.find((o) => o.id === choice) ?? STARTING_RATINGS[1];

  return (
    <div className="onboarding">
      <Card>
        <p className="card__eyebrow">Before you start</p>
        <h2>How much chess have you played?</h2>
        <p className="muted">
          This only sets your starting puzzle rating. It adjusts quickly — after a few puzzles you
          will be getting positions that are just right for you.
        </p>
        <div className="onboarding__options" role="radiogroup" aria-label="Experience level">
          {STARTING_RATINGS.map((option) => (
            <label
              key={option.id}
              className={`onboarding__option${option.id === choice ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="level"
                value={option.id}
                checked={option.id === choice}
                onChange={() => setChoice(option.id)}
              />
              <span>{option.label}</span>
              <span className="badge">~{option.rating}</span>
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <Button variant="primary" size="lg" onClick={() => complete(selected.rating)}>
            Start solving at {selected.rating}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Theme catalogue                                                    */
/* ------------------------------------------------------------------ */
function ThemeCatalog() {
  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPuzzleIndex()
      .then(setIndex)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <Alert tone="danger">Could not load the puzzle index: {error}</Alert>;
  if (!index) return <Spinner label="Loading themes…" />;

  const groups = PRACTICE_GROUPS.map((group) => ({
    group,
    themes: Object.entries(THEMES)
      .filter(([tag, info]) => info.group === group && (index.themes[tag] ?? 0) >= 10)
      .map(([tag, info]) => ({ tag, info, count: index.themes[tag] ?? 0 }))
      .sort((a, b) => b.count - a.count),
  })).filter((g) => g.themes.length > 0);

  return (
    <div className="stack">
      <p className="muted">
        Practise one idea at a time. Theme practice is <strong>unrated</strong> so you can drill
        freely.
      </p>
      {groups.map(({ group, themes }) => (
        <section key={group}>
          <h2>{group}</h2>
          <div className="grid grid--cards">
            {themes.map(({ tag, info, count }) => (
              <Link
                key={tag}
                to={`/puzzles/themes?theme=${encodeURIComponent(tag)}`}
                className="card card--interactive theme-card"
              >
                <div className="row row--between">
                  <span className="card__title">{info.name}</span>
                  <Badge>{count}</Badge>
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {info.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The trainer                                                        */
/* ------------------------------------------------------------------ */
function Trainer({
  mode,
  theme,
  puzzleId,
}: {
  mode: Mode;
  theme: string | null;
  puzzleId: string | null;
}) {
  const progress = useProgress();
  const autoNext = useSettings((s) => s.puzzleAutoNext);
  const updateSettings = useSettings((s) => s.update);
  const autoQueen = useSettings((s) => s.autoQueen);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [sessionSolved, setSessionSolved] = useState(0);
  const [sessionFailed, setSessionFailed] = useState(0);
  const rated = mode === 'rated' && !puzzleId;

  const onOutcome = useCallback(
    (event: PuzzleOutcomeEvent, puzzle: Puzzle) => {
      const { before, after } = progress.recordPuzzle({
        id: puzzle.id,
        puzzleRating: puzzle.rating,
        outcome: event.outcome,
        hintUsed: event.hintUsed,
        themes: puzzle.themes,
        durationMs: event.durationMs,
        rated,
      });
      setLastDelta(rated ? after - before : null);
      if (event.outcome === 'solved') setSessionSolved((n) => n + 1);
      else setSessionFailed((n) => n + 1);
      if (mode === 'daily') {
        progress.setDaily({ date: localDateKey(), id: puzzle.id, outcome: event.outcome });
      }
    },
    // progress actions are stable; recordPuzzle reads fresh state internally
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rated, mode],
  );

  const trainer = usePuzzleTrainer(onOutcome);
  const { load } = trainer;
  const currentIdRef = useRef<string | null>(null);

  const next = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLastDelta(null);
    try {
      let puzzle: Puzzle | null = null;
      if (puzzleId) {
        puzzle = await findPuzzleById(puzzleId);
        if (!puzzle) throw new Error(`Puzzle "${puzzleId}" is not in the bundled set.`);
      } else if (mode === 'daily') {
        puzzle = await dailyPuzzle(localDateKey());
      } else {
        const state = useProgress.getState();
        puzzle = await selectPuzzle({
          rating: state.puzzleRating,
          seen: state.seen,
          themes: theme ? [theme] : undefined,
          excludeId: currentIdRef.current,
        });
      }
      if (!puzzle) throw new Error('No puzzles matched. Try another theme.');
      currentIdRef.current = puzzle.id;
      load(puzzle);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mode, theme, puzzleId, load]);

  useEffect(() => {
    void next();
  }, [next]);

  // Auto-advance after a solve.
  useEffect(() => {
    if (!autoNext || trainer.phase !== 'solved' || mode === 'daily' || puzzleId) return;
    const id = window.setTimeout(() => void next(), 1200);
    return () => window.clearTimeout(id);
  }, [autoNext, trainer.phase, next, mode, puzzleId]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'n' && (trainer.phase === 'solved' || trainer.phase === 'failed')) void next();
      if (e.key === 'h') trainer.hint();
      if (e.key === 's') trainer.showSolution();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trainer, next]);

  const dailyDone =
    mode === 'daily' && progress.daily?.date === localDateKey() && progress.daily.outcome !== null;

  const statusText = useMemo(() => {
    switch (trainer.phase) {
      case 'intro':
        return 'Watch the opponent’s move…';
      case 'solving':
        return trainer.position.check ? 'Your move — you are in check!' : 'Your move.';
      case 'replying':
        return 'Good move! Opponent replies…';
      case 'solved':
        return trainer.practiceAfterFail ? 'Solved (after a miss).' : 'Puzzle solved!';
      case 'failed':
        return 'Not the best move.';
      default:
        return '';
    }
  }, [trainer.phase, trainer.position.check, trainer.practiceAfterFail]);

  const puzzle = trainer.puzzle;
  const solverIsMoving = trainer.phase === 'solving';

  return (
    <div className="trainer">
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
          shapes={trainer.shapes}
          onMove={(from, to) => trainer.playUserMove(from, to, autoQueen ? 'q' : undefined)}
          ariaLabel={
            puzzle ? `Puzzle ${puzzle.id}, ${trainer.solverColor} to move` : 'Loading puzzle'
          }
        />
        {trainer.needsPromotion ? (
          <PromotionPicker color={trainer.solverColor} onSelect={trainer.resolvePromotion} />
        ) : null}
        {loading ? (
          <div className="trainer__overlay">
            <Spinner label="Finding a puzzle…" />
          </div>
        ) : null}
      </div>

      <aside className="trainer__panel stack">
        {error ? (
          <Alert tone="danger" role="alert">
            {error}{' '}
            <Button size="sm" onClick={() => void next()}>
              Retry
            </Button>
          </Alert>
        ) : null}

        <Card>
          <div className="row row--between">
            <div className="row">
              <span
                className={`playerbar__dot playerbar__dot--${trainer.solverColor}`}
                aria-hidden="true"
              />
              <strong>{trainer.solverColor === 'white' ? 'White' : 'Black'} to move</strong>
            </div>
            <span className="mono muted small">{formatDuration(trainer.elapsedMs)}</span>
          </div>
          <p className={`puzzle-status puzzle-status--${trainer.phase}`} role="status">
            {statusText}
          </p>
          {trainer.position.total > 1 ? (
            <ProgressBar
              value={trainer.position.progress}
              max={trainer.position.total}
              label="Moves found"
            />
          ) : null}

          <div className="puzzle-actions">
            {trainer.phase === 'solving' || trainer.phase === 'replying' ? (
              <>
                <Button onClick={trainer.hint} disabled={trainer.phase !== 'solving'}>
                  {trainer.hintLevel === 0
                    ? 'Hint'
                    : trainer.hintLevel === 1
                      ? 'Show move'
                      : 'Hint shown'}{' '}
                  <Kbd>H</Kbd>
                </Button>
                <Button variant="ghost" onClick={trainer.showSolution}>
                  Solution <Kbd>S</Kbd>
                </Button>
              </>
            ) : null}
            {trainer.phase === 'failed' ? (
              <>
                <Button variant="primary" onClick={trainer.retry}>
                  Try again
                </Button>
                <Button onClick={trainer.showSolution}>Show solution</Button>
                {!puzzleId && mode !== 'daily' ? (
                  <Button variant="ghost" onClick={() => void next()}>
                    Skip <Kbd>N</Kbd>
                  </Button>
                ) : null}
              </>
            ) : null}
            {trainer.phase === 'solved' && !puzzleId && mode !== 'daily' ? (
              <Button variant="primary" onClick={() => void next()} autoFocus>
                Next puzzle <Kbd>N</Kbd>
              </Button>
            ) : null}
            {trainer.phase === 'solved' && (mode === 'daily' || puzzleId) ? (
              <LinkButton variant="primary" to="/puzzles">
                Keep training
              </LinkButton>
            ) : null}
          </div>

          {lastDelta !== null ? (
            <p className={`small ${lastDelta >= 0 ? 'puzzle-delta--up' : 'puzzle-delta--down'}`}>
              Rating {lastDelta >= 0 ? '+' : ''}
              {lastDelta} → <strong>{formatRating(progress.puzzleRating)}</strong>
            </p>
          ) : null}
          {trainer.practiceAfterFail && trainer.phase !== 'solved' ? (
            <p className="small muted">You can keep trying — this attempt is no longer rated.</p>
          ) : null}
          {dailyDone && trainer.phase !== 'solved' && trainer.phase !== 'failed' ? (
            <p className="small muted">
              You already did today’s puzzle; playing it again is unrated.
            </p>
          ) : null}
        </Card>

        <Card>
          <div className="puzzle-stats">
            {rated ? (
              <Stat
                value={formatRating(progress.puzzleRating)}
                label={
                  progress.ratedAttempts < PROVISIONAL_GAMES
                    ? `Puzzle rating (provisional, ${progress.ratedAttempts}/${PROVISIONAL_GAMES})`
                    : 'Puzzle rating'
                }
              />
            ) : (
              <Stat
                value={theme ? themeName(theme) : mode === 'daily' ? 'Daily' : 'Practice'}
                label="Unrated practice"
              />
            )}
            <Stat
              value={`${sessionSolved} / ${sessionSolved + sessionFailed}`}
              label="Solved this session"
            />
            <Stat
              value={progress.streak.current}
              label={`Day streak (best ${progress.streak.best})`}
            />
          </div>
          {theme ? (
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
              {themeDescription(theme)} <Link to="/puzzles/themes">All themes</Link>
            </p>
          ) : null}
        </Card>

        {puzzle ? (
          <Card>
            <details>
              <summary className="small">About this puzzle</summary>
              <div className="stack-sm small" style={{ marginTop: 8 }}>
                <div className="row">
                  <Badge tone="accent">Rating {puzzle.rating}</Badge>
                  {puzzle.themes.split(' ').map((t) => (
                    <Link
                      key={t}
                      to={`/puzzles/themes?theme=${encodeURIComponent(t)}`}
                      className="badge"
                    >
                      {themeName(t)}
                    </Link>
                  ))}
                </div>
                <div className="muted">
                  Puzzle <code>{puzzle.id}</code> from the Lichess database (CC0).{' '}
                  <a href={puzzle.url} target="_blank" rel="noreferrer">
                    Source game
                  </a>{' '}
                  ·{' '}
                  <Link to={`/analyze?fen=${encodeURIComponent(trainer.position.fen)}`}>
                    Analyze position
                  </Link>
                </div>
              </div>
            </details>
          </Card>
        ) : null}

        {!puzzleId && mode !== 'daily' ? (
          <Switch
            checked={autoNext}
            onChange={(v) => updateSettings({ puzzleAutoNext: v })}
            label="Auto-advance after a solve"
          />
        ) : null}

        {mode === 'rated' && !puzzleId ? (
          <p className="small faint">
            Rated mode adjusts your rating after each puzzle, like a game. Hints halve the credit
            for a solve. <Link to="/puzzles/daily">Today’s puzzle</Link> ·{' '}
            <Link to="/puzzles/themes">Practice by theme</Link>
          </p>
        ) : null}
      </aside>
    </div>
  );
}

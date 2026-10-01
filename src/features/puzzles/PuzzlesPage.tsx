import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dueReviews, nextReview } from '@/lib/puzzleReview';
import { useNow } from '@/lib/useNow';
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
import { toast } from '@/components/ui/toastStore';
import { formatDate, formatDuration, localDateKey } from '@/lib/dates';
import { formatRatingWithRd, isProvisional } from '@/lib/glicko';
import { CALIBRATION_PUZZLES, formatRating, STARTING_RATINGS } from '@/lib/rating';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { isOwnPuzzleId, type OwnPuzzle } from './ownPuzzles';
import {
  dailyPuzzle,
  findPuzzleById,
  loadPuzzleIndex,
  openingTagName,
  type Puzzle,
  type PuzzleIndex,
  selectPuzzle,
} from './puzzleService';
import { OpeningCatalog } from './OpeningCatalog';
import { WoodpeckerPanel } from './WoodpeckerPanel';
import { RushTrainer } from './RushTrainer';
import { PRACTICE_GROUPS, THEMES, themeDescription, themeName } from './themes';
import { type PuzzleOutcomeEvent, usePuzzleTrainer } from './usePuzzleTrainer';
import './puzzles.css';
import { Icon } from '@/components/ui';

type Mode = 'rated' | 'daily' | 'themes' | 'openings' | 'rush' | 'review' | 'mine' | 'woodpecker';

export default function PuzzlesPage() {
  const params = useParams<{ mode?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const onboarded = useProgress((s) => s.onboarded);
  const reviewQueue = useProgress((s) => s.puzzleReviews);
  const ownCount = useProgress((s) => Object.keys(s.ownPuzzles).length);
  const now = useNow(60_000, reviewQueue);
  const dueCount = useMemo(() => dueReviews(reviewQueue, now).length, [reviewQueue, now]);
  // The review queue empties while the last card is still on the board (its
  // reschedule happens on the outcome), so the empty state waits for "Next".
  const [reviewQueueEmpty, setReviewQueueEmpty] = useState(dueCount === 0);
  // Woodpecker: the panel shows the set; "Continue" opens the trainer for the running cycle,
  // which hands back to the panel when "Next" finds the cycle finished.
  const [woodpeckerSolving, setWoodpeckerSolving] = useState(false);
  useEffect(() => {
    setReviewQueueEmpty(dueReviews(useProgress.getState().puzzleReviews, Date.now()).length === 0);
  }, [params.mode]);

  const mode: Mode =
    params.mode === 'daily'
      ? 'daily'
      : params.mode === 'themes'
        ? 'themes'
        : params.mode === 'rush'
          ? 'rush'
          : params.mode === 'review'
            ? 'review'
            : params.mode === 'mine'
              ? 'mine'
              : params.mode === 'openings'
                ? 'openings'
                : params.mode === 'woodpecker'
                  ? 'woodpecker'
                  : 'rated';
  const themeFilter = searchParams.get('theme');
  const openingFilter = searchParams.get('opening');
  const puzzleId = searchParams.get('id');

  useEffect(() => {
    document.title = `Puzzles · ${siteConfig.name}`;
  }, []);

  if (!onboarded) return <Onboarding />;

  return (
    <div>
      <div className="page-header page-header--lean row row--between">
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
            { value: 'openings', label: 'By opening' },
            { value: 'rush', label: 'Rush' },
            {
              value: 'review',
              label: (
                <>Review{dueCount ? <span className="segmented__count">{dueCount}</span> : null}</>
              ),
            },
            { value: 'mine', label: 'Mine' },
            { value: 'woodpecker', label: 'Woodpecker' },
          ]}
        />
      </div>

      {mode === 'rush' ? (
        <RushTrainer />
      ) : mode === 'review' && reviewQueueEmpty ? (
        <ReviewEmpty />
      ) : mode === 'mine' && ownCount === 0 ? (
        <MineEmpty />
      ) : mode === 'themes' && !themeFilter ? (
        <ThemeCatalog />
      ) : mode === 'openings' && !openingFilter ? (
        <OpeningCatalog />
      ) : mode === 'woodpecker' && !woodpeckerSolving ? (
        <WoodpeckerPanel onContinue={() => setWoodpeckerSolving(true)} />
      ) : (
        <Trainer
          key={`${mode}:${themeFilter ?? ''}:${openingFilter ?? ''}:${puzzleId ?? ''}`}
          mode={mode}
          theme={themeFilter}
          opening={mode === 'openings' ? openingFilter : null}
          puzzleId={puzzleId}
          onQueueEmpty={() =>
            mode === 'woodpecker' ? setWoodpeckerSolving(false) : setReviewQueueEmpty(true)
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Own-game puzzles: none yet                                          */
/* ------------------------------------------------------------------ */
function MineEmpty() {
  return (
    <Card className="onboarding">
      <p className="card__eyebrow">My puzzles</p>
      <h2>No puzzles from your games yet</h2>
      <p className="muted">
        Review one of your games on the analysis board and every mistake becomes a puzzle: the
        position where you went wrong, with the engine’s better move as the solution. They come back
        here — and in the review queue — until you find the right move without thinking.
      </p>
      <div className="row">
        <LinkButton variant="primary" to="/analyze">
          Review a game
        </LinkButton>
        <LinkButton to="/games">Import your games</LinkButton>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Review queue: nothing due                                          */
/* ------------------------------------------------------------------ */
function ReviewEmpty() {
  const queue = useProgress((s) => s.puzzleReviews);
  const now = useNow();
  const upcoming = nextReview(queue);
  const total = Object.keys(queue).length;
  return (
    <Card className="onboarding">
      <p className="card__eyebrow">Review queue</p>
      <h2>Nothing to review right now</h2>
      <p className="muted">
        Puzzles you miss — in rated, theme or rush mode — come back here after a day. Solve them
        cleanly and they return after 3, 7, 14 and 30 days before graduating.
      </p>
      <p className="small muted">
        {total === 0
          ? 'Your queue is empty. Go solve some puzzles!'
          : `${total} puzzle${total === 1 ? '' : 's'} scheduled · next due ${
              upcoming ? formatDate(upcoming.due, siteConfig.locale) : '—'
            }${upcoming && upcoming.due - now < 3_600_000 ? ' (soon)' : ''}.`}
      </p>
      <div className="row">
        <LinkButton variant="primary" to="/puzzles">
          Rated puzzles
        </LinkButton>
        <LinkButton to="/puzzles/themes">Practice by theme</LinkButton>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding: pick a starting rating                                 */
/* ------------------------------------------------------------------ */
function Onboarding() {
  const complete = useProgress((s) => s.completeOnboarding);
  type Choice = 'calibrate' | (typeof STARTING_RATINGS)[number]['id'];
  const [choice, setChoice] = useState<Choice>('calibrate');
  const selected = STARTING_RATINGS.find((o) => o.id === choice);

  return (
    <div className="onboarding">
      <Card>
        <p className="card__eyebrow">Before you start</p>
        <h2>Where should your puzzle rating start?</h2>
        <p className="muted">
          The trainer keeps a puzzle rating that moves after every rated puzzle. Let it find your
          level with a short run of puzzles, or tell it roughly how much chess you have played. Not
          sure? The <Link to="/placement">placement quiz</Link> suggests a starting point and a
          course in two minutes.
        </p>
        <div className="onboarding__options" role="radiogroup" aria-label="Starting level">
          <label
            className={`onboarding__option${choice === 'calibrate' ? ' is-selected' : ''}`}
            data-testid="onboarding-calibrate"
          >
            <input
              type="radio"
              name="level"
              value="calibrate"
              checked={choice === 'calibrate'}
              onChange={() => setChoice('calibrate')}
            />
            <span>Find my level with {CALIBRATION_PUZZLES} puzzles (recommended)</span>
            <span className="badge badge--accent">calibrate</span>
          </label>
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
          <Button
            variant="primary"
            size="lg"
            onClick={() => (selected ? complete(selected.rating) : complete(0, 'calibrate'))}
          >
            {selected ? `Start solving at ${selected.rating}` : 'Start the calibration'}
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
  opening,
  puzzleId,
  onQueueEmpty,
}: {
  mode: Mode;
  theme: string | null;
  /** Lichess opening tag to draw puzzles from (by-opening practice). */
  opening: string | null;
  puzzleId: string | null;
  /** Review mode: called when "Next" finds nothing due any more. */
  onQueueEmpty?: () => void;
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
      const { before, after, calibrationDone } = progress.recordPuzzle({
        id: puzzle.id,
        puzzleRating: puzzle.rating,
        puzzleRd: puzzle.rd,
        solverMoves: event.solverMoves,
        outcome: event.outcome,
        hintUsed: event.hintUsed,
        hintLevel: event.hintLevel,
        themes: puzzle.themes,
        durationMs: event.durationMs,
        rated,
        review: mode === 'review',
        ...(opening ? { opening } : {}),
      });
      setLastDelta(rated ? Math.round(after) - Math.round(before) : null);
      if (calibrationDone) {
        const { puzzleRating, puzzleRd } = useProgress.getState();
        toast(
          `Calibration complete — your puzzle rating is ${formatRatingWithRd({ rating: puzzleRating, rd: puzzleRd, volatility: 0 })}. It keeps adjusting as you solve.`,
          { tone: 'success', duration: 8000 },
        );
      }
      if (event.outcome === 'solved') setSessionSolved((n) => n + 1);
      else setSessionFailed((n) => n + 1);
      if (mode === 'woodpecker') progress.recordWoodpeckerAttempt(event.outcome, event.durationMs);
      if (mode === 'daily') {
        progress.setDaily({ date: localDateKey(), id: puzzle.id, outcome: event.outcome });
      }
    },
    // progress actions are stable; recordPuzzle reads fresh state internally
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rated, mode, opening],
  );

  const trainer = usePuzzleTrainer(onOutcome);
  const { load } = trainer;
  const currentIdRef = useRef<string | null>(null);
  const queueEmptyRef = useRef(onQueueEmpty);
  queueEmptyRef.current = onQueueEmpty;

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
      } else if (mode === 'mine') {
        const state = useProgress.getState();
        const all = Object.values(state.ownPuzzles);
        const others = all.filter((p) => p.id !== currentIdRef.current);
        const own = others.length > 0 ? others : all;
        if (own.length === 0) throw new Error('No puzzles from your games yet.');
        // Least recently attempted first (never attempted before everything else).
        const lastAttempt = new Map<string, number>();
        for (const a of state.attempts) {
          if (!lastAttempt.has(a.id)) lastAttempt.set(a.id, a.at);
        }
        own.sort((a, b) => (lastAttempt.get(a.id) ?? 0) - (lastAttempt.get(b.id) ?? 0));
        puzzle = own[0] ?? null;
      } else if (mode === 'woodpecker') {
        const set = useProgress.getState().woodpecker;
        const id = set?.current ? set.puzzleIds[set.current.index] : undefined;
        if (!set?.current || !id) {
          queueEmptyRef.current?.();
          return;
        }
        puzzle = await findPuzzleById(id, set.rating);
        if (!puzzle) {
          // The bundled set changed since the Woodpecker set was made: skip the puzzle.
          useProgress.getState().recordWoodpeckerAttempt('solved', 0);
          throw new Error('That puzzle is no longer in the bundled set — skipped.');
        }
      } else if (mode === 'review') {
        const due = dueReviews(useProgress.getState().puzzleReviews, Date.now()).filter(
          (c) => c.id !== currentIdRef.current,
        );
        const card = due[0] ?? dueReviews(useProgress.getState().puzzleReviews, Date.now())[0];
        if (!card) {
          queueEmptyRef.current?.();
          return;
        }
        puzzle = await findPuzzleById(card.id, card.rating);
        if (!puzzle) {
          // The bundled set changed since it was queued; drop it and move on.
          useProgress.getState().dismissReview(card.id);
          throw new Error(
            'That puzzle is no longer in the bundled set — it was removed from the queue.',
          );
        }
      } else {
        const state = useProgress.getState();
        puzzle = await selectPuzzle({
          rating: state.puzzleRating,
          seen: state.seen,
          themes: theme ? [theme] : undefined,
          openings: opening ? [opening] : undefined,
          excludeId: currentIdRef.current,
        });
      }
      if (!puzzle) {
        throw new Error(
          opening
            ? 'No puzzles from that opening yet. Try another.'
            : 'No puzzles matched. Try another theme.',
        );
      }
      currentIdRef.current = puzzle.id;
      load(puzzle);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mode, theme, opening, puzzleId, load]);

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
            {trainer.phase === 'solved' ? (
              <LinkButton
                variant="ghost"
                to={`/play?fen=${encodeURIComponent(trainer.position.fen)}&color=${trainer.solverColor}`}
                title="Continue the game from here against the engine"
              >
                Play it out
              </LinkButton>
            ) : null}
            {trainer.phase === 'solved' && (mode === 'daily' || puzzleId) ? (
              <LinkButton variant="primary" to="/puzzles">
                Keep training
              </LinkButton>
            ) : null}
          </div>

          {lastDelta !== null ? (
            <p
              className={`small ${lastDelta >= 0 ? 'puzzle-delta--up' : 'puzzle-delta--down'}`}
              data-testid="rating-delta"
            >
              Rating {lastDelta >= 0 ? '+' : ''}
              {lastDelta} → <strong>{formatRating(progress.puzzleRating)}</strong>
            </p>
          ) : null}
          {rated && progress.calibration ? (
            <div className="calibration" data-testid="calibration">
              <div className="row row--between">
                <span className="small">
                  <strong>Finding your level</strong> · puzzle{' '}
                  {Math.min(progress.calibration.done + 1, progress.calibration.total)} of{' '}
                  {progress.calibration.total}
                </span>
                <span className="small muted">
                  {formatRatingWithRd({
                    rating: progress.puzzleRating,
                    rd: progress.puzzleRd,
                    volatility: 0,
                  })}
                </span>
              </div>
              <ProgressBar
                value={progress.calibration.done}
                max={progress.calibration.total}
                label="Calibration progress"
              />
            </div>
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
                  <span data-testid="rating-label">
                    Puzzle rating ± {Math.round(progress.puzzleRd)}
                    {isProvisional({ rd: progress.puzzleRd }) ? ' · provisional' : ''}
                  </span>
                }
              />
            ) : (
              <Stat
                value={
                  theme
                    ? themeName(theme)
                    : opening
                      ? openingTagName(opening)
                      : mode === 'woodpecker'
                        ? 'Woodpecker'
                        : mode === 'daily'
                          ? 'Daily'
                          : mode === 'review'
                            ? 'Review'
                            : mode === 'mine'
                              ? 'My puzzles'
                              : 'Practice'
                }
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
          ) : opening ? (
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Tactics that arose from the {openingTagName(opening)} in real games.{' '}
              <Link to="/puzzles/openings">All openings</Link>
            </p>
          ) : null}
        </Card>

        {puzzle ? (
          <Card>
            <PuzzleAbout
              puzzle={puzzle}
              fen={trainer.position.fen}
              mode={mode}
              onRemoved={() => void next()}
            />
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
            Rated mode adjusts your puzzle rating after each puzzle (Glicko-2, as on Lichess). A
            hint costs part of the credit, a very slow solve a little, and a puzzle you have seen
            before counts less. <Link to="/puzzles/daily">Today’s puzzle</Link> ·{' '}
            <Link to="/puzzles/themes">Practice by theme</Link> ·{' '}
            <Link to="/progress">What the rating means</Link>
          </p>
        ) : null}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* About this puzzle: source, themes, bookmark                          */
/* ------------------------------------------------------------------ */
function PuzzleAbout({
  puzzle,
  fen,
  mode,
  onRemoved,
}: {
  puzzle: Puzzle;
  fen: string;
  mode: Mode;
  onRemoved?: () => void;
}) {
  const bookmarked = useProgress((s) => puzzle.id in s.puzzleReviews);
  const bookmark = useProgress((s) => s.bookmarkPuzzle);
  const dismiss = useProgress((s) => s.dismissReview);
  const remove = useProgress((s) => s.removeOwnPuzzle);
  const own = isOwnPuzzleId(puzzle.id) ? (puzzle as OwnPuzzle) : null;
  const themes = puzzle.themes
    .split(' ')
    .filter((t) => t && !['ownGame', 'inaccuracy', 'mistake', 'blunder'].includes(t));

  return (
    <div className="stack-sm small">
      <div className="row row--between">
        <div className="row">
          {own ? (
            <Badge tone={own.source.judgement === 'blunder' ? 'danger' : 'warning'}>
              {own.source.judgement === 'inaccuracy'
                ? 'Inaccuracy'
                : own.source.judgement === 'mistake'
                  ? 'Mistake'
                  : 'Blunder'}{' '}
              in your game
            </Badge>
          ) : (
            <Badge tone="accent">Rating {puzzle.rating}</Badge>
          )}
          {themes.map((t) => (
            <Link key={t} to={`/puzzles/themes?theme=${encodeURIComponent(t)}`} className="badge">
              {themeName(t)}
            </Link>
          ))}
        </div>
        <Button
          size="sm"
          variant={bookmarked ? 'primary' : 'ghost'}
          aria-pressed={bookmarked}
          title={
            bookmarked
              ? 'In your review queue — click to remove'
              : 'Add to your review queue to practise again later'
          }
          onClick={() =>
            bookmarked
              ? dismiss(puzzle.id)
              : bookmark({ id: puzzle.id, rating: puzzle.rating, themes: puzzle.themes })
          }
        >
          <Icon name={bookmarked ? 'bookmark-filled' : 'bookmark'} size={16} />{' '}
          {bookmarked ? 'Bookmarked' : 'Bookmark'}
        </Button>
      </div>
      {own ? (
        <div className="muted">
          From <strong>{own.source.title}</strong>, move {Math.ceil(own.source.ply / 2)}
          {own.source.ply % 2 === 0 ? '…' : '.'} — you played <strong>{own.source.played}</strong>{' '}
          (−{Math.round(own.source.loss * 100)}%).{' '}
          {own.url ? (
            <>
              <a href={own.url} target="_blank" rel="noreferrer">
                Source game
              </a>{' '}
              ·{' '}
            </>
          ) : null}
          <Link to={`/analyze?fen=${encodeURIComponent(fen)}`}>Analyze position</Link>
          {mode === 'mine' ? (
            <>
              {' '}
              ·{' '}
              <button
                type="button"
                className="linklike"
                onClick={() => {
                  remove(puzzle.id);
                  onRemoved?.();
                }}
              >
                Remove from my puzzles
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <div className="muted">
          Puzzle <code>{puzzle.id}</code> from the Lichess database (CC0).{' '}
          <a href={puzzle.url} target="_blank" rel="noreferrer">
            Source game
          </a>{' '}
          · <Link to={`/analyze?fen=${encodeURIComponent(fen)}`}>Analyze position</Link>
        </div>
      )}
    </div>
  );
}

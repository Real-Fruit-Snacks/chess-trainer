import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dueReviews, nextReview } from '@/lib/puzzleReview';
import { useNow } from '@/lib/useNow';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Kbd,
  LinkButton,
  ProgressBar,
  Segmented,
  Spinner,
  Stat,
  Switch,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { useEngine } from '@/engine/useEngine';
import { formatDate, formatDuration, localDateKey } from '@/lib/dates';
import { NONE } from '@/lib/format';
import { safeSourceUrl } from '@/lib/gameImport';
import { formatRatingWithRd, isProvisional } from '@/lib/glicko';
import { CALIBRATION_PUZZLES, formatRating, STARTING_RATINGS } from '@/lib/rating';
import { shortcutKey } from '@/lib/shortcutKey';
import { siteConfig } from '@/site.config';
import { puzzleStreak, useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { isOwnPuzzleId, type OwnPuzzle, verifyOwnPuzzleMove } from './ownPuzzles';
import {
  dailyPuzzle,
  findPuzzleById,
  loadPuzzleIndex,
  matchesOpening,
  openingTagName,
  type Puzzle,
  type PuzzleIndex,
  PuzzleLoadError,
  selectPuzzle,
} from './puzzleService';
import { OpeningCatalog } from './OpeningCatalog';
import { WoodpeckerPanel } from './WoodpeckerPanel';
import { WOODPECKER_NEAR } from './woodpecker';
import { RushTrainer } from './RushTrainer';
import { PRACTICE_GROUPS, THEMES, themeDescription, themeName } from './themes';
import { type PuzzleOutcomeEvent, usePuzzleTrainer, type VerifyMove } from './usePuzzleTrainer';
import './puzzles.css';
import { Icon } from '@/components/ui';

type Mode = 'rated' | 'daily' | 'themes' | 'openings' | 'rush' | 'review' | 'mine' | 'woodpecker';

const MODES: readonly Mode[] = [
  'rated',
  'daily',
  'themes',
  'openings',
  'rush',
  'review',
  'mine',
  'woodpecker',
];

/** The tab title of each mode ("Daily puzzle · Chess Trainer"). */
const MODE_TITLES: Record<Mode, string> = {
  rated: 'Rated puzzles',
  daily: 'Daily puzzle',
  themes: 'Puzzles by theme',
  openings: 'Puzzles by opening',
  rush: 'Puzzle Rush',
  review: 'Due puzzles',
  mine: 'My puzzles',
  woodpecker: 'Woodpecker',
};

/** Due puzzles tried in turn when the first cannot be loaded (offline) or is gone. */
const REVIEW_TRIES = 5;

/** Reads `?opening=a,b` — every tag a repertoire card covers. */
function openingTags(param: string | null): string[] {
  return (param ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

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

  const knownMode = params.mode === undefined || (MODES as readonly string[]).includes(params.mode);
  const mode: Mode = knownMode && params.mode ? (params.mode as Mode) : 'rated';
  const themeFilter = searchParams.get('theme');
  const openingFilter = searchParams.get('opening');
  const puzzleId = searchParams.get('id');
  // `?id=…&rating=…` (Progress links): the rating says which band to look in first.
  const ratingParam = searchParams.get('rating');
  const ratingHint =
    ratingParam !== null && ratingParam.trim() !== '' && Number.isFinite(Number(ratingParam))
      ? Number(ratingParam)
      : undefined;
  // One array per filter: the trainer loads a puzzle whenever its inputs change identity, and
  // this page re-renders on every review-queue change (a miss schedules a card).
  const openings = useMemo(
    () => (mode === 'openings' ? openingTags(openingFilter) : []),
    [mode, openingFilter],
  );

  // A puzzle opened by a link (from Progress) is unrated practice, whatever the route says.
  useEffect(() => {
    document.title = `${puzzleId ? 'Puzzle practice' : MODE_TITLES[mode]} · ${siteConfig.name}`;
  }, [mode, puzzleId]);

  // Changing mode is a navigation, after which the app moves focus to the page; a keyboard
  // user who was choosing on the mode strip gets the strip back, on the mode just chosen.
  const stripRef = useRef<HTMLDivElement>(null);
  const refocusStripRef = useRef(false);
  useEffect(() => {
    if (!refocusStripRef.current) return;
    refocusStripRef.current = false;
    const frame = requestAnimationFrame(() => {
      stripRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  // `/puzzles/anything-else` is not a mode: back to rated puzzles, like other unknown routes.
  if (!knownMode) return <Navigate to="/puzzles" replace />;

  // Only rated solving needs a starting rating; every other mode is open from the start.
  const needsOnboarding = !onboarded && mode === 'rated' && !puzzleId;

  return (
    <div>
      <div className="page-header page-header--lean row row--between">
        <div>
          <h1>Puzzles</h1>
          <p>Engine-verified tactics from real games, picked to match your level.</p>
        </div>
        <div className="puzzle-modes" ref={stripRef}>
          <Segmented
            ariaLabel="Puzzle mode"
            // A linked puzzle belongs to none of the modes: none is shown as chosen.
            value={puzzleId ? null : mode}
            onChange={(m) => {
              refocusStripRef.current = !!stripRef.current?.contains(document.activeElement);
              void navigate(m === 'rated' ? '/puzzles' : `/puzzles/${m}`);
            }}
            options={[
              { value: 'rated', label: 'Rated' },
              { value: 'daily', label: 'Daily' },
              { value: 'themes', label: 'By theme' },
              { value: 'openings', label: 'By opening' },
              { value: 'rush', label: 'Rush' },
              {
                value: 'review',
                label: (
                  <>
                    Due
                    {dueCount ? (
                      <span className="segmented__count">
                        {dueCount}
                        <span className="sr-only"> due</span>
                      </span>
                    ) : null}
                  </>
                ),
              },
              { value: 'mine', label: 'Mine' },
              { value: 'woodpecker', label: 'Woodpecker' },
            ]}
          />
        </div>
      </div>

      {needsOnboarding ? (
        <Onboarding />
      ) : mode === 'rush' ? (
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
          openings={openings}
          puzzleId={puzzleId}
          ratingHint={ratingHint}
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
    <Card className="narrow">
      <p className="card__eyebrow">My puzzles</p>
      <h2>No puzzles from your games yet</h2>
      <p className="muted">
        Review one of your games on the analysis board and every mistake becomes a puzzle: the
        position where you went wrong, with the engine’s better move as the solution. They come back
        here — and among the due puzzles — until you find the right move without thinking.
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
/* Due puzzles: nothing due                                            */
/* ------------------------------------------------------------------ */
function ReviewEmpty() {
  const queue = useProgress((s) => s.puzzleReviews);
  const now = useNow();
  const upcoming = nextReview(queue);
  const total = Object.keys(queue).length;
  return (
    <Card className="narrow">
      <p className="card__eyebrow">Redo missed puzzles</p>
      <h2>Nothing due right now</h2>
      <p className="muted">
        Puzzles you miss — in rated, theme or rush mode — come back here after a day. Solve them
        cleanly and they return after 3, 7, 14 and 30 days before graduating.
      </p>
      <p className="small muted">
        {total === 0
          ? 'Your queue is empty. Go solve some puzzles!'
          : `${total} puzzle${total === 1 ? '' : 's'} scheduled · next due ${
              upcoming ? formatDate(upcoming.due, siteConfig.locale) : NONE
            }${upcoming && upcoming.due - now < 3_600_000 ? ' (soon)' : ''}.`}
      </p>
      <div className="row">
        <LinkButton variant="primary" to="/puzzles">
          Rated puzzles
        </LinkButton>
        <LinkButton to="/puzzles/themes">Practise by theme</LinkButton>
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
    <div className="narrow">
      <Card>
        <p className="card__eyebrow">Before you start</p>
        <h2>Where should your puzzle rating start?</h2>
        <p className="muted">
          The trainer keeps a puzzle rating that moves after every rated puzzle. Let it find your
          level with a short run of puzzles, or tell it roughly how much chess you have played. Not
          sure? The <Link to="/placement">placement quiz</Link> suggests a starting point and a
          course in two minutes.
        </p>
        <div className="choices" role="radiogroup" aria-label="Starting level">
          <label
            className={`choice${choice === 'calibrate' ? ' is-selected' : ''}`}
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
              className={`choice${option.id === choice ? ' is-selected' : ''}`}
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
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          Not ready to be rated? <Link to="/puzzles/daily">Today’s puzzle</Link>,{' '}
          <Link to="/puzzles/themes">puzzles by theme</Link> and{' '}
          <Link to="/puzzles/rush">Puzzle Rush</Link> are open right away.
        </p>
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
  openings,
  puzzleId,
  ratingHint,
  onQueueEmpty,
}: {
  mode: Mode;
  theme: string | null;
  /** Lichess opening tags to draw puzzles from (by-opening practice; a repertoire has several). */
  openings: string[];
  puzzleId: string | null;
  /** With `puzzleId`: the puzzle's rating, so only the band around it is searched. */
  ratingHint?: number;
  /** Review mode: called when "Next" finds nothing due any more. */
  onQueueEmpty?: () => void;
}) {
  const progress = useProgress();
  const autoNext = useSettings((s) => s.puzzleAutoNext);
  const shortcutsOn = useSettings((s) => s.keyboardShortcuts);
  const updateSettings = useSettings((s) => s.update);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [sessionSolved, setSessionSolved] = useState(0);
  const [sessionFailed, setSessionFailed] = useState(0);
  const rated = mode === 'rated' && !puzzleId;
  const opening = openings[0] ?? null;
  const trainerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  // "Next" hands focus to the board once the new puzzle is ready for a move.
  const focusBoardRef = useRef(false);

  // Own-game puzzles whose review did not show a clear best move: the engine judges a
  // different answer before it is called wrong. The engine loads only for those puzzles.
  const ownPuzzles = mode === 'mine' || (puzzleId !== null && isOwnPuzzleId(puzzleId));
  const { engine, start: startEngine, status: engineStatus } = useEngine({ autoStart: false });
  useEffect(() => {
    if (ownPuzzles) void startEngine();
  }, [ownPuzzles, startEngine]);
  const verifyMove = useCallback<VerifyMove>(
    (puzzle, fen, expected, played) => {
      if (!isOwnPuzzleId(puzzle.id) || (puzzle as OwnPuzzle).verified) return null;
      return verifyOwnPuzzleMove(engine(), fen, expected, played);
    },
    [engine],
  );

  const onOutcome = useCallback(
    (event: PuzzleOutcomeEvent, puzzle: Puzzle) => {
      const state = useProgress.getState();
      const { before, after, calibrationDone } = state.recordPuzzle({
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
        mode,
        ...(opening
          ? { opening: openings.find((tag) => matchesOpening(puzzle, [tag])) ?? opening }
          : {}),
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
      if (mode === 'woodpecker') state.recordWoodpeckerAttempt(event.outcome, event.durationMs);
      if (mode === 'daily') {
        // The first result of the day stands; replaying the puzzle is unrated practice.
        const today = localDateKey();
        const done = state.daily?.date === today && state.daily.outcome !== null;
        if (!done) state.setDaily({ date: today, id: puzzle.id, outcome: event.outcome });
      }
    },
    [rated, mode, opening, openings],
  );

  const trainer = usePuzzleTrainer(onOutcome, { verifyMove });
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
        puzzle = await findPuzzleById(puzzleId, ratingHint);
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
        // The set's rating, not the puzzle's: its puzzles lie around it, in more than one band.
        puzzle = await findPuzzleById(id, set.rating, { near: WOODPECKER_NEAR });
        if (!puzzle) {
          // The bundled set changed since the Woodpecker set was made: drop the puzzle
          // from the set without counting it as solved.
          useProgress.getState().skipWoodpeckerPuzzle(id);
          throw new Error('That puzzle is no longer in the bundled set — it was skipped.');
        }
      } else if (mode === 'review') {
        const due = dueReviews(useProgress.getState().puzzleReviews, Date.now());
        // The card just shown goes last, so "Next" moves on while others are due.
        const ordered = [
          ...due.filter((c) => c.id !== currentIdRef.current),
          ...due.filter((c) => c.id === currentIdRef.current),
        ];
        if (ordered.length === 0) {
          queueEmptyRef.current?.();
          return;
        }
        // Offline, a due puzzle whose file is not stored is passed over for one that is.
        let unreachable: PuzzleLoadError | null = null;
        for (const card of ordered.slice(0, REVIEW_TRIES)) {
          let found: Puzzle | null;
          try {
            found = await findPuzzleById(card.id, card.rating);
          } catch (err) {
            if (!(err instanceof PuzzleLoadError)) throw err;
            unreachable ??= err;
            continue;
          }
          if (found) {
            puzzle = found;
            break;
          }
          // The bundled set changed since it was queued; drop it and move on.
          useProgress.getState().dismissReview(card.id);
          toast('A due puzzle is no longer in the bundled set — it was removed from the list.', {
            tone: 'info',
          });
        }
        if (!puzzle) {
          if (unreachable) throw unreachable;
          if (dueReviews(useProgress.getState().puzzleReviews, Date.now()).length === 0) {
            queueEmptyRef.current?.();
            return;
          }
          throw new Error(
            'Those due puzzles were no longer in the bundled set. Retry for the next.',
          );
        }
      } else {
        const state = useProgress.getState();
        puzzle = await selectPuzzle({
          rating: state.puzzleRating,
          seen: state.seen,
          themes: theme ? [theme] : undefined,
          openings: openings.length ? openings : undefined,
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
  }, [mode, theme, opening, openings, puzzleId, ratingHint, load]);

  useEffect(() => {
    void next();
  }, [next]);

  /** "Next" / "Skip": loads a puzzle and puts the keyboard on the board for it. */
  const nextAndFocus = useCallback(() => {
    focusBoardRef.current = true;
    void next();
  }, [next]);

  useEffect(() => {
    if (trainer.phase !== 'solving' || !focusBoardRef.current) return;
    focusBoardRef.current = false;
    boardRef.current?.querySelector<HTMLElement>('[role="application"]')?.focus();
  }, [trainer.phase]);

  // Auto-advance after a solve — but never after "Show solution": the line would vanish
  // before it could be studied. Focus that was on the trainer (the board, or the Next button
  // a solve focuses) goes to the board of the new puzzle rather than being lost with the button.
  useEffect(() => {
    if (!autoNext || trainer.phase !== 'solved' || mode === 'daily' || puzzleId) return;
    if (trainer.solutionShown) return;
    const id = window.setTimeout(() => {
      focusBoardRef.current = !!trainerRef.current?.contains(document.activeElement);
      void next();
    }, 1200);
    return () => window.clearTimeout(id);
  }, [autoNext, trainer.phase, trainer.solutionShown, next, mode, puzzleId]);

  // Keyboard shortcuts: letters in either case, never with modifiers, never from the board,
  // and not at all when single-key shortcuts are switched off in Settings.
  useEffect(() => {
    if (!shortcutsOn) return;
    const onKey = (e: KeyboardEvent) => {
      const key = shortcutKey(e);
      if (!key) return;
      if (key === 'n' && (trainer.phase === 'solved' || trainer.phase === 'failed')) {
        if (!puzzleId && mode !== 'daily') nextAndFocus();
      }
      if (key === 'h') trainer.hint();
      if (key === 's') trainer.showSolution();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trainer, nextAndFocus, puzzleId, mode, shortcutsOn]);

  const dailyDone =
    mode === 'daily' && progress.daily?.date === localDateKey() && progress.daily.outcome !== null;

  const statusText = useMemo(() => {
    switch (trainer.phase) {
      case 'intro':
        return 'Watch the opponent’s move…';
      case 'solving':
        return trainer.position.check ? 'Your move — you are in check!' : 'Your move.';
      case 'checking':
        return 'Not the stored move — asking the engine whether it is as good…';
      case 'replying':
        return 'Good move! Opponent replies…';
      case 'solved':
        return trainer.solutionShown
          ? 'That is the solution.'
          : trainer.practiceAfterFail
            ? 'Solved (after a miss).'
            : 'Puzzle solved!';
      case 'failed':
        return 'Not the best move.';
      default:
        return '';
    }
  }, [trainer.phase, trainer.position.check, trainer.practiceAfterFail, trainer.solutionShown]);

  const puzzle = trainer.puzzle;
  const solverIsMoving = trainer.phase === 'solving';
  const streak = puzzleStreak(progress);

  return (
    <div className="trainer" ref={trainerRef}>
      <div className="trainer__board" style={{ position: 'relative' }} ref={boardRef}>
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
          // Promotions always ask: eighteen bundled puzzles need an underpromotion.
          onMove={(from, to) => trainer.playUserMove(from, to)}
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
        {ownPuzzles && engineStatus === 'error' ? (
          <Alert tone="warning">
            The engine could not start, so a move other than the stored solution counts as a miss.
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
            {trainer.phase === 'solving' ||
            trainer.phase === 'checking' ||
            trainer.phase === 'replying' ? (
              <>
                <Button onClick={trainer.hint} disabled={trainer.phase !== 'solving'}>
                  {trainer.hintLevel === 0
                    ? 'Hint'
                    : trainer.hintLevel === 1
                      ? 'Show move'
                      : 'Hint shown'}{' '}
                  {shortcutsOn ? <Kbd>H</Kbd> : null}
                </Button>
                <Button
                  variant="ghost"
                  onClick={trainer.showSolution}
                  disabled={trainer.phase === 'checking'}
                >
                  Solution {shortcutsOn ? <Kbd>S</Kbd> : null}
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
                  <Button variant="ghost" onClick={nextAndFocus}>
                    Skip {shortcutsOn ? <Kbd>N</Kbd> : null}
                  </Button>
                ) : null}
              </>
            ) : null}
            {trainer.phase === 'solved' && !puzzleId && mode !== 'daily' ? (
              <Button variant="primary" onClick={nextAndFocus} autoFocus>
                Next puzzle {shortcutsOn ? <Kbd>N</Kbd> : null}
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
              You already did today’s puzzle; playing it again is unrated and keeps today’s result.
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
                      ? openings.length > 1
                        ? `${openingTagName(opening)} +${openings.length - 1}`
                        : openingTagName(opening)
                      : mode === 'woodpecker'
                        ? 'Woodpecker'
                        : mode === 'daily'
                          ? 'Daily'
                          : mode === 'review'
                            ? 'Due'
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
            <Stat value={streak.current} label={`Day streak (best ${streak.best})`} />
          </div>
          {theme ? (
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
              {themeDescription(theme)} <Link to="/puzzles/themes">All themes</Link>
            </p>
          ) : opening ? (
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Tactics that arose from{' '}
              {openings.length > 1
                ? `these openings in real games: ${openings.map(openingTagName).join(', ')}`
                : `the ${openingTagName(opening)} in real games`}
              . <Link to="/puzzles/openings">All openings</Link>
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
            solve never costs points: a hint or a very slow solve only earns less, and a puzzle you
            have seen before counts less. <Link to="/puzzles/daily">Today’s puzzle</Link> ·{' '}
            <Link to="/puzzles/themes">Practise by theme</Link> ·{' '}
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
  const [confirmRemove, setConfirmRemove] = useState(false);
  const own = isOwnPuzzleId(puzzle.id) ? (puzzle as OwnPuzzle) : null;
  // Only a real https link to the game's site becomes a link (imported data is not trusted).
  const sourceUrl = safeSourceUrl(puzzle.url);
  const themes = puzzle.themes
    .split(' ')
    .filter((t) => t && !['ownGame', 'inaccuracy', 'mistake', 'blunder'].includes(t));

  return (
    <div className="stack-sm small">
      <div className="row row--between">
        <div className="row puzzle-themes">
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
            <Link
              key={t}
              to={`/puzzles/themes?theme=${encodeURIComponent(t)}`}
              className="badge puzzle-themes__link"
              title={`Practise ${themeName(t)} puzzles`}
            >
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
              ? 'Among your due puzzles — click to remove'
              : 'Add to your due puzzles to practise again later'
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
          {sourceUrl ? (
            <>
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                Source game
              </a>{' '}
              ·{' '}
            </>
          ) : null}
          <Link to={`/analyze?fen=${encodeURIComponent(fen)}`}>Analyze position</Link>
          {mode === 'mine' ? (
            <div className="row" style={{ marginTop: 8 }}>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                Remove from my puzzles
              </Button>
              <ConfirmDialog
                open={confirmRemove}
                title="Remove this puzzle?"
                confirmLabel="Remove"
                danger
                onConfirm={() => {
                  remove(puzzle.id);
                  onRemoved?.();
                }}
                onClose={() => setConfirmRemove(false)}
              >
                It leaves your puzzles and your due list. Reviewing the game again brings it back.
              </ConfirmDialog>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="muted">
          Puzzle <code>{puzzle.id}</code> from the Lichess database (CC0).{' '}
          {sourceUrl ? (
            <>
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                Source game
              </a>{' '}
              ·{' '}
            </>
          ) : null}
          <Link to={`/analyze?fen=${encodeURIComponent(fen)}`}>Analyze position</Link>
        </div>
      )}
    </div>
  );
}

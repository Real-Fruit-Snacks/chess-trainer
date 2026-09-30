import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { OwnPuzzle } from '@/features/puzzles/ownPuzzles';
import { daysBetween, localDateKey } from '@/lib/dates';
import {
  PUZZLE_REVIEW_STEPS_DAYS,
  type PuzzleReviewCard,
  scheduleFailed,
  scheduleSolved,
} from '@/lib/puzzleReview';
import { DAY_MS } from '@/lib/srs';
import { blend, DEFAULT_VOLATILITY, INITIAL_RD, inflate, rate, type Rating } from '@/lib/glicko';
import { attemptScore, type HintLevel, REPEAT_WEIGHT } from '@/lib/puzzleScore';
import {
  CALIBRATION_PUZZLES,
  CALIBRATION_START_RATING,
  DEFAULT_PUZZLE_RD,
  DEFAULT_START_RATING,
  SELF_ASSESSED_RD,
} from '@/lib/rating';
import { useRepertoire } from './repertoire';

export type PuzzleOutcome = 'solved' | 'failed';

export interface PuzzleAttempt {
  id: string;
  puzzleRating: number;
  outcome: PuzzleOutcome;
  hintUsed: boolean;
  /** Most revealing hint used: 0 none, 1 the piece, 2 the move. */
  hintLevel?: HintLevel;
  /** Glicko score the attempt was worth (0–1), after hints, speed and repeats. */
  score?: number;
  ratingBefore: number;
  ratingAfter: number;
  themes: string;
  at: number;
  /** Solve time in milliseconds. */
  durationMs: number;
}

/** A short run of rated puzzles that finds a new learner's level. */
export interface Calibration {
  total: number;
  done: number;
  startedAt: number;
}

export interface RatingPoint {
  at: number;
  rating: number;
}

export interface LessonProgress {
  stepsDone: number[];
  completedAt: number | null;
  lastVisitedAt: number;
}

export interface GameRecord {
  at: number;
  level: number;
  color: 'white' | 'black';
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: string;
  plies: number;
  pgn: string;
}

export interface Streak {
  current: number;
  best: number;
  /** YYYY-MM-DD of the last day a puzzle was solved. */
  lastDate: string | null;
}

export interface DailyPuzzleState {
  date: string;
  id: string;
  outcome: PuzzleOutcome | null;
}

export interface ThemeStat {
  solved: number;
  failed: number;
}

export interface RushRun {
  at: number;
  /** 'timed' = 3 minutes, 'survival' = until three strikes. */
  mode: 'timed' | 'survival';
  score: number;
  /** Highest puzzle rating solved in the run. */
  peakRating: number;
  durationMs: number;
}

export interface DrillResult {
  /** Best score (drill-specific: solved count, correct squares, moves to mate…). */
  best: number;
  attempts: number;
  lastAt: number;
  /** Extra per-drill detail, e.g. fastest mate in N moves. */
  detail?: string;
}

export interface GuessGameResult {
  score: number;
  maxScore: number;
  completedAt: number;
}

export interface StudyResult {
  solvedAt: number | null;
  attempts: number;
  /** Solved without hints or the solution. */
  clean: boolean;
}

export interface ProgressState {
  onboarded: boolean;
  /** Glicko-2 puzzle rating (see lib/glicko.ts). */
  puzzleRating: number;
  /** Rating deviation: how uncertain the rating is (≥ 110 is provisional). */
  puzzleRd: number;
  puzzleVolatility: number;
  /** When the last rated attempt was made; the deviation grows with the time since. */
  lastRatedAt: number | null;
  /** Level-finding run in progress, or null. */
  calibration: Calibration | null;
  ratedAttempts: number;
  ratingHistory: RatingPoint[];
  attempts: PuzzleAttempt[];
  seen: Record<string, PuzzleOutcome>;
  streak: Streak;
  daily: DailyPuzzleState | null;
  lessons: Record<string, LessonProgress>;
  games: GameRecord[];
  /** Solved/failed counts per puzzle theme, across all modes. */
  themeStats: Record<string, ThemeStat>;
  rushRuns: RushRun[];
  drills: Record<string, DrillResult>;
  guessGames: Record<string, GuessGameResult>;
  /** Missed puzzles scheduled to come back (the review queue). */
  puzzleReviews: Record<string, PuzzleReviewCard>;
  /** Calendar days (YYYY-MM-DD) with any training activity; drives the training streak. */
  trainingDays: string[];
  /** Puzzles made from mistakes in the learner's own games, by id. */
  ownPuzzles: Record<string, OwnPuzzle>;
  /** Lesson task positions scheduled for recall (same scheduler as the puzzle queue). */
  lessonRecall: Record<string, PuzzleReviewCard>;
  /** Endgame studies solved, by study id. */
  studies: Record<string, StudyResult>;

  /**
   * Sets the starting rating. `'self'` trusts the learner's own assessment
   * (moderately uncertain); `'calibrate'` starts a short run of rated puzzles
   * that finds the level from a very uncertain start.
   */
  completeOnboarding: (startingRating: number, mode?: 'self' | 'calibrate') => void;
  recordPuzzle: (
    attempt: Omit<PuzzleAttempt, 'ratingBefore' | 'ratingAfter' | 'at' | 'score'> & {
      rated: boolean;
      /** The attempt came from the review queue: solves advance the schedule. */
      review?: boolean;
      /** The puzzle's own rating deviation (Lichess data); defaults to a typical value. */
      puzzleRd?: number;
      /** Number of moves the solver had to find (for the expected solving time). */
      solverMoves?: number;
    },
  ) => { before: number; after: number; calibrationDone: boolean };
  /** Removes a puzzle from the review queue. */
  dismissReview: (id: string) => void;
  /** Puts a puzzle in the review queue right away (a bookmark). */
  bookmarkPuzzle: (meta: { id: string; rating: number; themes: string }) => void;
  /** Stores own-game puzzles and queues them for review; returns how many were new. */
  addOwnPuzzles: (puzzles: OwnPuzzle[]) => number;
  removeOwnPuzzle: (id: string) => void;
  /** Adds lesson recall cards (existing ones are kept); the first recall comes after a few days. */
  scheduleLessonRecall: (cards: { id: string; lessonId: string }[], now?: number) => void;
  dismissLessonRecall: (id: string) => void;
  /** Records a recall attempt and reschedules the card. */
  recordLessonRecall: (id: string, outcome: PuzzleOutcome, hintUsed?: boolean) => void;
  recordStudy: (studyId: string, outcome: PuzzleOutcome, clean: boolean) => void;
  /** Marks today as a training day (called by every kind of activity). */
  touchTraining: () => void;
  setDaily: (daily: DailyPuzzleState) => void;
  /**
   * Marks a step done. `taskSteps` lists the indexes of the lesson's task
   * steps; when the lesson completes they are scheduled for recall.
   */
  markLessonStep: (
    lessonId: string,
    stepIndex: number,
    totalSteps: number,
    taskSteps?: number[],
  ) => void;
  visitLesson: (lessonId: string) => void;
  resetLesson: (lessonId: string) => void;
  recordGame: (game: Omit<GameRecord, 'at'>) => void;
  recordRush: (run: Omit<RushRun, 'at'>) => void;
  /** Counts an unrated attempt (rush, drills) towards `seen` and theme statistics only. */
  recordUnratedOutcome: (
    id: string,
    themes: string,
    outcome: PuzzleOutcome,
    rating?: number,
  ) => void;
  recordDrill: (drillId: string, score: number, detail?: string) => void;
  recordGuessGame: (gameId: string, score: number, maxScore: number) => void;
  importState: (state: unknown) => boolean;
  exportState: () => string;
  resetAll: () => void;
}

const MAX_HISTORY = 500;
const MAX_ATTEMPTS = 300;
const MAX_GAMES = 50;
const MAX_RUSH_RUNS = 30;
const MAX_TRAINING_DAYS = 400;

function withToday(days: string[], today = localDateKey()): string[] {
  if (days.includes(today)) return days;
  return [...days, today].sort().slice(-MAX_TRAINING_DAYS);
}

const initialState = {
  onboarded: false,
  puzzleRating: DEFAULT_START_RATING,
  puzzleRd: INITIAL_RD,
  puzzleVolatility: DEFAULT_VOLATILITY,
  lastRatedAt: null as number | null,
  calibration: null as Calibration | null,
  ratedAttempts: 0,
  ratingHistory: [] as RatingPoint[],
  attempts: [] as PuzzleAttempt[],
  seen: {} as Record<string, PuzzleOutcome>,
  streak: { current: 0, best: 0, lastDate: null } as Streak,
  daily: null as DailyPuzzleState | null,
  lessons: {} as Record<string, LessonProgress>,
  games: [] as GameRecord[],
  themeStats: {} as Record<string, ThemeStat>,
  rushRuns: [] as RushRun[],
  drills: {} as Record<string, DrillResult>,
  guessGames: {} as Record<string, GuessGameResult>,
  puzzleReviews: {} as Record<string, PuzzleReviewCard>,
  trainingDays: [] as string[],
  ownPuzzles: {} as Record<string, OwnPuzzle>,
  lessonRecall: {} as Record<string, PuzzleReviewCard>,
  studies: {} as Record<string, StudyResult>,
};

export type PersistedProgress = typeof initialState;

const PERSISTED_KEYS = Object.keys(initialState) as (keyof PersistedProgress)[];

/** The persisted slice of the store (everything that is not an action). */
function persisted(state: ProgressState): PersistedProgress {
  const out = {} as Record<string, unknown>;
  for (const key of PERSISTED_KEYS) out[key] = state[key];
  return out as PersistedProgress;
}

const MAX_OWN_PUZZLES = 300;

/** Recall/lesson cards get a nominal rating so the shared scheduler shape fits. */
export const RECALL_CARD_RATING = 0;
/** Lesson positions come back for the first time after three days (step 1 of the schedule). */
export const RECALL_FIRST_STEP = 1;

export const PROGRESS_STORAGE_KEY = 'chess-trainer:progress';

function nextStreak(streak: Streak, today: string): Streak {
  if (streak.lastDate === today) return streak;
  const continues = streak.lastDate !== null && daysBetween(streak.lastDate, today) === 1;
  const current = continues ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDate: today };
}

/** Adds one attempt to every theme the puzzle carries. */
export function addThemeStats(
  stats: Record<string, ThemeStat>,
  themes: string,
  outcome: PuzzleOutcome,
): Record<string, ThemeStat> {
  const next = { ...stats };
  for (const theme of themes.split(' ').filter(Boolean)) {
    const current = next[theme] ?? { solved: 0, failed: 0 };
    next[theme] =
      outcome === 'solved'
        ? { ...current, solved: current.solved + 1 }
        : { ...current, failed: current.failed + 1 };
  }
  return next;
}

function isPersistedProgress(value: unknown): value is Partial<PersistedProgress> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.puzzleRating === 'number' || typeof v.onboarded === 'boolean';
}

/**
 * Fills in the Glicko-2 fields for saves and exports made before they existed:
 * the deviation is guessed from how many rated puzzles the old Elo rating had
 * seen, and the last rated time from the rating history.
 */
export function withRatingDefaults(stored: Partial<PersistedProgress>): PersistedProgress {
  const state = { ...initialState, ...stored };
  if (typeof stored.puzzleRd !== 'number') {
    const n = stored.ratedAttempts ?? 0;
    state.puzzleRd = !stored.onboarded
      ? INITIAL_RD
      : n >= 30
        ? 80
        : n >= 10
          ? 130
          : n > 0
            ? 200
            : SELF_ASSESSED_RD;
  }
  if (typeof stored.puzzleVolatility !== 'number') state.puzzleVolatility = DEFAULT_VOLATILITY;
  if (stored.lastRatedAt === undefined) {
    const history = stored.ratingHistory ?? [];
    state.lastRatedAt = history.length > 1 ? (history[history.length - 1]?.at ?? null) : null;
  }
  if (stored.calibration === undefined) state.calibration = null;
  return state;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initialState,

      completeOnboarding: (startingRating, mode = 'self') => {
        const now = Date.now();
        const calibrate = mode === 'calibrate';
        const rating = calibrate ? CALIBRATION_START_RATING : startingRating;
        set({
          onboarded: true,
          puzzleRating: rating,
          puzzleRd: calibrate ? INITIAL_RD : SELF_ASSESSED_RD,
          puzzleVolatility: DEFAULT_VOLATILITY,
          lastRatedAt: null,
          calibration: calibrate ? { total: CALIBRATION_PUZZLES, done: 0, startedAt: now } : null,
          ratingHistory: [{ at: now, rating }],
        });
      },

      recordPuzzle: ({ rated, review = false, puzzleRd, solverMoves, ...attempt }) => {
        const state = get();
        const now = Date.now();
        const before = state.puzzleRating;
        const hintLevel: HintLevel = attempt.hintLevel ?? (attempt.hintUsed ? 1 : 0);
        const score = attemptScore({
          outcome: attempt.outcome,
          hintLevel,
          durationMs: attempt.durationMs,
          puzzleRating: attempt.puzzleRating,
          solverMoves: solverMoves ?? 1,
        });
        let next: Rating = {
          rating: before,
          rd: state.puzzleRd,
          volatility: state.puzzleVolatility,
        };
        let calibration = state.calibration;
        let calibrationDone = false;
        if (rated) {
          const idleDays = state.lastRatedAt ? (now - state.lastRatedAt) / DAY_MS : 0;
          const current = inflate(next, idleDays);
          const updated = rate(current, [
            { rating: attempt.puzzleRating, rd: puzzleRd ?? DEFAULT_PUZZLE_RD, score },
          ]);
          // A puzzle seen before says less about strength.
          next = attempt.id in state.seen ? blend(current, updated, REPEAT_WEIGHT) : updated;
          if (calibration && calibration.done < calibration.total) {
            calibration = { ...calibration, done: calibration.done + 1 };
            if (calibration.done >= calibration.total) {
              calibrationDone = true;
              calibration = null;
            }
          }
        }
        const after = next.rating;
        const today = localDateKey(new Date(now));
        const reviews = { ...state.puzzleReviews };
        const meta = { id: attempt.id, rating: attempt.puzzleRating, themes: attempt.themes };
        if (attempt.outcome === 'failed') {
          reviews[attempt.id] = scheduleFailed(reviews[attempt.id], meta, now);
        } else if (review) {
          const card = reviews[attempt.id];
          const next = card ? scheduleSolved(card, now, { hintUsed: attempt.hintUsed }) : null;
          if (next) reviews[attempt.id] = next;
          else delete reviews[attempt.id];
        }

        set({
          puzzleRating: after,
          puzzleRd: next.rd,
          puzzleVolatility: next.volatility,
          lastRatedAt: rated ? now : state.lastRatedAt,
          calibration,
          ratedAttempts: rated ? state.ratedAttempts + 1 : state.ratedAttempts,
          ratingHistory: rated
            ? [...state.ratingHistory, { at: now, rating: Math.round(after) }].slice(-MAX_HISTORY)
            : state.ratingHistory,
          attempts: [
            {
              ...attempt,
              hintUsed: hintLevel > 0,
              hintLevel,
              score,
              ratingBefore: before,
              ratingAfter: after,
              at: now,
            },
            ...state.attempts,
          ].slice(0, MAX_ATTEMPTS),
          seen: { ...state.seen, [attempt.id]: attempt.outcome },
          streak: attempt.outcome === 'solved' ? nextStreak(state.streak, today) : state.streak,
          themeStats: addThemeStats(state.themeStats, attempt.themes, attempt.outcome),
          puzzleReviews: reviews,
          trainingDays: withToday(state.trainingDays, today),
        });
        return { before, after, calibrationDone };
      },

      touchTraining: () => {
        const days = withToday(get().trainingDays);
        if (days !== get().trainingDays) set({ trainingDays: days });
      },

      dismissReview: (id) => {
        const reviews = { ...get().puzzleReviews };
        delete reviews[id];
        set({ puzzleReviews: reviews });
      },

      bookmarkPuzzle: (meta) => {
        const reviews = get().puzzleReviews;
        if (reviews[meta.id]) return;
        const now = Date.now();
        set({
          puzzleReviews: {
            ...reviews,
            [meta.id]: { ...meta, step: 0, due: now, lapses: 0, addedAt: now },
          },
        });
      },

      addOwnPuzzles: (puzzles) => {
        const state = get();
        const own = { ...state.ownPuzzles };
        const reviews = { ...state.puzzleReviews };
        const now = Date.now();
        let added = 0;
        for (const puzzle of puzzles) {
          if (own[puzzle.id]) continue;
          own[puzzle.id] = puzzle;
          added++;
          reviews[puzzle.id] ??= {
            id: puzzle.id,
            rating: puzzle.rating,
            themes: puzzle.themes,
            step: 0,
            due: now,
            lapses: 0,
            addedAt: now,
          };
        }
        if (added === 0) return 0;
        // Oldest puzzles fall off the end once the cap is reached.
        const kept = Object.values(own)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, MAX_OWN_PUZZLES);
        const keptIds = new Set(kept.map((p) => p.id));
        for (const id of Object.keys(reviews)) {
          if (id.startsWith('own-') && !keptIds.has(id)) delete reviews[id];
        }
        set({
          ownPuzzles: Object.fromEntries(kept.map((p) => [p.id, p])),
          puzzleReviews: reviews,
        });
        return added;
      },

      removeOwnPuzzle: (id) => {
        const own = { ...get().ownPuzzles };
        const reviews = { ...get().puzzleReviews };
        delete own[id];
        delete reviews[id];
        set({ ownPuzzles: own, puzzleReviews: reviews });
      },

      scheduleLessonRecall: (cards, now = Date.now()) => {
        const recall = { ...get().lessonRecall };
        for (const card of cards) {
          recall[card.id] ??= {
            id: card.id,
            rating: RECALL_CARD_RATING,
            themes: card.lessonId,
            step: RECALL_FIRST_STEP,
            due: now + (PUZZLE_REVIEW_STEPS_DAYS[RECALL_FIRST_STEP] ?? 3) * DAY_MS,
            lapses: 0,
            addedAt: now,
          };
        }
        set({ lessonRecall: recall });
      },

      dismissLessonRecall: (id) => {
        const recall = { ...get().lessonRecall };
        delete recall[id];
        set({ lessonRecall: recall });
      },

      recordLessonRecall: (id, outcome, hintUsed = false) => {
        const recall = { ...get().lessonRecall };
        const card = recall[id];
        if (!card) return;
        const now = Date.now();
        if (outcome === 'failed') {
          recall[id] = scheduleFailed(card, card, now);
        } else {
          const next = scheduleSolved(card, now, { hintUsed });
          if (next) recall[id] = next;
          else delete recall[id];
        }
        set({ lessonRecall: recall, trainingDays: withToday(get().trainingDays) });
      },

      recordStudy: (studyId, outcome, clean) => {
        const current = get().studies[studyId] ?? { solvedAt: null, attempts: 0, clean: false };
        set({
          studies: {
            ...get().studies,
            [studyId]: {
              solvedAt: outcome === 'solved' ? (current.solvedAt ?? Date.now()) : current.solvedAt,
              attempts: current.attempts + 1,
              clean: current.clean || (outcome === 'solved' && clean),
            },
          },
          trainingDays: withToday(get().trainingDays),
        });
      },

      setDaily: (daily) => set({ daily }),

      markLessonStep: (lessonId, stepIndex, totalSteps, taskSteps = []) => {
        const current = get().lessons[lessonId] ?? {
          stepsDone: [],
          completedAt: null,
          lastVisitedAt: Date.now(),
        };
        const stepsDone = current.stepsDone.includes(stepIndex)
          ? current.stepsDone
          : [...current.stepsDone, stepIndex].sort((a, b) => a - b);
        const justCompleted = current.completedAt === null && stepsDone.length >= totalSteps;
        const completedAt = current.completedAt ?? (justCompleted ? Date.now() : null);
        set({
          lessons: {
            ...get().lessons,
            [lessonId]: { stepsDone, completedAt, lastVisitedAt: Date.now() },
          },
          trainingDays: withToday(get().trainingDays),
        });
        if (justCompleted && taskSteps.length > 0) {
          get().scheduleLessonRecall(
            taskSteps.map((step) => ({ id: `${lessonId}:${step}`, lessonId })),
          );
        }
      },

      visitLesson: (lessonId) => {
        const current = get().lessons[lessonId] ?? {
          stepsDone: [],
          completedAt: null,
          lastVisitedAt: 0,
        };
        set({
          lessons: { ...get().lessons, [lessonId]: { ...current, lastVisitedAt: Date.now() } },
        });
      },

      resetLesson: (lessonId) => {
        const lessons = { ...get().lessons };
        delete lessons[lessonId];
        set({ lessons });
      },

      recordGame: (game) =>
        set({
          games: [{ ...game, at: Date.now() }, ...get().games].slice(0, MAX_GAMES),
          trainingDays: withToday(get().trainingDays),
        }),

      recordUnratedOutcome: (id, themes, outcome, rating = 0) =>
        set({
          seen: { ...get().seen, [id]: outcome },
          themeStats: addThemeStats(get().themeStats, themes, outcome),
          puzzleReviews:
            outcome === 'failed'
              ? {
                  ...get().puzzleReviews,
                  [id]: scheduleFailed(get().puzzleReviews[id], { id, rating, themes }, Date.now()),
                }
              : get().puzzleReviews,
        }),

      recordRush: (run) =>
        set({
          rushRuns: [{ ...run, at: Date.now() }, ...get().rushRuns].slice(0, MAX_RUSH_RUNS),
          trainingDays: withToday(get().trainingDays),
        }),

      recordDrill: (drillId, score, detail) => {
        const current = get().drills[drillId];
        const best = current ? Math.max(current.best, score) : score;
        set({
          drills: {
            ...get().drills,
            [drillId]: {
              best,
              attempts: (current?.attempts ?? 0) + 1,
              lastAt: Date.now(),
              detail: best === score ? detail : current?.detail,
            },
          },
          trainingDays: withToday(get().trainingDays),
        });
      },

      recordGuessGame: (gameId, score, maxScore) => {
        const current = get().guessGames[gameId];
        const trainingDays = withToday(get().trainingDays);
        if (current && current.score >= score) {
          set({
            guessGames: { ...get().guessGames, [gameId]: { ...current, completedAt: Date.now() } },
            trainingDays,
          });
          return;
        }
        set({
          guessGames: {
            ...get().guessGames,
            [gameId]: { score, maxScore, completedAt: Date.now() },
          },
          trainingDays,
        });
      },

      exportState: () => {
        return JSON.stringify(
          {
            app: 'chess-trainer',
            version: 4,
            exportedAt: new Date().toISOString(),
            progress: persisted(get()),
            repertoire: (({ cards, custom, sessions }) => ({ cards, custom, sessions }))(
              useRepertoire.getState(),
            ),
          },
          null,
          2,
        );
      },

      importState: (raw) => {
        const payload: unknown =
          typeof raw === 'object' && raw !== null && 'progress' in raw ? raw.progress : raw;
        if (!isPersistedProgress(payload)) return false;
        if (typeof raw === 'object' && raw !== null && 'repertoire' in raw) {
          useRepertoire.getState().importState(raw.repertoire);
        }
        const next = withRatingDefaults(payload);
        if (Object.keys(next.themeStats).length === 0) {
          next.themeStats = next.attempts.reduce(
            (acc, a) => addThemeStats(acc, a.themes, a.outcome),
            {} as Record<string, ThemeStat>,
          );
        }
        set(next);
        return true;
      },

      resetAll: () => {
        useRepertoire.getState().resetAll();
        set({ ...initialState });
      },
    }),
    {
      name: PROGRESS_STORAGE_KEY,
      version: 5,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => persisted(state),
      migrate: (stored, version) => {
        const state = withRatingDefaults(stored as Partial<PersistedProgress>);
        if (version < 2 && Object.keys(state.themeStats).length === 0) {
          // Rebuild theme statistics from the attempts we still have.
          state.themeStats = state.attempts.reduce(
            (acc, a) => addThemeStats(acc, a.themes, a.outcome),
            {} as Record<string, ThemeStat>,
          );
        }
        return state;
      },
    },
  ),
);

/** Derived statistics used by the Home and Progress pages. */
export function summarizeProgress(state: ProgressState) {
  const solved = state.attempts.filter((a) => a.outcome === 'solved').length;
  const failed = state.attempts.length - solved;
  const lessonsCompleted = Object.values(state.lessons).filter(
    (l) => l.completedAt !== null,
  ).length;
  const wins = state.games.filter((g) =>
    g.color === 'white' ? g.result === '1-0' : g.result === '0-1',
  ).length;
  const draws = state.games.filter((g) => g.result === '1/2-1/2').length;
  const losses = state.games.length - wins - draws;
  const solvedTimes = state.attempts.filter((a) => a.outcome === 'solved').map((a) => a.durationMs);
  const avgSolveMs = solvedTimes.length
    ? solvedTimes.reduce((a, b) => a + b, 0) / solvedTimes.length
    : 0;
  return { solved, failed, lessonsCompleted, wins, draws, losses, avgSolveMs };
}

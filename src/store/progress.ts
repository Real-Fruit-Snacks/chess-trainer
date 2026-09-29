import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { daysBetween, localDateKey } from '@/lib/dates';
import { DEFAULT_START_RATING, updateRating } from '@/lib/rating';

export type PuzzleOutcome = 'solved' | 'failed';

export interface PuzzleAttempt {
  id: string;
  puzzleRating: number;
  outcome: PuzzleOutcome;
  hintUsed: boolean;
  ratingBefore: number;
  ratingAfter: number;
  themes: string;
  at: number;
  /** Solve time in milliseconds. */
  durationMs: number;
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

export interface ProgressState {
  onboarded: boolean;
  puzzleRating: number;
  ratedAttempts: number;
  ratingHistory: RatingPoint[];
  attempts: PuzzleAttempt[];
  seen: Record<string, PuzzleOutcome>;
  streak: Streak;
  daily: DailyPuzzleState | null;
  lessons: Record<string, LessonProgress>;
  games: GameRecord[];

  completeOnboarding: (startingRating: number) => void;
  recordPuzzle: (
    attempt: Omit<PuzzleAttempt, 'ratingBefore' | 'ratingAfter' | 'at'> & { rated: boolean },
  ) => { before: number; after: number };
  setDaily: (daily: DailyPuzzleState) => void;
  markLessonStep: (lessonId: string, stepIndex: number, totalSteps: number) => void;
  visitLesson: (lessonId: string) => void;
  resetLesson: (lessonId: string) => void;
  recordGame: (game: Omit<GameRecord, 'at'>) => void;
  importState: (state: unknown) => boolean;
  exportState: () => string;
  resetAll: () => void;
}

const MAX_HISTORY = 500;
const MAX_ATTEMPTS = 300;
const MAX_GAMES = 50;

const initialState = {
  onboarded: false,
  puzzleRating: DEFAULT_START_RATING,
  ratedAttempts: 0,
  ratingHistory: [] as RatingPoint[],
  attempts: [] as PuzzleAttempt[],
  seen: {} as Record<string, PuzzleOutcome>,
  streak: { current: 0, best: 0, lastDate: null } as Streak,
  daily: null as DailyPuzzleState | null,
  lessons: {} as Record<string, LessonProgress>,
  games: [] as GameRecord[],
};

export type PersistedProgress = typeof initialState;

export const PROGRESS_STORAGE_KEY = 'chess-trainer:progress';

function nextStreak(streak: Streak, today: string): Streak {
  if (streak.lastDate === today) return streak;
  const continues = streak.lastDate !== null && daysBetween(streak.lastDate, today) === 1;
  const current = continues ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDate: today };
}

function isPersistedProgress(value: unknown): value is Partial<PersistedProgress> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.puzzleRating === 'number' || typeof v.onboarded === 'boolean';
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initialState,

      completeOnboarding: (startingRating) =>
        set({
          onboarded: true,
          puzzleRating: startingRating,
          ratingHistory: [{ at: Date.now(), rating: startingRating }],
        }),

      recordPuzzle: ({ rated, ...attempt }) => {
        const state = get();
        const before = state.puzzleRating;
        const score = attempt.outcome === 'failed' ? 0 : attempt.hintUsed ? 0.5 : 1;
        const after = rated
          ? updateRating(before, attempt.puzzleRating, score, state.ratedAttempts).after
          : before;
        const now = Date.now();
        const today = localDateKey(new Date(now));

        set({
          puzzleRating: after,
          ratedAttempts: rated ? state.ratedAttempts + 1 : state.ratedAttempts,
          ratingHistory: rated
            ? [...state.ratingHistory, { at: now, rating: after }].slice(-MAX_HISTORY)
            : state.ratingHistory,
          attempts: [
            { ...attempt, ratingBefore: before, ratingAfter: after, at: now },
            ...state.attempts,
          ].slice(0, MAX_ATTEMPTS),
          seen: { ...state.seen, [attempt.id]: attempt.outcome },
          streak: attempt.outcome === 'solved' ? nextStreak(state.streak, today) : state.streak,
        });
        return { before, after };
      },

      setDaily: (daily) => set({ daily }),

      markLessonStep: (lessonId, stepIndex, totalSteps) => {
        const current = get().lessons[lessonId] ?? {
          stepsDone: [],
          completedAt: null,
          lastVisitedAt: Date.now(),
        };
        const stepsDone = current.stepsDone.includes(stepIndex)
          ? current.stepsDone
          : [...current.stepsDone, stepIndex].sort((a, b) => a - b);
        const completedAt =
          current.completedAt ?? (stepsDone.length >= totalSteps ? Date.now() : null);
        set({
          lessons: {
            ...get().lessons,
            [lessonId]: { stepsDone, completedAt, lastVisitedAt: Date.now() },
          },
        });
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
        set({ games: [{ ...game, at: Date.now() }, ...get().games].slice(0, MAX_GAMES) }),

      exportState: () => {
        const {
          onboarded,
          puzzleRating,
          ratedAttempts,
          ratingHistory,
          attempts,
          seen,
          streak,
          daily,
          lessons,
          games,
        } = get();
        return JSON.stringify(
          {
            app: 'chess-trainer',
            version: 1,
            exportedAt: new Date().toISOString(),
            progress: {
              onboarded,
              puzzleRating,
              ratedAttempts,
              ratingHistory,
              attempts,
              seen,
              streak,
              daily,
              lessons,
              games,
            },
          },
          null,
          2,
        );
      },

      importState: (raw) => {
        const payload: unknown =
          typeof raw === 'object' && raw !== null && 'progress' in raw ? raw.progress : raw;
        if (!isPersistedProgress(payload)) return false;
        set({ ...initialState, ...payload });
        return true;
      },

      resetAll: () => set({ ...initialState }),
    }),
    {
      name: PROGRESS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const {
          onboarded,
          puzzleRating,
          ratedAttempts,
          ratingHistory,
          attempts,
          seen,
          streak,
          daily,
          lessons,
          games,
        } = state;
        return {
          onboarded,
          puzzleRating,
          ratedAttempts,
          ratingHistory,
          attempts,
          seen,
          streak,
          daily,
          lessons,
          games,
        };
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

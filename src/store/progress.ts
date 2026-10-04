import { create } from 'zustand';
import {
  recordWoodpecker,
  startWoodpeckerCycle,
  type WoodpeckerSet,
} from '@/features/puzzles/woodpecker';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  keepCorruptBlob,
  rehydrateOnStorageChange,
  safeLocalStorage,
  warnNewerSave,
} from '@/lib/persistStorage';
import type { OwnPuzzle } from '@/features/puzzles/ownPuzzles';
import { daysBetween, localDateKey, trainingStreak } from '@/lib/dates';
import {
  PUZZLE_REVIEW_STEPS_DAYS,
  type PuzzleReviewCard,
  scheduleFailed,
  scheduleSolved,
} from '@/lib/puzzleReview';
import { DAY_MS, dueAt } from '@/lib/srs';
import {
  blend,
  DEFAULT_VOLATILITY,
  expectedScore,
  INITIAL_RD,
  inflate,
  rate,
  type Rating,
} from '@/lib/glicko';
import { attemptScore, type HintLevel, ratedSolveScore, REPEAT_WEIGHT } from '@/lib/puzzleScore';
import {
  CALIBRATION_PUZZLES,
  CALIBRATION_START_RATING,
  DEFAULT_PUZZLE_RD,
  DEFAULT_START_RATING,
  SELF_ASSESSED_RD,
} from '@/lib/rating';
import { writeIsolationFlag } from '@/sw/isolation';
import { useRepertoire } from './repertoire';
import { useAnalyses } from './analyses';
import { useGames } from './games';
import { storageKeyFor } from './profiles';
import { takeLegacyLearnerFields } from './settings';
import {
  type BackupProblem,
  type BackupShape,
  EXPORT_VERSION,
  parse,
  progressSlice,
  validateBackupFile,
} from './backupSchema';

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
  /** The opening practised when the puzzle came from by-opening mode (Lichess tag). */
  opening?: string;
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
  /**
   * The steps done, by key: a step's `id` when the lesson gives it one, otherwise
   * its position (numbers only in saves made before steps had ids).
   */
  stepsDone: (number | string)[];
  completedAt: number | null;
  lastVisitedAt: number;
}

/** Numbers first in order, then ids in order: a stable order for `stepsDone`. */
function compareStepKeys(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Where a game against the engine was played. */
export type GameRecordSource = 'play' | 'ladder' | 'book' | 'arcade' | 'simul' | 'drill';
export const GAME_RECORD_SOURCES: readonly GameRecordSource[] = [
  'play',
  'ladder',
  'book',
  'arcade',
  'simul',
  'drill',
];

export interface GameRecord {
  /** Unique id (several games can end in the same millisecond, in a simul). */
  id: string;
  at: number;
  level: number;
  color: 'white' | 'black';
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: string;
  plies: number;
  pgn: string;
  /** Which mode the game came from; an ordinary engine game when missing in old saves. */
  source: GameRecordSource;
  /** What the mode called the game, e.g. "Queen odds" or "Simul board 3". */
  event?: string;
  /** Opening practice: the repertoire followed and where the game left it. */
  book?: {
    repertoireId: string;
    status: 'in-book' | 'out-of-book' | 'deviated';
    endedAtPly: number | null;
    deviationPly: number | null;
  };
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

/** Best result in one of the arcade games (Hand & Brain, Fortress, Engine Says, …). */
export interface ArcadeResult {
  /** Best score, in the game's own units. */
  best: number;
  plays: number;
  lastAt: number;
  /** What the best score was, in words, e.g. "Brain · 94% · beat Level 4". */
  detail?: string;
}

/** The Daily Opening game: today's guesses and the streak of solved days. */
export interface DailyOpeningState {
  /** The day (YYYY-MM-DD) these guesses belong to. */
  date: string;
  /** Opening names guessed so far that day. */
  guesses: string[];
  /** Solved, given up, or still in play. */
  result: 'solved' | 'failed' | null;
  streak: number;
  bestStreak: number;
  /** Days played and how many guesses the solve took (0 for a miss). */
  history: Record<string, number>;
}

/** The Odds Ladder: which handicap the engine currently gives and how each rung has gone. */
export interface OddsLadderState {
  /** Index of the current rung; 0 is the biggest handicap. */
  rung: number;
  /** Highest rung reached. */
  best: number;
  /** Games per rung; `draws` was added in 0.12 (missing in older saves means none). */
  results: Record<number, { wins: number; losses: number; draws?: number }>;
}

export interface Placement {
  at: number;
  /** Suggested starting puzzle rating. */
  rating: number;
  courseId: string;
}

/**
 * Counters that never forget: the attempt list is capped, so "puzzles solved",
 * accuracy, solve time and the course checkpoints read these instead.
 */
export interface LifetimeStats {
  attempts: number;
  solved: number;
  failed: number;
  /** Solves per puzzle theme (a puzzle counts once for each of its themes). */
  solvedByTheme: Record<string, number>;
  /** Total time spent on solved puzzles, in milliseconds. */
  solveTimeMs: number;
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
  /** Result of the placement quiz, if taken. */
  placement: Placement | null;
  /** The active Woodpecker set (a fixed set of puzzles solved in repeated cycles). */
  woodpecker: WoodpeckerSet | null;
  ratedAttempts: number;
  ratingHistory: RatingPoint[];
  /** The most recent attempts (capped; see `lifetime` for the totals). */
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
  /** Best results in the arcade games, by game id. */
  arcade: Record<string, ArcadeResult>;
  dailyOpening: DailyOpeningState | null;
  oddsLadder: OddsLadderState;
  /** Engine ladder: highest level ever beaten (the game list itself is capped). */
  ladderHeight: number;
  /** Longest run of training days ever (the day list itself is capped). */
  bestStreak: number;
  lifetime: LifetimeStats;
  /** When this learner last exported or shared a backup. */
  lastBackupAt: number | null;
  /** Rated attempts at the time of that backup. */
  lastBackupAttempts: number;
  /** "Later" on the backup reminder hides it until this time. */
  backupSnoozedUntil: number | null;
  /** The welcome card on Home was dismissed. */
  tourDismissed: boolean;
  /** Usernames remembered for the game import (per learner, like the games). */
  lichessUsername: string;
  chesscomUsername: string;

  /**
   * Sets the starting rating. `'self'` trusts the learner's own assessment
   * (moderately uncertain); `'calibrate'` starts a short run of rated puzzles
   * that finds the level from `startingRating` when given, else the default.
   * The rating history keeps its past points.
   */
  completeOnboarding: (startingRating: number, mode?: 'self' | 'calibrate') => void;
  setPlacement: (placement: Omit<Placement, 'at'>) => void;
  /** Starts a new Woodpecker set (replacing any current one) with its first cycle running. */
  startWoodpecker: (puzzleIds: string[], rating: number) => void;
  /** Starts the next cycle of the current set. */
  startWoodpeckerCycle: () => void;
  recordWoodpeckerAttempt: (outcome: PuzzleOutcome, durationMs: number) => void;
  /** Drops a puzzle that is no longer in the bundled set from the current Woodpecker set (no attempt is recorded). */
  skipWoodpeckerPuzzle: (id: string) => void;
  abandonWoodpecker: () => void;
  recordPuzzle: (
    attempt: Omit<PuzzleAttempt, 'ratingBefore' | 'ratingAfter' | 'at' | 'score'> & {
      rated: boolean;
      /** The attempt came from the review queue: solves advance the schedule. */
      review?: boolean;
      /** The mode the attempt was made in; Woodpecker misses do not join the review queue. */
      mode?: string;
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
   * Marks a step done, by its key (the step's id, or its index without one).
   * `steps` is the lesson's step keys in order (or, as a number, how many steps
   * it has, keyed by index): the lesson completes once every one of them is
   * done. `taskSteps` lists the keys of the task steps; when the lesson
   * completes they are scheduled for recall.
   */
  markLessonStep: (
    lessonId: string,
    step: number | string,
    steps: number | (number | string)[],
    taskSteps?: (number | string)[],
  ) => void;
  visitLesson: (lessonId: string) => void;
  /** Starts the lesson over: the steps are cleared, the completion is kept. */
  resetLesson: (lessonId: string) => void;
  recordGame: (
    game: Omit<GameRecord, 'at' | 'id' | 'source'> & { source?: GameRecordSource },
  ) => void;
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
  /** Counts a play of an arcade game and keeps its best score (with the detail of that best). */
  recordArcade: (gameId: string, score: number, detail?: string) => void;
  setDailyOpening: (state: DailyOpeningState) => void;
  setOddsLadder: (state: OddsLadderState) => void;
  /** Raises the engine ladder's remembered height (never lowers it). */
  setLadderHeight: (height: number) => void;
  /** Records that a backup was just made (the reminder counts from here). */
  markBackedUp: (now?: number) => void;
  /** Hides the backup reminder for a while. */
  snoozeBackup: (until: number) => void;
  dismissTour: () => void;
  setUsernames: (
    names: Partial<Pick<ProgressState, 'lichessUsername' | 'chesscomUsername'>>,
  ) => void;
  /**
   * Replaces this profile's progress, repertoire, library and games with a
   * backup. Every part is checked first; nothing changes when the file is refused.
   */
  importState: (raw: unknown) => ImportResult;
  exportState: () => string;
  /** Clears this profile's progress, repertoire, library and games. Other profiles are kept. */
  resetAll: () => void;
}

/** What a backup holds, for the confirmation before it replaces the current data. */
export interface BackupSummary {
  exportedAt: string | null;
  version: number;
  attempts: number;
  games: number;
  analyses: number;
  repertoires: number;
  /** Damaged entries that were skipped. */
  dropped: number;
}

export type ImportResult =
  | { ok: true; summary: BackupSummary; warning?: string }
  | { ok: false; reason: string; problem: BackupProblem };

export type BackupPreview =
  | { ok: true; summary: BackupSummary; warning?: string; shape: BackupShape }
  | { ok: false; reason: string; problem: BackupProblem };

const MAX_HISTORY = 500;
const MAX_ATTEMPTS = 300;
const MAX_GAMES = 50;
const MAX_RUSH_RUNS = 30;
const MAX_TRAINING_DAYS = 400;
/** Puzzle ids remembered as seen; the oldest are forgotten first. */
export const MAX_SEEN = 20_000;
/** The review queue never grows past this: the newest step-0 cards go first. */
export const MAX_PUZZLE_REVIEWS = 500;
/** The biggest Woodpecker set the app builds (shared sets are cut to it). */
export const MAX_WOODPECKER_IDS = 200;

function withToday(days: string[], today = localDateKey()): string[] {
  if (days.includes(today)) return days;
  return [...days, today].sort().slice(-MAX_TRAINING_DAYS);
}

const emptyLifetime = (): LifetimeStats => ({
  attempts: 0,
  solved: 0,
  failed: 0,
  solvedByTheme: {},
  solveTimeMs: 0,
});

const initialState = {
  onboarded: false,
  puzzleRating: DEFAULT_START_RATING,
  puzzleRd: INITIAL_RD,
  puzzleVolatility: DEFAULT_VOLATILITY,
  lastRatedAt: null as number | null,
  calibration: null as Calibration | null,
  placement: null as Placement | null,
  woodpecker: null as WoodpeckerSet | null,
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
  arcade: {} as Record<string, ArcadeResult>,
  dailyOpening: null as DailyOpeningState | null,
  oddsLadder: { rung: 0, best: 0, results: {} },
  ladderHeight: 0,
  bestStreak: 0,
  lifetime: emptyLifetime(),
  lastBackupAt: null as number | null,
  lastBackupAttempts: 0,
  backupSnoozedUntil: null as number | null,
  tourDismissed: false,
  lichessUsername: '',
  chesscomUsername: '',
};

export type PersistedProgress = typeof initialState;

/**
 * The persisted slice of the store: everything that is not an action,
 * including fields this build does not know (from a newer version), so a
 * save from the future loses nothing when an older build writes it back.
 */
function persisted(state: ProgressState): PersistedProgress {
  const out = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== 'function') out[key] = value;
  }
  return out as PersistedProgress;
}

const MAX_OWN_PUZZLES = 300;

/** Recall/lesson cards get a nominal rating so the shared scheduler shape fits. */
export const RECALL_CARD_RATING = 0;
/** Lesson positions come back for the first time after three days (step 1 of the schedule). */
export const RECALL_FIRST_STEP = 1;

export const PROGRESS_STORAGE_KEY = 'chess-trainer:progress';
export const PROGRESS_VERSION = 7;
/** Where the data an import is about to replace is kept, for "Undo import". */
export const PRE_IMPORT_BACKUP_KEY = 'chess-trainer:pre-import-backup';

function nextStreak(streak: Streak, today: string): Streak {
  if (streak.lastDate === today) return streak;
  const continues = streak.lastDate !== null && daysBetween(streak.lastDate, today) === 1;
  const current = continues ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDate: today };
}

/**
 * The puzzle streak as it stands today: the stored count while the last solve
 * was today or yesterday, otherwise zero (the stored value only changes on a
 * solve, so on its own it would still say "7" ten days after the last one).
 */
export function puzzleStreak(
  progress: Pick<ProgressState, 'streak'>,
  today: string = localDateKey(),
): Streak {
  const { streak } = progress;
  const alive = streak.lastDate !== null && daysBetween(streak.lastDate, today) <= 1;
  return alive ? streak : { ...streak, current: 0 };
}

/** The longest run of training days, counting runs that fell off the capped day list. */
export function bestTrainingStreak(
  progress: Pick<ProgressState, 'trainingDays' | 'bestStreak'>,
): number {
  return Math.max(progress.bestStreak, trainingStreak(progress.trainingDays).best);
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

/** Adds one attempt to the lifetime counters. */
export function addLifetime(
  lifetime: LifetimeStats,
  attempt: Pick<PuzzleAttempt, 'outcome' | 'themes' | 'durationMs'>,
): LifetimeStats {
  const solved = attempt.outcome === 'solved';
  const byTheme = { ...lifetime.solvedByTheme };
  if (solved) {
    for (const theme of attempt.themes.split(' ').filter(Boolean)) {
      byTheme[theme] = (byTheme[theme] ?? 0) + 1;
    }
  }
  return {
    attempts: lifetime.attempts + 1,
    solved: lifetime.solved + (solved ? 1 : 0),
    failed: lifetime.failed + (solved ? 0 : 1),
    solvedByTheme: byTheme,
    solveTimeMs: lifetime.solveTimeMs + (solved ? Math.max(0, attempt.durationMs) : 0),
  };
}

/**
 * Lifetime counters for a save made before they existed: what the attempt
 * list still holds, and the theme statistics (which were never capped).
 */
export function lifetimeFrom(
  attempts: readonly PuzzleAttempt[],
  themeStats: Record<string, ThemeStat>,
): LifetimeStats {
  const base = attempts.reduce((acc, a) => addLifetime(acc, a), {
    ...emptyLifetime(),
    solvedByTheme: {},
  });
  const byTheme: Record<string, number> = { ...base.solvedByTheme };
  for (const [theme, stat] of Object.entries(themeStats)) {
    if (stat.solved > (byTheme[theme] ?? 0)) byTheme[theme] = stat.solved;
  }
  return { ...base, solvedByTheme: byTheme };
}

const newGameId = (at: number) => `g-${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Fills the id and source of game records from before they existed. */
function normalizeGames(games: readonly GameRecord[]): GameRecord[] {
  const ids = new Set<string>();
  return games.map((game, index) => {
    let id =
      typeof game.id === 'string' && game.id ? game.id : `g-${game.at.toString(36)}-${index}`;
    while (ids.has(id)) id = `${id}-${index}`;
    ids.add(id);
    const source = GAME_RECORD_SOURCES.includes(game.source) ? game.source : 'play';
    return { ...game, id, source };
  });
}

/** Keeps the newest `MAX_SEEN` ids (entries are kept in insertion order). */
export function pruneSeen(seen: Record<string, PuzzleOutcome>): Record<string, PuzzleOutcome> {
  const keys = Object.keys(seen);
  if (keys.length <= MAX_SEEN) return seen;
  return Object.fromEntries(
    keys.slice(keys.length - MAX_SEEN).map((k) => [k, seen[k] as PuzzleOutcome]),
  );
}

/** Caps the review queue: cards further along the schedule are kept, the newest misses go first. */
export function capReviews(
  cards: Record<string, PuzzleReviewCard>,
  max = MAX_PUZZLE_REVIEWS,
): Record<string, PuzzleReviewCard> {
  const all = Object.values(cards);
  if (all.length <= max) return cards;
  const kept = all.sort((a, b) => b.step - a.step || a.addedAt - b.addedAt).slice(0, max);
  return Object.fromEntries(kept.map((c) => [c.id, c]));
}

const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

/**
 * Fills in the Glicko-2 fields for saves and exports made before they existed:
 * the deviation is guessed from how many rated puzzles the old Elo rating had
 * seen, and the last rated time from the rating history. Also fills every
 * later addition (lifetime counters, game ids…) and repairs a rating that is
 * not a number. Tolerates `null`.
 */
export function withRatingDefaults(
  stored: Partial<PersistedProgress> | null | undefined,
): PersistedProgress {
  const input: Partial<PersistedProgress> =
    typeof stored === 'object' && stored !== null ? stored : {};
  const state = { ...initialState, ...input };
  if (typeof input.puzzleRd !== 'number' || !Number.isFinite(input.puzzleRd)) {
    const n = input.ratedAttempts ?? 0;
    state.puzzleRd = !input.onboarded
      ? INITIAL_RD
      : n >= 30
        ? 80
        : n >= 10
          ? 130
          : n > 0
            ? 200
            : SELF_ASSESSED_RD;
  }
  if (typeof input.puzzleVolatility !== 'number' || !Number.isFinite(input.puzzleVolatility)) {
    state.puzzleVolatility = DEFAULT_VOLATILITY;
  }
  state.puzzleRating = finite(state.puzzleRating, DEFAULT_START_RATING);
  if (input.lastRatedAt === undefined) {
    const history = input.ratingHistory ?? [];
    state.lastRatedAt = history.length > 1 ? (history[history.length - 1]?.at ?? null) : null;
  }
  if (input.calibration === undefined) state.calibration = null;
  if (input.placement === undefined) state.placement = null;
  if (input.woodpecker === undefined) state.woodpecker = null;
  state.games = normalizeGames(state.games);
  state.seen = pruneSeen(state.seen);
  state.puzzleReviews = capReviews(state.puzzleReviews);
  state.bestStreak = Math.max(
    finite(state.bestStreak, 0),
    trainingStreak(state.trainingDays).best,
    finite(state.streak.best, 0),
  );
  if (!input.lifetime) {
    state.lifetime = lifetimeFrom(state.attempts, state.themeStats);
  } else if (state.lifetime.attempts < state.attempts.length) {
    // A lifetime that fell behind the list (hand-edited file): the list is the floor.
    const fromList = lifetimeFrom(state.attempts, state.themeStats);
    state.lifetime = {
      attempts: Math.max(state.lifetime.attempts, fromList.attempts),
      solved: Math.max(state.lifetime.solved, fromList.solved),
      failed: Math.max(state.lifetime.failed, fromList.failed),
      solvedByTheme: fromList.solvedByTheme,
      solveTimeMs: Math.max(state.lifetime.solveTimeMs, fromList.solveTimeMs),
    };
  }
  return state;
}

/**
 * A stored blob (any version) checked field by field: a field of the wrong
 * type falls back to its default, damaged list entries are dropped, and keys
 * this build does not know are kept so a newer save survives a round trip.
 */
export function repairProgress(stored: unknown): PersistedProgress & Record<string, unknown> {
  const parsed = parse(progressSlice, stored, 'repair', 'progress');
  const known = parsed.ok ? parsed.value : {};
  const state: Record<string, unknown> = withRatingDefaults(known);
  if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      if (!(key in initialState) && value !== undefined) state[key] = value;
    }
  }
  return state as PersistedProgress & Record<string, unknown>;
}

function summarize(shape: BackupShape): BackupSummary {
  return {
    exportedAt: shape.exportedAt,
    version: shape.version,
    attempts: shape.progress.lifetime?.attempts ?? shape.progress.attempts?.length ?? 0,
    games: Object.keys(shape.games?.games ?? {}).length,
    analyses: Object.keys(shape.analyses?.items ?? {}).length,
    repertoires: shape.repertoire?.custom?.length ?? 0,
    dropped: shape.dropped,
  };
}

/** Checks a backup file without touching any store: what it holds, or why it is refused. */
export function inspectBackup(raw: unknown): BackupPreview {
  const checked = validateBackupFile(raw);
  if (!checked.ok) return checked;
  const preview: BackupPreview = {
    ok: true,
    summary: summarize(checked.shape),
    shape: checked.shape,
  };
  if (checked.warning) preview.warning = checked.warning;
  return preview;
}

export const useProgress = create<ProgressState>()(
  persist<ProgressState, [], [], PersistedProgress>(
    (set, get) => {
      /** Today added to the training days, and the best streak kept up to date. */
      const training = (days: string[], today = localDateKey()) => {
        const trainingDays = withToday(days, today);
        return {
          trainingDays,
          bestStreak:
            trainingDays === days
              ? get().bestStreak
              : Math.max(get().bestStreak, trainingStreak(trainingDays, today).best),
        };
      };

      return {
        ...initialState,

        completeOnboarding: (startingRating, mode = 'self') => {
          const now = Date.now();
          const calibrate = mode === 'calibrate';
          const rating = finite(
            calibrate ? startingRating || CALIBRATION_START_RATING : startingRating,
            DEFAULT_START_RATING,
          );
          set({
            onboarded: true,
            puzzleRating: rating,
            puzzleRd: calibrate ? INITIAL_RD : SELF_ASSESSED_RD,
            puzzleVolatility: DEFAULT_VOLATILITY,
            lastRatedAt: null,
            calibration: calibrate ? { total: CALIBRATION_PUZZLES, done: 0, startedAt: now } : null,
            ratingHistory: [...get().ratingHistory, { at: now, rating }].slice(-MAX_HISTORY),
          });
        },

        setPlacement: (placement) => set({ placement: { ...placement, at: Date.now() } }),

        startWoodpecker: (puzzleIds, rating) => {
          const now = Date.now();
          set({
            woodpecker: startWoodpeckerCycle(
              {
                id: `wp-${now.toString(36)}`,
                createdAt: now,
                rating: Math.round(finite(rating, DEFAULT_START_RATING)),
                // A shared set may repeat ids or be far bigger than any the app builds.
                puzzleIds: [...new Set(puzzleIds)].slice(0, MAX_WOODPECKER_IDS),
                cycles: [],
                current: null,
              },
              now,
            ),
          });
        },

        startWoodpeckerCycle: () => {
          const current = get().woodpecker;
          if (current) set({ woodpecker: startWoodpeckerCycle(current) });
        },

        recordWoodpeckerAttempt: (outcome, durationMs) => {
          const current = get().woodpecker;
          if (!current) return;
          set({
            woodpecker: recordWoodpecker(current, outcome, durationMs),
            ...training(get().trainingDays),
          });
        },

        skipWoodpeckerPuzzle: (id) => {
          const current = get().woodpecker;
          if (!current?.puzzleIds.includes(id)) return;
          const puzzleIds = current.puzzleIds.filter((p) => p !== id);
          // Removing the id shifts the rest down: the cycle's index already points at the next one.
          const progress = current.current;
          if (progress && progress.index >= puzzleIds.length) {
            // That was the last puzzle of the cycle: the cycle is complete.
            const { startedAt, solved, failed, timeMs } = progress;
            set({
              woodpecker: {
                ...current,
                puzzleIds,
                current: null,
                cycles: [
                  ...current.cycles,
                  { startedAt, finishedAt: Date.now(), solved, failed, timeMs },
                ],
              },
            });
            return;
          }
          set({ woodpecker: { ...current, puzzleIds } });
        },

        abandonWoodpecker: () => set({ woodpecker: null }),

        recordPuzzle: ({ rated, review = false, mode, puzzleRd, solverMoves, ...attempt }) => {
          const state = get();
          const now = Date.now();
          const before = state.puzzleRating;
          const hintLevel: HintLevel = attempt.hintLevel ?? (attempt.hintUsed ? 1 : 0);
          let score = attemptScore({
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
            const puzzle = { rating: attempt.puzzleRating, rd: puzzleRd ?? DEFAULT_PUZZLE_RD };
            // A correct solve, however slow, never costs rating points.
            score = ratedSolveScore(attempt.outcome, score, expectedScore(current, puzzle));
            const updated = rate(current, [{ ...puzzle, score }]);
            // A puzzle seen before says less about strength.
            const candidate =
              attempt.id in state.seen ? blend(current, updated, REPEAT_WEIGHT) : updated;
            // A rating pipeline fed a bad number stays where it was rather than storing NaN.
            next =
              Number.isFinite(candidate.rating) &&
              Number.isFinite(candidate.rd) &&
              Number.isFinite(candidate.volatility)
                ? candidate
                : current;
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
            // Woodpecker misses come back in the next cycle anyway; the queue stays for the rest.
            if (mode !== 'woodpecker') {
              reviews[attempt.id] = scheduleFailed(reviews[attempt.id], meta, now);
            }
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
            lifetime: addLifetime(state.lifetime, attempt),
            seen: pruneSeen({ ...state.seen, [attempt.id]: attempt.outcome }),
            streak: attempt.outcome === 'solved' ? nextStreak(state.streak, today) : state.streak,
            themeStats: addThemeStats(state.themeStats, attempt.themes, attempt.outcome),
            puzzleReviews: capReviews(reviews),
            ...training(state.trainingDays, today),
          });
          return { before, after, calibrationDone };
        },

        touchTraining: () => {
          const next = training(get().trainingDays);
          if (next.trainingDays !== get().trainingDays) set(next);
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
            puzzleReviews: capReviews({
              ...reviews,
              [meta.id]: { ...meta, step: 0, due: now, lapses: 0, addedAt: now },
            }),
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
            puzzleReviews: capReviews(reviews),
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
              due: dueAt(now, PUZZLE_REVIEW_STEPS_DAYS[RECALL_FIRST_STEP] ?? 3),
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
          set({ lessonRecall: recall, ...training(get().trainingDays) });
        },

        recordStudy: (studyId, outcome, clean) => {
          const current = get().studies[studyId] ?? { solvedAt: null, attempts: 0, clean: false };
          set({
            studies: {
              ...get().studies,
              [studyId]: {
                solvedAt:
                  outcome === 'solved' ? (current.solvedAt ?? Date.now()) : current.solvedAt,
                attempts: current.attempts + 1,
                clean: current.clean || (outcome === 'solved' && clean),
              },
            },
            ...training(get().trainingDays),
          });
        },

        setDaily: (daily) => set({ daily }),

        markLessonStep: (lessonId, step, steps, taskSteps = []) => {
          const current = get().lessons[lessonId] ?? {
            stepsDone: [],
            completedAt: null,
            lastVisitedAt: Date.now(),
          };
          const stepsDone = current.stepsDone.includes(step)
            ? current.stepsDone
            : [...current.stepsDone, step].sort(compareStepKeys);
          // Every current step must be done: keys of steps since removed do not count.
          const keys =
            typeof steps === 'number' ? Array.from({ length: steps }, (_, i) => i) : steps;
          const done = new Set(stepsDone);
          const justCompleted = current.completedAt === null && keys.every((key) => done.has(key));
          const completedAt = current.completedAt ?? (justCompleted ? Date.now() : null);
          set({
            lessons: {
              ...get().lessons,
              [lessonId]: { stepsDone, completedAt, lastVisitedAt: Date.now() },
            },
            ...training(get().trainingDays),
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
          const current = get().lessons[lessonId];
          if (!current) return;
          set({
            lessons: {
              ...get().lessons,
              [lessonId]: {
                stepsDone: [],
                completedAt: current.completedAt,
                lastVisitedAt: Date.now(),
              },
            },
          });
        },

        recordGame: ({ source = 'play', ...game }) => {
          const at = Date.now();
          set({
            games: [{ ...game, source, id: newGameId(at), at }, ...get().games].slice(0, MAX_GAMES),
            ...training(get().trainingDays),
          });
        },

        recordUnratedOutcome: (id, themes, outcome, rating = 0) =>
          set({
            seen: pruneSeen({ ...get().seen, [id]: outcome }),
            themeStats: addThemeStats(get().themeStats, themes, outcome),
            puzzleReviews:
              outcome === 'failed'
                ? capReviews({
                    ...get().puzzleReviews,
                    [id]: scheduleFailed(
                      get().puzzleReviews[id],
                      { id, rating, themes },
                      Date.now(),
                    ),
                  })
                : get().puzzleReviews,
          }),

        recordRush: (run) =>
          set({
            rushRuns: [{ ...run, at: Date.now() }, ...get().rushRuns].slice(0, MAX_RUSH_RUNS),
            ...training(get().trainingDays),
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
            ...training(get().trainingDays),
          });
        },

        recordGuessGame: (gameId, score, maxScore) => {
          const current = get().guessGames[gameId];
          const days = training(get().trainingDays);
          if (current && current.score >= score) {
            set({
              guessGames: {
                ...get().guessGames,
                [gameId]: { ...current, completedAt: Date.now() },
              },
              ...days,
            });
            return;
          }
          set({
            guessGames: {
              ...get().guessGames,
              [gameId]: { score, maxScore, completedAt: Date.now() },
            },
            ...days,
          });
        },

        recordArcade: (gameId, score, detail) => {
          const current = get().arcade[gameId];
          const best = current ? Math.max(current.best, score) : score;
          set({
            arcade: {
              ...get().arcade,
              [gameId]: {
                best,
                plays: (current?.plays ?? 0) + 1,
                lastAt: Date.now(),
                detail: !current || score >= current.best ? detail : current.detail,
              },
            },
            ...training(get().trainingDays),
          });
        },

        setDailyOpening: (dailyOpening) => {
          set({ dailyOpening, ...training(get().trainingDays) });
        },

        setOddsLadder: (oddsLadder) => {
          set({ oddsLadder, ...training(get().trainingDays) });
        },

        setLadderHeight: (height) => {
          if (height > get().ladderHeight) set({ ladderHeight: height });
        },

        markBackedUp: (now = Date.now()) =>
          set({
            lastBackupAt: now,
            lastBackupAttempts: get().ratedAttempts,
            backupSnoozedUntil: null,
          }),

        snoozeBackup: (until) => set({ backupSnoozedUntil: until }),

        dismissTour: () => set({ tourDismissed: true }),

        setUsernames: (names) => {
          const patch: Partial<Pick<ProgressState, 'lichessUsername' | 'chesscomUsername'>> = {};
          if (names.lichessUsername !== undefined) {
            patch.lichessUsername = names.lichessUsername.trim();
          }
          if (names.chesscomUsername !== undefined) {
            patch.chesscomUsername = names.chesscomUsername.trim();
          }
          set(patch);
        },

        exportState: () => {
          const { games, player } = useGames.getState();
          return JSON.stringify(
            {
              app: 'chess-trainer',
              version: EXPORT_VERSION,
              exportedAt: new Date().toISOString(),
              progress: persisted(get()),
              repertoire: (({ cards, custom, sessions }) => ({ cards, custom, sessions }))(
                useRepertoire.getState(),
              ),
              analyses: { items: useAnalyses.getState().items },
              games: { games, player },
            },
            null,
            2,
          );
        },

        importState: (raw) => {
          const preview = inspectBackup(raw);
          if (!preview.ok) return preview;
          const { shape, summary, warning } = preview;
          // Every part passed: apply them together, so a refused file changes nothing
          // and an accepted one never leaves half the stores replaced.
          const next = withRatingDefaults(shape.progress);
          if (Object.keys(next.themeStats).length === 0) {
            next.themeStats = next.attempts.reduce(
              (acc, a) => addThemeStats(acc, a.themes, a.outcome),
              {} as Record<string, ThemeStat>,
            );
            next.lifetime = lifetimeFrom(next.attempts, next.themeStats);
          }
          useRepertoire.getState().replaceState(shape.repertoire ?? {});
          useAnalyses.getState().replaceState(shape.analyses ?? {});
          useGames.getState().replaceState(shape.games ?? {});
          set(next);
          return warning ? { ok: true, summary, warning } : { ok: true, summary };
        },

        resetAll: () => {
          useRepertoire.getState().resetAll();
          useAnalyses.getState().clear();
          useGames.getState().clear();
          safeLocalStorage.removeItem(PRE_IMPORT_BACKUP_KEY);
          void writeIsolationFlag(false);
          set({ ...initialState, lifetime: emptyLifetime() });
        },
      };
    },
    {
      name: storageKeyFor(PROGRESS_STORAGE_KEY),
      version: PROGRESS_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => persisted(state),
      migrate: (stored, version): PersistedProgress => {
        const input =
          typeof stored === 'object' && stored !== null
            ? { ...(stored as Record<string, unknown>) }
            : {};
        if (version > PROGRESS_VERSION) {
          // A newer save: keep every field (merge keeps the unknown ones too).
          warnNewerSave(PROGRESS_STORAGE_KEY, version, PROGRESS_VERSION);
          return input as unknown as PersistedProgress;
        }
        const state = withRatingDefaults(repairProgress(input));
        if (version < 2 && Object.keys(state.themeStats).length === 0) {
          // Rebuild theme statistics from the attempts we still have.
          state.themeStats = state.attempts.reduce(
            (acc, a) => addThemeStats(acc, a.themes, a.outcome),
            {} as Record<string, ThemeStat>,
          );
          state.lifetime = lifetimeFrom(state.attempts, state.themeStats);
        }
        if (version < 7) {
          // Backup reminders, the welcome card and the import usernames used to be
          // device-wide settings; the settings store hands them over once.
          const legacy = takeLegacyLearnerFields();
          if (legacy) {
            if (legacy.lastBackupAt !== undefined) state.lastBackupAt = legacy.lastBackupAt;
            if (legacy.lastBackupAttempts !== undefined) {
              state.lastBackupAttempts = legacy.lastBackupAttempts;
            }
            if (legacy.tourDismissed !== undefined) state.tourDismissed = legacy.tourDismissed;
            if (legacy.lichessUsername !== undefined) {
              state.lichessUsername = legacy.lichessUsername;
            }
            if (legacy.chesscomUsername !== undefined) {
              state.chesscomUsername = legacy.chesscomUsername;
            }
          }
        }
        return state;
      },
      merge: (persistedState, current): ProgressState => ({
        ...current,
        ...repairProgress(persistedState),
      }),
      onRehydrateStorage: keepCorruptBlob(storageKeyFor(PROGRESS_STORAGE_KEY)),
    },
  ),
);

rehydrateOnStorageChange(useProgress, storageKeyFor(PROGRESS_STORAGE_KEY));

/** Derived statistics used by the Home and Progress pages (lifetime counters, not the capped list). */
export function summarizeProgress(state: ProgressState) {
  const { lifetime } = state;
  const solved = lifetime.solved;
  const failed = lifetime.failed;
  const lessonsCompleted = Object.values(state.lessons).filter(
    (l) => l.completedAt !== null,
  ).length;
  const wins = state.games.filter((g) =>
    g.color === 'white' ? g.result === '1-0' : g.result === '0-1',
  ).length;
  const draws = state.games.filter((g) => g.result === '1/2-1/2').length;
  const losses = state.games.length - wins - draws;
  const avgSolveMs = solved > 0 ? lifetime.solveTimeMs / solved : 0;
  return { solved, failed, lessonsCompleted, wins, draws, losses, avgSolveMs };
}

import type { SavedAnalysis } from './analyses';
import type { StoredGame } from './games';
import type { PersistedProgress } from './progress';
import type { PersistedRepertoire } from './repertoire';
import { learnerSettingsFrom, type LearnerSettings } from './settings';

/**
 * What a backup file — and a saved store — may contain, field by field.
 *
 * Every persisted slice is checked against these schemas in two places: when
 * a backup is imported (strict: a field of the wrong type refuses the file,
 * naming the field) and when a store hydrates from localStorage (repair: a
 * field of the wrong type falls back to its default). In both modes the
 * elements of arrays and records are checked one by one and damaged ones
 * dropped, numbers must be finite and unknown keys are dropped. Fields that
 * are missing are left missing, so the stores can fill in their own defaults
 * (and `withRatingDefaults` can derive the Glicko-2 fields of old saves).
 */
export type SchemaMode = 'strict' | 'repair';

interface Context {
  mode: SchemaMode;
  /** Damaged array elements and record entries skipped so far. */
  dropped: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Validates `value` at `path`; returns the cleaned value or the reason it is unusable. */
export type Schema<T> = (value: unknown, path: string, ctx: Context) => Parsed<T>;

type Infer<S> = S extends Schema<infer T> ? T : never;
type InferShape<S extends Record<string, Schema<unknown>>> = { [K in keyof S]: Infer<S[K]> };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const bad = (path: string, reason: string): Parsed<never> => ({
  ok: false,
  reason: `${path} ${reason}`,
});

const describe = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value;

/* ------------------------------------------------------------------ */
/* Primitives                                                         */
/* ------------------------------------------------------------------ */

export const string: Schema<string> = (value, path) =>
  typeof value === 'string' ? ok(value) : bad(path, `should be text, not ${describe(value)}`);

/** A finite number. */
export const number: Schema<number> = (value, path) =>
  typeof value === 'number' && Number.isFinite(value)
    ? ok(value)
    : bad(path, `should be a number, not ${describe(value)}`);

export const boolean: Schema<boolean> = (value, path) =>
  typeof value === 'boolean'
    ? ok(value)
    : bad(path, `should be true or false, not ${describe(value)}`);

/** One of a fixed set of values. */
export function literal<const T extends readonly (string | number)[]>(
  ...values: T
): Schema<T[number]> {
  return (value, path) =>
    (values as readonly unknown[]).includes(value)
      ? ok(value as T[number])
      : bad(path, `should be one of ${values.map(String).join(', ')}`);
}

export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return (value, path, ctx) => (value === null ? ok(null) : schema(value, path, ctx));
}

/**
 * A list whose damaged elements are dropped (and counted) rather than
 * failing the whole list.
 */
export function array<T>(element: Schema<T>): Schema<T[]> {
  return (value, path, ctx) => {
    if (!Array.isArray(value)) return bad(path, `should be a list, not ${describe(value)}`);
    const out: T[] = [];
    value.forEach((item, index) => {
      const parsed = element(item, `${path}[${index}]`, ctx);
      if (parsed.ok) out.push(parsed.value);
      else ctx.dropped += 1;
    });
    return ok(out);
  };
}

/** A map from string keys to values; damaged entries are dropped and counted. */
export function record<T>(element: Schema<T>): Schema<Record<string, T>> {
  return (value, path, ctx) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return bad(path, `should be a table, not ${describe(value)}`);
    }
    const out: Record<string, T> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const parsed = element(item, `${path}.${key}`, ctx);
      if (parsed.ok) out[key] = parsed.value;
      else ctx.dropped += 1;
    }
    return ok(out);
  };
}

/**
 * An object with required fields and, optionally, fields that may be left
 * out. Unknown keys are dropped. A missing or damaged required field makes
 * the object unusable (so an element in a list is dropped, a top-level field
 * refused or defaulted).
 */
export function struct<
  R extends Record<string, Schema<unknown>>,
  O extends Record<string, Schema<unknown>> = Record<never, never>,
>(required: R, optional?: O): Schema<InferShape<R> & Partial<InferShape<O>>> {
  return (value, path, ctx) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return bad(path, `should be a record, not ${describe(value)}`);
    }
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(required)) {
      if (input[key] === undefined) return bad(`${path}.${key}`, 'is missing');
      const parsed = schema(input[key], `${path}.${key}`, ctx);
      if (!parsed.ok) return parsed;
      out[key] = parsed.value;
    }
    for (const [key, schema] of Object.entries(optional ?? {})) {
      if (input[key] === undefined) continue;
      const parsed = schema(input[key], `${path}.${key}`, ctx);
      if (!parsed.ok) return parsed;
      out[key] = parsed.value;
    }
    return ok(out as InferShape<R> & Partial<InferShape<O>>);
  };
}

/**
 * A persisted slice: every field is optional (older saves lack the newer
 * ones), unknown keys are dropped, and a field of the wrong type refuses the
 * slice in strict mode or is left out in repair mode (the store then uses
 * its default).
 */
export function slice<F extends Record<string, Schema<unknown>>>(
  fields: F,
): Schema<Partial<InferShape<F>>> {
  return (value, path, ctx) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return bad(path, `should be a record, not ${describe(value)}`);
    }
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(fields)) {
      if (input[key] === undefined) continue;
      const parsed = schema(input[key], `${path}.${key}`, ctx);
      if (parsed.ok) out[key] = parsed.value;
      else if (ctx.mode === 'strict') return parsed;
      else ctx.dropped += 1;
    }
    return ok(out as Partial<InferShape<F>>);
  };
}

/** Runs a schema from the top with a fresh context. */
export function parse<T>(
  schema: Schema<T>,
  value: unknown,
  mode: SchemaMode,
  path = 'file',
): Parsed<T> & { dropped: number } {
  const ctx: Context = { mode, dropped: 0 };
  const result = schema(value, path, ctx);
  return { ...result, dropped: ctx.dropped };
}

/* ------------------------------------------------------------------ */
/* The stores' slices                                                 */
/* ------------------------------------------------------------------ */

const outcome = literal('solved', 'failed');
const longColor = literal('white', 'black');

const reviewCard = struct({
  id: string,
  rating: number,
  themes: string,
  step: number,
  due: number,
  lapses: number,
  addedAt: number,
});

const puzzleAttempt = struct(
  {
    id: string,
    puzzleRating: number,
    outcome,
    hintUsed: boolean,
    ratingBefore: number,
    ratingAfter: number,
    themes: string,
    at: number,
    durationMs: number,
  },
  { hintLevel: literal(0, 1, 2), score: number, opening: string },
);

export const gameRecord = struct(
  {
    at: number,
    level: number,
    color: longColor,
    result: literal('1-0', '0-1', '1/2-1/2'),
    reason: string,
    plies: number,
    pgn: string,
  },
  {
    // Added in 0.12: older records get an id and the 'play' source when they load.
    id: string,
    source: literal('play', 'ladder', 'book', 'arcade', 'simul', 'drill', 'humanlike'),
    event: string,
    // Added in 0.16: the rating a human-like opponent played at.
    opponentRating: number,
    book: struct({
      repertoireId: string,
      status: literal('in-book', 'out-of-book', 'deviated'),
      endedAtPly: nullable(number),
      deviationPly: nullable(number),
    }),
    // Added in 0.17: the game's id on Lichess, once sent there.
    lichessId: string,
  },
);

const ownPuzzle = struct(
  {
    id: string,
    fen: string,
    moves: string,
    rating: number,
    rd: number,
    popularity: number,
    plays: number,
    themes: string,
    url: string,
    createdAt: number,
    source: struct(
      {
        title: string,
        ply: number,
        played: string,
        judgement: literal('inaccuracy', 'mistake', 'blunder'),
        loss: number,
      },
      { url: string },
    ),
  },
  { opening: string },
);

/** A puzzle missed on Lichess, in the app's form (added in 0.17). */
const lichessPuzzle = struct(
  {
    id: string,
    fen: string,
    moves: string,
    rating: number,
    rd: number,
    popularity: number,
    plays: number,
    themes: string,
    url: string,
  },
  { opening: string },
);

const ownThreat = struct(
  {
    id: string,
    fen: string,
    threat: string,
    line: array(string),
    defences: array(string),
    rating: number,
    kind: literal('mate', 'material'),
    source: struct(
      { title: string, ply: number, played: string },
      { url: string, byLearner: boolean },
    ),
    createdAt: number,
    found: number,
    missed: number,
    streak: number,
  },
  { also: array(string), motifs: string, game: string },
);

const woodpeckerSet = struct({
  id: string,
  createdAt: number,
  rating: number,
  puzzleIds: array(string),
  cycles: array(
    struct({
      startedAt: number,
      finishedAt: number,
      solved: number,
      failed: number,
      timeMs: number,
    }),
  ),
  current: nullable(
    struct({
      cycle: number,
      index: number,
      startedAt: number,
      solved: number,
      failed: number,
      timeMs: number,
    }),
  ),
});

/** A lesson step's key in `stepsDone`: its position, or the step's own id (text). */
const stepKey: Schema<number | string> = (value, path, ctx) =>
  typeof value === 'string' ? ok(value) : number(value, path, ctx);

/** The progress store, field by field (see `PersistedProgress`). */
export const progressFields = {
  onboarded: boolean,
  puzzleRating: number,
  puzzleRd: number,
  puzzleVolatility: number,
  lastRatedAt: nullable(number),
  calibration: nullable(struct({ total: number, done: number, startedAt: number })),
  placement: nullable(struct({ at: number, rating: number, courseId: string })),
  woodpecker: nullable(woodpeckerSet),
  ratedAttempts: number,
  ratingHistory: array(struct({ at: number, rating: number })),
  attempts: array(puzzleAttempt),
  seen: record(outcome),
  streak: struct({ current: number, best: number, lastDate: nullable(string) }),
  daily: nullable(struct({ date: string, id: string, outcome: nullable(outcome) })),
  lessons: record(
    struct(
      { stepsDone: array(stepKey), completedAt: nullable(number), lastVisitedAt: number },
      { marked: boolean },
    ),
  ),
  games: array(gameRecord),
  themeStats: record(struct({ solved: number, failed: number })),
  rushRuns: array(
    struct({
      at: number,
      mode: literal('timed', 'survival'),
      score: number,
      peakRating: number,
      durationMs: number,
    }),
  ),
  drills: record(struct({ best: number, attempts: number, lastAt: number }, { detail: string })),
  guessGames: record(struct({ score: number, maxScore: number, completedAt: number })),
  puzzleReviews: record(reviewCard),
  trainingDays: array(string),
  ownPuzzles: record(ownPuzzle),
  lessonRecall: record(reviewCard),
  studies: record(struct({ solvedAt: nullable(number), attempts: number, clean: boolean })),
  arcade: record(struct({ best: number, plays: number, lastAt: number }, { detail: string })),
  dailyOpening: nullable(
    struct({
      date: string,
      guesses: array(string),
      result: nullable(outcome),
      streak: number,
      bestStreak: number,
      history: record(number),
    }),
  ),
  oddsLadder: struct({
    rung: number,
    best: number,
    results: record(struct({ wins: number, losses: number }, { draws: number })),
  }),
  ladderHeight: number,
  bestStreak: number,
  lifetime: struct({
    attempts: number,
    solved: number,
    failed: number,
    solvedByTheme: record(number),
    solveTimeMs: number,
  }),
  lastBackupAt: nullable(number),
  lastBackupAttempts: number,
  backupSnoozedUntil: nullable(number),
  tourDismissed: boolean,
  lichessUsername: string,
  chesscomUsername: string,
  // Added in 0.15 (export version 8).
  blind: struct({
    // Keyed by depth ('short', 'long', 'veryLong'); other keys are ignored when read.
    levels: record(number),
    solved: number,
    failed: number,
    clean: number,
    run: number,
    bestRun: number,
    lastAt: nullable(number),
  }),
  threatStats: struct({
    found: number,
    missed: number,
    defended: number,
    defenceTried: number,
    run: number,
    bestRun: number,
    lastAt: nullable(number),
    recent: array(string),
  }),
  ownThreats: record(ownThreat),
  selfReview: struct({
    games: number,
    found: number,
    total: number,
    falseAlarms: number,
    suggestions: number,
    goodSuggestions: number,
    history: array(struct({ at: number, found: number, total: number })),
  }),
  blunderChecks: struct({ stopped: number, playedAnyway: number }),
  // Added in 0.17 (export version 10).
  lichessPuzzles: record(lichessPuzzle),
  // Added in 0.22 (export version 11).
  lichessRounds: array(struct({ id: string, at: number, win: boolean, themes: string })),
  lineage: array(string),
} satisfies { [K in keyof PersistedProgress]: Schema<unknown> };

export const progressSlice = slice(progressFields) as Schema<Partial<PersistedProgress>>;

/** The repertoire store (see `PersistedRepertoire`). */
export const repertoireFields = {
  cards: record(
    struct({
      ease: number,
      interval: number,
      due: number,
      reps: number,
      lapses: number,
      lastReviewed: nullable(number),
    }),
  ),
  custom: array(
    struct({ id: string, name: string, color: longColor, pgn: string, createdAt: number }),
  ),
  sessions: array(struct({ at: number, repertoireId: string, correct: number, total: number })),
} satisfies { [K in keyof PersistedRepertoire]: Schema<PersistedRepertoire[K]> };

export const repertoireSlice = slice(repertoireFields);

export const savedAnalysis = struct({
  id: string,
  name: string,
  collection: string,
  pgn: string,
  startFen: string,
  moves: number,
  createdAt: number,
  updatedAt: number,
}) satisfies Schema<SavedAnalysis>;

/** The analysis library (see `AnalysesState.items`). */
export const analysesFields = { items: record(savedAnalysis) };

export const analysesSlice = slice(analysesFields);

const errorCounts = struct({ inaccuracy: number, mistake: number, blunder: number });
const phaseDigest = struct({ moves: number, loss: number, errors: number });
const perColor = <T>(schema: Schema<T>) => struct({ white: schema, black: schema });
const reviewDigest = struct({
  phases: struct({
    opening: perColor(phaseDigest),
    middlegame: perColor(phaseDigest),
    endgame: perColor(phaseDigest),
  }),
  motifs: perColor(record(number)),
});

export const storedGame = struct(
  {
    id: string,
    pgn: string,
    white: string,
    black: string,
    result: string,
    date: string,
    event: string,
    url: nullable(string),
    plies: number,
    speed: nullable(literal('bullet', 'blitz', 'rapid', 'classical', 'correspondence')),
    rated: nullable(boolean),
    timestamp: nullable(number),
    source: literal('lichess', 'chesscom', 'pgn', 'online'),
    importedAt: number,
    review: nullable(
      struct(
        {
          accuracy: struct({ white: number, black: number }),
          counts: struct({ white: errorCounts, black: errorCounts }),
          depth: number,
          at: number,
        },
        { digest: reviewDigest },
      ),
    ),
  },
  { headers: record(string), startFen: string, side: longColor },
) satisfies Schema<StoredGame>;

/** The imported games store (see `GamesState`). */
export const gamesFields = { games: record(storedGame), player: string };

export const gamesSlice = slice(gamesFields);

/* ------------------------------------------------------------------ */
/* The backup file                                                    */
/* ------------------------------------------------------------------ */

/** The export format written by this build (see `exportState`). */
export const EXPORT_VERSION = 12;

/** Why a file was refused: not ours, ours but broken, not JSON at all, or a PGN by the look of it. */
export type BackupProblem = 'not-a-backup' | 'damaged' | 'unreadable' | 'looks-like-pgn';

/** The parts of a backup after validation; a part is undefined when the file did not carry it. */
export interface BackupShape {
  version: number;
  exportedAt: string | null;
  progress: Partial<PersistedProgress>;
  repertoire?: Partial<PersistedRepertoire>;
  analyses?: Partial<{ items: Record<string, SavedAnalysis> }>;
  games?: Partial<{ games: Record<string, StoredGame>; player: string }>;
  /** The learner's settings (format 12 on); a setting that does not check out is left out. */
  settings?: Partial<LearnerSettings>;
  /** Damaged entries skipped across every part. */
  dropped: number;
}

export type BackupShapeResult =
  | { ok: true; shape: BackupShape; warning?: string }
  | { ok: false; problem: BackupProblem; reason: string };

/**
 * Whether `raw` looks like a backup at all: the envelope our exports write,
 * or (from before 0.4) the bare progress object. Nothing else is accepted.
 */
function looksLikeProgress(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.puzzleRating === 'number' || typeof v.onboarded === 'boolean';
}

/**
 * Checks a parsed backup file field by field without touching any store.
 * Strict: the first field of the wrong type refuses the file with its path;
 * damaged list elements and table entries are dropped and counted.
 */
export function validateBackupFile(raw: unknown, current = EXPORT_VERSION): BackupShapeResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      problem: 'not-a-backup',
      reason: 'The file is not a Chess Trainer backup.',
    };
  }
  const file = raw as Record<string, unknown>;
  const enveloped = 'progress' in file;
  if (enveloped && file.app !== undefined && file.app !== 'chess-trainer') {
    return {
      ok: false,
      problem: 'not-a-backup',
      reason: 'The file is not a Chess Trainer backup.',
    };
  }
  const progressPart = enveloped ? file.progress : file;
  if (!looksLikeProgress(progressPart)) {
    return {
      ok: false,
      problem: 'not-a-backup',
      reason: 'The file is not a Chess Trainer backup.',
    };
  }
  const version = enveloped && typeof file.version === 'number' ? file.version : 1;
  // A newer format still imports: the fields this build knows are checked as
  // usual and the rest are left out, which the learner is warned about.
  const warning =
    version > current
      ? `This backup was made by a newer version of the app (format ${version}; this app reads up to ${current}). Anything it holds that this version does not know is left out — update the app and import it again to get everything.`
      : undefined;
  const ctx: Context = { mode: 'strict', dropped: 0 };
  const progress = progressSlice(progressPart, 'progress', ctx);
  if (!progress.ok) return damaged(progress.reason);
  const shape: BackupShape = {
    version,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null,
    progress: progress.value,
    dropped: 0,
  };
  if (enveloped && file.repertoire !== undefined) {
    const part = repertoireSlice(file.repertoire, 'repertoire', ctx);
    if (!part.ok) return damaged(part.reason);
    shape.repertoire = part.value;
  }
  if (enveloped && file.analyses !== undefined) {
    const part = analysesSlice(file.analyses, 'analyses', ctx);
    if (!part.ok) return damaged(part.reason);
    shape.analyses = part.value;
  }
  if (enveloped && file.games !== undefined) {
    const part = gamesSlice(file.games, 'games', ctx);
    if (!part.ok) return damaged(part.reason);
    shape.games = part.value;
  }
  // Settings never make a file damaged: one that does not check out is left out, as a load does.
  if (enveloped && typeof file.settings === 'object' && file.settings !== null) {
    shape.settings = learnerSettingsFrom(file.settings);
  }
  shape.dropped = ctx.dropped;
  return warning ? { ok: true, shape, warning } : { ok: true, shape };
}

function damaged(reason: string): BackupShapeResult {
  return { ok: false, problem: 'damaged', reason: `The backup is damaged: ${reason}.` };
}

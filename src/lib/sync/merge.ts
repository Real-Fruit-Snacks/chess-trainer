import type { SavedAnalysis } from '@/store/analyses';
import { capAnalyses } from '@/store/analyses';
import { capGames, type StoredGame } from '@/store/games';
import {
  capOwnThreats,
  capReviews,
  type GameRecord,
  keepReviewedPuzzles,
  type LessonProgress,
  type OddsLadderState,
  MAX_ATTEMPTS,
  MAX_GAMES,
  MAX_HISTORY,
  MAX_OWN_PUZZLES,
  MAX_RECENT_THREATS,
  MAX_RUSH_RUNS,
  MAX_SELF_REVIEWS,
  MAX_TRAINING_DAYS,
  type PersistedProgress,
  pruneSeen,
  repairProgress,
} from '@/store/progress';
import type { PersistedRepertoire } from '@/store/repertoire';
import type { PuzzleReviewCard } from '@/lib/puzzleReview';
import type { SrsCard } from '@/lib/srs';
import { canonical, same } from './canonical';

/**
 * Merging two devices' data. Every sync merges three versions of a profile:
 * the one this device last agreed with the relay (`base`), this device's now
 * (`local`) and the relay's now (`remote`). A part only one side changed takes
 * that side's change, so deletions and resets carry over; a part both changed
 * is combined by its own rule:
 *
 * - logs (puzzle attempts, rating points, games, training days) join;
 * - counters (puzzles solved, plays, theme statistics) add up both sides'
 *   increments — remote plus what this device added since the base;
 * - bests take the higher, firsts the earlier, lasts the later;
 * - schedules keep the card reviewed last (or, for the puzzle queue, the one
 *   with more misses, so nothing is let off a review);
 * - a repertoire or analysis edited on both sides is kept twice, the other
 *   version as "(other device)", so no work is lost.
 *
 * Without a base (a device joining with progress of its own) nothing can be
 * known to have been deleted: everything joins, and counters take the larger.
 * Every rule gives the same answer whichever side is local, so two devices
 * that merge the same versions end up with the same data.
 */

export interface SyncSnapshot {
  progress: PersistedProgress;
  repertoire: PersistedRepertoire;
  analyses: { items: Record<string, SavedAnalysis> };
  games: { games: Record<string, StoredGame>; player: string };
}

/**
 * Progress fields each device keeps for itself: the backup reminder. A merge
 * keeps this device's values, and comparing synced data leaves them out, or
 * two devices would keep writing their own values over each other's.
 */
export const DEVICE_FIELDS = ['lastBackupAt', 'lastBackupAttempts', 'backupSnoozedUntil'] as const;

/** The snapshot without the device's own fields: what sync carries between devices. */
function synced(snapshot: SyncSnapshot): unknown {
  const progress: Record<string, unknown> = { ...snapshot.progress };
  for (const field of DEVICE_FIELDS) delete progress[field];
  return { ...snapshot, progress };
}

/** Whether two snapshots hold the same synced data (device fields aside). */
export function sameData(a: SyncSnapshot, b: SyncSnapshot): boolean {
  return same(synced(a), synced(b));
}

/** `next`, with this device's own fields taken from `device`. */
export function withDeviceFields(next: SyncSnapshot, device: SyncSnapshot): SyncSnapshot {
  const progress = { ...next.progress };
  for (const field of DEVICE_FIELDS) {
    (progress as Record<string, unknown>)[field] = device.progress[field];
  }
  return { ...next, progress };
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                    */
/* ------------------------------------------------------------------ */

/** One of two values, the same one whichever is passed first. */
function either<T>(a: T, b: T): T {
  return canonical(a) >= canonical(b) ? a : b;
}

/**
 * Three-way choice: a side that kept the base's value takes the other side's;
 * when both changed it, `resolve` decides. Without a base, any difference is
 * resolved.
 */
function pick<T>(
  hasBase: boolean,
  base: T | undefined,
  local: T,
  remote: T,
  resolve: (local: T, remote: T) => T,
): T {
  if (same(local, remote)) return local;
  if (hasBase) {
    if (same(local, base)) return remote;
    if (same(remote, base)) return local;
  }
  return resolve(local, remote);
}

/** A count both sides add to: the remote count plus this device's increments since the base. */
function count(base: number | undefined, local: number, remote: number): number {
  if (base === undefined) return Math.max(local, remote);
  return Math.max(0, remote + local - base);
}

const maxOf = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);
const minOf = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);

/**
 * Entries by key, three-way: on both sides they are merged by `entry`; on one
 * side only they stay, unless the other side deleted one it had not changed.
 * Keys keep this device's order, the other side's new ones after.
 */
function mergeRecord<T>(
  base: Record<string, T> | undefined,
  local: Record<string, T>,
  remote: Record<string, T>,
  entry: (base: T | undefined, local: T, remote: T) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const was = base?.[key];
    const here = local[key];
    const there = remote[key];
    if (here !== undefined && there !== undefined) out[key] = entry(was, here, there);
    else if (here !== undefined) {
      // Deleted over there, and unchanged here since: it goes.
      if (!(was !== undefined && same(here, was))) out[key] = here;
    } else if (there !== undefined) {
      if (!(was !== undefined && same(there, was))) out[key] = there;
    }
  }
  return out;
}

/** Counters by key (a missing key counts as nothing yet). */
function countRecord(
  base: Record<string, number> | undefined,
  local: Record<string, number>,
  remote: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const was = base === undefined ? undefined : (base[key] ?? 0);
    out[key] = count(was, local[key] ?? was ?? 0, remote[key] ?? was ?? 0);
  }
  return out;
}

/** Both lists, one copy of each item by `key` (`resolve` picks between two versions of one). */
function join<T>(
  local: readonly T[],
  remote: readonly T[],
  key: (item: T) => string,
  resolve: (local: T, remote: T) => T = either,
): T[] {
  const out = new Map<string, T>();
  for (const item of local) out.set(key(item), item);
  for (const item of remote) {
    const k = key(item);
    const mine = out.get(k);
    out.set(k, mine === undefined ? item : resolve(mine, item));
  }
  return [...out.values()];
}

/** A short, stable fingerprint of some data (FNV-1a), for naming the copy of an item. */
function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  const text = canonical(value);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Items both sides edited: the winner keeps its id, the other version is kept
 * beside it as a copy, under an id and name every device derives the same.
 */
function keepBoth<T extends { id: string; name: string }>(
  base: Record<string, T> | undefined,
  local: Record<string, T>,
  remote: Record<string, T>,
  winner: (a: T, b: T) => T,
): Record<string, T> {
  const copies: T[] = [];
  const merged = mergeRecord(base, local, remote, (was, here, there) =>
    pick(base !== undefined, was, here, there, (a, b) => {
      const kept = winner(a, b);
      const other = kept === a ? b : a;
      copies.push({
        ...other,
        id: `${other.id}~${fingerprint(other)}`,
        name: `${other.name} (other device)`,
      });
      return kept;
    }),
  );
  for (const copy of copies) merged[copy.id] ??= copy;
  return merged;
}

/* ------------------------------------------------------------------ */
/* Progress                                                           */
/* ------------------------------------------------------------------ */

/** The puzzle queue: more misses win (nothing is let off a review), then further along, then sooner. */
function reviewCard(a: PuzzleReviewCard, b: PuzzleReviewCard): PuzzleReviewCard {
  if (a.lapses !== b.lapses) return a.lapses > b.lapses ? a : b;
  if (a.step !== b.step) return a.step > b.step ? a : b;
  if (a.due !== b.due) return a.due < b.due ? a : b;
  return either(a, b);
}

function mergeReviews(
  base: Record<string, PuzzleReviewCard> | undefined,
  local: Record<string, PuzzleReviewCard>,
  remote: Record<string, PuzzleReviewCard>,
): Record<string, PuzzleReviewCard> {
  return mergeRecord(base, local, remote, (was, here, there) =>
    pick(base !== undefined, was, here, there, reviewCard),
  );
}

function mergeLesson(
  was: LessonProgress | undefined,
  here: LessonProgress,
  there: LessonProgress,
  hasBase: boolean,
): LessonProgress {
  return pick(hasBase, was, here, there, (a, b) => {
    const steps = [...new Set([...a.stepsDone, ...b.stepsDone])].sort((x, y) =>
      typeof x === typeof y ? (x < y ? -1 : x > y ? 1 : 0) : typeof x === 'number' ? -1 : 1,
    );
    const lesson: LessonProgress = {
      stepsDone: steps,
      completedAt: minOf(a.completedAt, b.completedAt),
      lastVisitedAt: Math.max(a.lastVisitedAt, b.lastVisitedAt),
    };
    const marked = pick(hasBase, was?.marked, a.marked, b.marked, () => undefined);
    if (marked) lesson.marked = true;
    return lesson;
  });
}

/** The side whose `at` (a time, or a YYYY-MM-DD day) is later. */
const later = <T>(a: T, b: T, at: (x: T) => number | string | null) => {
  const x = at(a) ?? '';
  const y = at(b) ?? '';
  return x === y ? either(a, b) : x > y ? a : b;
};

function mergeProgressFields(
  b: PersistedProgress | null,
  l: PersistedProgress,
  r: PersistedProgress,
): PersistedProgress {
  const has = b !== null;
  const base = b ?? undefined;
  const lastRated = later(l, r, (p) => p.lastRatedAt);

  // Both sides' rating changes count. Two devices on the same rating agree, though: with
  // "Puzzle rating from Lichess" on, each takes the same rating from Lichess, and adding
  // those two changes would push the rating past it, and back, sync after sync.
  const puzzleRating = b
    ? pick(true, b.puzzleRating, l.puzzleRating, r.puzzleRating, (x, y) =>
        Math.round(x + y - b.puzzleRating),
      )
    : lastRated.puzzleRating;
  const puzzleReviews = capReviews(
    mergeReviews(base?.puzzleReviews, l.puzzleReviews, r.puzzleReviews),
  );

  // Own puzzles: the newest are kept, and the queue lets go of any that fell off.
  const ownAll = mergeRecord(base?.ownPuzzles, l.ownPuzzles, r.ownPuzzles, (was, x, y) =>
    pick(has, was, x, y, either),
  );
  const ownKept = Object.values(ownAll)
    .sort((x, y) => y.createdAt - x.createdAt || (x.id < y.id ? -1 : 1))
    .slice(0, MAX_OWN_PUZZLES);
  const ownIds = new Set(ownKept.map((p) => p.id));
  for (const id of Object.keys(puzzleReviews)) {
    if (id.startsWith('own-') && !ownIds.has(id)) delete puzzleReviews[id];
  }
  const lichessPuzzles = keepReviewedPuzzles(
    mergeRecord(base?.lichessPuzzles, l.lichessPuzzles, r.lichessPuzzles, (was, x, y) =>
      pick(has, was, x, y, either),
    ),
    puzzleReviews,
  );

  const blindLater = later(l.blind, r.blind, (s) => s.lastAt);
  const threatLater = later(l.threatStats, r.threatStats, (s) => s.lastAt);

  return {
    // Fields this version does not know (from a newer one) stay as this device has them.
    ...l,
    onboarded: pick(has, base?.onboarded, l.onboarded, r.onboarded, (x, y) => x || y),
    puzzleRating,
    puzzleRd: has
      ? pick(true, base?.puzzleRd, l.puzzleRd, r.puzzleRd, Math.min)
      : lastRated.puzzleRd,
    puzzleVolatility: has
      ? pick(
          true,
          base?.puzzleVolatility,
          l.puzzleVolatility,
          r.puzzleVolatility,
          () => lastRated.puzzleVolatility,
        )
      : lastRated.puzzleVolatility,
    lastRatedAt: pick(has, base?.lastRatedAt, l.lastRatedAt, r.lastRatedAt, maxOf),
    calibration: pick(has, base?.calibration, l.calibration, r.calibration, (x, y) =>
      x === null || y === null
        ? null
        : x.done !== y.done
          ? x.done > y.done
            ? x
            : y
          : either(x, y),
    ),
    placement: pick(has, base?.placement, l.placement, r.placement, (x, y) =>
      x === null ? y : y === null ? x : later(x, y, (p) => p.at),
    ),
    woodpecker: pick(has, base?.woodpecker, l.woodpecker, r.woodpecker, (x, y) => {
      if (x === null || y === null) return x ?? y;
      if (x.id !== y.id) return later(x, y, (s) => s.createdAt);
      const progress = (s: typeof x) => s.cycles.length * 1e6 + (s.current?.index ?? -1);
      return progress(x) !== progress(y) ? (progress(x) > progress(y) ? x : y) : either(x, y);
    }),
    ratedAttempts: count(base?.ratedAttempts, l.ratedAttempts, r.ratedAttempts),
    ratingHistory: join(l.ratingHistory, r.ratingHistory, (p) => `${p.at}:${p.rating}`)
      .sort((x, y) => x.at - y.at || x.rating - y.rating)
      .slice(-MAX_HISTORY),
    attempts: join(l.attempts, r.attempts, (a) => `${a.id}:${a.at}`)
      .sort((x, y) => y.at - x.at || (x.id < y.id ? -1 : 1))
      .slice(0, MAX_ATTEMPTS),
    seen: pruneSeen(
      mergeRecord(base?.seen, l.seen, r.seen, (was, x, y) =>
        pick(has, was, x, y, () => 'failed' as const),
      ),
    ),
    streak: pick(has, base?.streak, l.streak, r.streak, (x, y) => {
      const last =
        x.lastDate === y.lastDate
          ? x.current >= y.current
            ? x
            : y
          : later(x, y, (s) => s.lastDate);
      return { ...last, best: Math.max(x.best, y.best) };
    }),
    daily: pick(has, base?.daily, l.daily, r.daily, (x, y) => {
      if (x === null || y === null) return x ?? y;
      if (x.date !== y.date) return later(x, y, (d) => d.date);
      const rank = (d: typeof x) => (d.outcome === 'solved' ? 2 : d.outcome === 'failed' ? 1 : 0);
      return rank(x) !== rank(y) ? (rank(x) > rank(y) ? x : y) : either(x, y);
    }),
    lessons: mergeRecord(base?.lessons, l.lessons, r.lessons, (was, x, y) =>
      mergeLesson(was, x, y, has),
    ),
    games: join(l.games, r.games, (g) => g.id, mergeGameRecord)
      .sort((x, y) => y.at - x.at || (x.id < y.id ? -1 : 1))
      .slice(0, MAX_GAMES),
    themeStats: mergeRecord(
      has ? (base?.themeStats ?? {}) : undefined,
      l.themeStats,
      r.themeStats,
      (was, x, y) =>
        pick(has, was, x, y, () => ({
          solved: count(has ? (was?.solved ?? 0) : undefined, x.solved, y.solved),
          failed: count(has ? (was?.failed ?? 0) : undefined, x.failed, y.failed),
        })),
    ),
    rushRuns: join(l.rushRuns, r.rushRuns, (run) => `${run.at}:${run.mode}:${run.score}`)
      .sort((x, y) => y.at - x.at || y.score - x.score)
      .slice(0, MAX_RUSH_RUNS),
    drills: mergeRecord(base?.drills, l.drills, r.drills, (was, x, y) =>
      pick(has, was, x, y, () => {
        const top = x.best !== y.best ? (x.best > y.best ? x : y) : later(x, y, (d) => d.lastAt);
        const drill = {
          best: Math.max(x.best, y.best),
          attempts: count(has ? (was?.attempts ?? 0) : undefined, x.attempts, y.attempts),
          lastAt: Math.max(x.lastAt, y.lastAt),
        };
        return top.detail === undefined ? drill : { ...drill, detail: top.detail };
      }),
    ),
    guessGames: mergeRecord(base?.guessGames, l.guessGames, r.guessGames, (was, x, y) =>
      pick(has, was, x, y, () =>
        x.score !== y.score ? (x.score > y.score ? x : y) : either(x, y),
      ),
    ),
    puzzleReviews,
    trainingDays: [...new Set([...l.trainingDays, ...r.trainingDays])]
      .sort()
      .slice(-MAX_TRAINING_DAYS),
    ownPuzzles: Object.fromEntries(ownKept.map((p) => [p.id, p])),
    lessonRecall: mergeReviews(base?.lessonRecall, l.lessonRecall, r.lessonRecall),
    studies: mergeRecord(base?.studies, l.studies, r.studies, (was, x, y) =>
      pick(has, was, x, y, () => ({
        solvedAt: minOf(x.solvedAt, y.solvedAt),
        attempts: count(has ? (was?.attempts ?? 0) : undefined, x.attempts, y.attempts),
        clean: x.clean || y.clean,
      })),
    ),
    arcade: mergeRecord(base?.arcade, l.arcade, r.arcade, (was, x, y) =>
      pick(has, was, x, y, () => {
        const top = x.best !== y.best ? (x.best > y.best ? x : y) : later(x, y, (a) => a.lastAt);
        const game = {
          best: Math.max(x.best, y.best),
          plays: count(has ? (was?.plays ?? 0) : undefined, x.plays, y.plays),
          lastAt: Math.max(x.lastAt, y.lastAt),
        };
        return top.detail === undefined ? game : { ...game, detail: top.detail };
      }),
    ),
    dailyOpening: pick(has, base?.dailyOpening, l.dailyOpening, r.dailyOpening, (x, y) => {
      if (x === null || y === null) return x ?? y;
      const rank = (d: typeof x) => (d.result === 'solved' ? 2 : d.result === 'failed' ? 1 : 0);
      const day =
        x.date !== y.date
          ? later(x, y, (d) => d.date)
          : rank(x) !== rank(y)
            ? rank(x) > rank(y)
              ? x
              : y
            : either(x, y);
      const history = { ...x.history };
      for (const [date, guesses] of Object.entries(y.history)) {
        history[date] = Math.max(history[date] ?? 0, guesses);
      }
      return { ...day, bestStreak: Math.max(x.bestStreak, y.bestStreak), history };
    }),
    oddsLadder: pick<OddsLadderState>(has, base?.oddsLadder, l.oddsLadder, r.oddsLadder, (x, y) => {
      const was = base?.oddsLadder.results;
      const results: OddsLadderState['results'] = {};
      for (const key of new Set([...Object.keys(x.results), ...Object.keys(y.results)])) {
        const rung = Number(key);
        const before = was?.[rung];
        const mine = x.results[rung];
        const theirs = y.results[rung];
        const at = (side: typeof mine, field: 'wins' | 'losses' | 'draws') =>
          side?.[field] ?? before?.[field] ?? 0;
        const tally = (field: 'wins' | 'losses' | 'draws') =>
          count(has ? (before?.[field] ?? 0) : undefined, at(mine, field), at(theirs, field));
        results[rung] = { wins: tally('wins'), losses: tally('losses'), draws: tally('draws') };
      }
      return { rung: Math.max(x.rung, y.rung), best: Math.max(x.best, y.best), results };
    }),
    ladderHeight: pick(has, base?.ladderHeight, l.ladderHeight, r.ladderHeight, Math.max),
    bestStreak: pick(has, base?.bestStreak, l.bestStreak, r.bestStreak, Math.max),
    lifetime: {
      attempts: count(base?.lifetime.attempts, l.lifetime.attempts, r.lifetime.attempts),
      solved: count(base?.lifetime.solved, l.lifetime.solved, r.lifetime.solved),
      failed: count(base?.lifetime.failed, l.lifetime.failed, r.lifetime.failed),
      solveTimeMs: count(
        base?.lifetime.solveTimeMs,
        l.lifetime.solveTimeMs,
        r.lifetime.solveTimeMs,
      ),
      solvedByTheme: countRecord(
        base?.lifetime.solvedByTheme,
        l.lifetime.solvedByTheme,
        r.lifetime.solvedByTheme,
      ),
    },
    // The backup reminder is this device's own business (DEVICE_FIELDS).
    lastBackupAt: l.lastBackupAt,
    lastBackupAttempts: l.lastBackupAttempts,
    backupSnoozedUntil: l.backupSnoozedUntil,
    tourDismissed: pick(
      has,
      base?.tourDismissed,
      l.tourDismissed,
      r.tourDismissed,
      (x, y) => x || y,
    ),
    lichessUsername: pick(
      has,
      base?.lichessUsername,
      l.lichessUsername,
      r.lichessUsername,
      (x) => x,
    ),
    chesscomUsername: pick(
      has,
      base?.chesscomUsername,
      l.chesscomUsername,
      r.chesscomUsername,
      (x) => x,
    ),
    blind: {
      levels: pick(
        has,
        base?.blind.levels,
        l.blind.levels,
        r.blind.levels,
        () => blindLater.levels,
      ),
      solved: count(base?.blind.solved, l.blind.solved, r.blind.solved),
      failed: count(base?.blind.failed, l.blind.failed, r.blind.failed),
      clean: count(base?.blind.clean, l.blind.clean, r.blind.clean),
      run: pick(has, base?.blind.run, l.blind.run, r.blind.run, () => blindLater.run),
      bestRun: pick(has, base?.blind.bestRun, l.blind.bestRun, r.blind.bestRun, Math.max),
      lastAt: pick(has, base?.blind.lastAt, l.blind.lastAt, r.blind.lastAt, maxOf),
    },
    threatStats: {
      found: count(base?.threatStats.found, l.threatStats.found, r.threatStats.found),
      missed: count(base?.threatStats.missed, l.threatStats.missed, r.threatStats.missed),
      defended: count(base?.threatStats.defended, l.threatStats.defended, r.threatStats.defended),
      defenceTried: count(
        base?.threatStats.defenceTried,
        l.threatStats.defenceTried,
        r.threatStats.defenceTried,
      ),
      run: pick(
        has,
        base?.threatStats.run,
        l.threatStats.run,
        r.threatStats.run,
        () => threatLater.run,
      ),
      bestRun: pick(
        has,
        base?.threatStats.bestRun,
        l.threatStats.bestRun,
        r.threatStats.bestRun,
        Math.max,
      ),
      lastAt: pick(
        has,
        base?.threatStats.lastAt,
        l.threatStats.lastAt,
        r.threatStats.lastAt,
        maxOf,
      ),
      recent: pick(
        has,
        base?.threatStats.recent,
        l.threatStats.recent,
        r.threatStats.recent,
        (x, y) => {
          const seen = new Set(x);
          return [...x, ...y.filter((id) => !seen.has(id))].slice(-MAX_RECENT_THREATS);
        },
      ),
    },
    ownThreats: capOwnThreats(
      mergeRecord(base?.ownThreats, l.ownThreats, r.ownThreats, (was, x, y) =>
        pick(has, was, x, y, (p, q) =>
          p.found + p.missed !== q.found + q.missed
            ? p.found + p.missed > q.found + q.missed
              ? p
              : q
            : either(p, q),
        ),
      ),
    ),
    selfReview: {
      games: count(base?.selfReview.games, l.selfReview.games, r.selfReview.games),
      found: count(base?.selfReview.found, l.selfReview.found, r.selfReview.found),
      total: count(base?.selfReview.total, l.selfReview.total, r.selfReview.total),
      falseAlarms: count(
        base?.selfReview.falseAlarms,
        l.selfReview.falseAlarms,
        r.selfReview.falseAlarms,
      ),
      suggestions: count(
        base?.selfReview.suggestions,
        l.selfReview.suggestions,
        r.selfReview.suggestions,
      ),
      goodSuggestions: count(
        base?.selfReview.goodSuggestions,
        l.selfReview.goodSuggestions,
        r.selfReview.goodSuggestions,
      ),
      history: join(l.selfReview.history, r.selfReview.history, (h) => `${h.at}`)
        .sort((x, y) => x.at - y.at)
        .slice(-MAX_SELF_REVIEWS),
    },
    blunderChecks: {
      stopped: count(base?.blunderChecks.stopped, l.blunderChecks.stopped, r.blunderChecks.stopped),
      playedAnyway: count(
        base?.blunderChecks.playedAnyway,
        l.blunderChecks.playedAnyway,
        r.blunderChecks.playedAnyway,
      ),
    },
    lichessPuzzles,
  };
}

/** One game recorded on two devices: the same record, with its Lichess id once either sent it. */
function mergeGameRecord(a: GameRecord, b: GameRecord): GameRecord {
  const kept = either(a, b);
  const lichessId =
    a.lichessId && b.lichessId
      ? a.lichessId < b.lichessId
        ? a.lichessId
        : b.lichessId
      : (a.lichessId ?? b.lichessId);
  return lichessId === undefined ? kept : { ...kept, lichessId };
}

export function mergeProgress(
  base: PersistedProgress | null,
  local: PersistedProgress,
  remote: PersistedProgress,
): PersistedProgress {
  // The store's own repair puts the result in order: the lifetime counts never
  // fall below the attempt list, the best streak covers the days, and so on.
  return {
    ...local,
    ...repairProgress(mergeProgressFields(base, local, remote)),
  };
}

/* ------------------------------------------------------------------ */
/* Repertoires, analyses, imported games                              */
/* ------------------------------------------------------------------ */

const MAX_SESSIONS = 50;

function srsCard(a: SrsCard, b: SrsCard): SrsCard {
  const x = a.lastReviewed ?? 0;
  const y = b.lastReviewed ?? 0;
  return x !== y ? (x > y ? a : b) : either(a, b);
}

export function mergeRepertoire(
  base: PersistedRepertoire | null,
  local: PersistedRepertoire,
  remote: PersistedRepertoire,
): PersistedRepertoire {
  const has = base !== null;
  const byId = (list: PersistedRepertoire['custom']) =>
    Object.fromEntries(list.map((rep) => [rep.id, rep]));
  const custom = keepBoth(
    base ? byId(base.custom) : undefined,
    byId(local.custom),
    byId(remote.custom),
    either,
  );
  return {
    cards: mergeRecord(base?.cards, local.cards, remote.cards, (was, x, y) =>
      pick(has, was, x, y, srsCard),
    ),
    custom: Object.values(custom).sort(
      (x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1),
    ),
    sessions: join(local.sessions, remote.sessions, (s) => `${s.at}:${s.repertoireId}`)
      .sort((x, y) => y.at - x.at || (x.repertoireId < y.repertoireId ? -1 : 1))
      .slice(0, MAX_SESSIONS),
  };
}

export function mergeAnalyses(
  base: SyncSnapshot['analyses'] | null,
  local: SyncSnapshot['analyses'],
  remote: SyncSnapshot['analyses'],
): SyncSnapshot['analyses'] {
  return {
    items: capAnalyses(
      keepBoth(base?.items, local.items, remote.items, (a, b) => later(a, b, (x) => x.updatedAt)),
    ),
  };
}

export function mergeGames(
  base: SyncSnapshot['games'] | null,
  local: SyncSnapshot['games'],
  remote: SyncSnapshot['games'],
): SyncSnapshot['games'] {
  const has = base !== null;
  const games = mergeRecord(base?.games, local.games, remote.games, (was, x, y) =>
    pick(has, was, x, y, (a, b) => {
      // The same import on two devices: the later review, if either reviewed it.
      const review =
        a.review === null
          ? b.review
          : b.review === null
            ? a.review
            : later(a.review, b.review, (r) => r.at);
      return { ...either(a, b), review };
    }),
  );
  return {
    games: capGames(games).games,
    player: pick(has, base?.player, local.player, remote.player, (x) => x),
  };
}

/** Merges whole snapshots (see the top of this file). */
export function mergeSnapshots(
  base: SyncSnapshot | null,
  local: SyncSnapshot,
  remote: SyncSnapshot,
): SyncSnapshot {
  return {
    progress: mergeProgress(base?.progress ?? null, local.progress, remote.progress),
    repertoire: mergeRepertoire(base?.repertoire ?? null, local.repertoire, remote.repertoire),
    analyses: mergeAnalyses(base?.analyses ?? null, local.analyses, remote.analyses),
    games: mergeGames(base?.games ?? null, local.games, remote.games),
  };
}

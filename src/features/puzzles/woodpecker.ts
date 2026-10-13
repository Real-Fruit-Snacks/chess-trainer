import type { PuzzleOutcome } from '@/store/progress';
import type { Puzzle } from './puzzleService';

/**
 * The Woodpecker method: a fixed set of puzzles solved again and again, each
 * cycle faster than the last, until the patterns are automatic. The set is
 * chosen once around the learner's level; every cycle records its time and
 * accuracy so the improvement is visible.
 */
export const WOODPECKER_SIZES = [50, 100, 200] as const;
export type WoodpeckerSize = (typeof WOODPECKER_SIZES)[number];

export interface WoodpeckerCycle {
  startedAt: number;
  finishedAt: number;
  solved: number;
  failed: number;
  timeMs: number;
}

export interface WoodpeckerProgress {
  /** 1-based cycle number. */
  cycle: number;
  /** Index of the next puzzle to solve. */
  index: number;
  startedAt: number;
  solved: number;
  failed: number;
  timeMs: number;
}

export interface WoodpeckerSet {
  id: string;
  createdAt: number;
  /** Rating the set was built around. */
  rating: number;
  puzzleIds: string[];
  cycles: WoodpeckerCycle[];
  current: WoodpeckerProgress | null;
}

/** Cycles come back after 1, 2, 4, 7, 14, 21 days — more time as the patterns settle. */
const CYCLE_GAP_DAYS = [1, 2, 4, 7, 14, 21];
export const WOODPECKER_TARGET_CYCLES = 7;

/** A set's puzzles come from within this many points of its rating whenever the pool allows. */
export const WOODPECKER_NEAR = 250;

/**
 * Picks `size` puzzles around the rating (±250 first, widening as needed),
 * unseen ones first, then anything. Deterministic given the input order plus
 * the random source.
 */
export function buildWoodpeckerSet(
  pool: Puzzle[],
  size: number,
  rating: number,
  seen: Record<string, PuzzleOutcome>,
  random: () => number = Math.random,
): string[] {
  const shuffle = <T>(items: T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a !== undefined && b !== undefined) {
        out[i] = b;
        out[j] = a;
      }
    }
    return out;
  };
  const chosen: string[] = [];
  const taken = new Set<string>();
  for (const window of [WOODPECKER_NEAR, 400, 700, 4000]) {
    const inRange = pool.filter((p) => Math.abs(p.rating - rating) <= window && !taken.has(p.id));
    const unseen = shuffle(inRange.filter((p) => !(p.id in seen)));
    const rest = shuffle(inRange.filter((p) => p.id in seen));
    for (const p of [...unseen, ...rest]) {
      if (chosen.length >= size) break;
      chosen.push(p.id);
      taken.add(p.id);
    }
    if (chosen.length >= size) break;
  }
  return chosen;
}

export function startWoodpeckerCycle(set: WoodpeckerSet, now = Date.now()): WoodpeckerSet {
  if (set.current) return set;
  return {
    ...set,
    current: {
      cycle: set.cycles.length + 1,
      index: 0,
      startedAt: now,
      solved: 0,
      failed: 0,
      timeMs: 0,
    },
  };
}

/** Records one attempt; finishes the cycle when the last puzzle is done. */
export function recordWoodpecker(
  set: WoodpeckerSet,
  outcome: PuzzleOutcome,
  durationMs: number,
  now = Date.now(),
): WoodpeckerSet {
  const current = set.current;
  if (!current) return set;
  const next: WoodpeckerProgress = {
    ...current,
    index: current.index + 1,
    solved: current.solved + (outcome === 'solved' ? 1 : 0),
    failed: current.failed + (outcome === 'failed' ? 1 : 0),
    timeMs: current.timeMs + Math.max(0, durationMs),
  };
  if (next.index >= set.puzzleIds.length) {
    return {
      ...set,
      current: null,
      cycles: [
        ...set.cycles,
        {
          startedAt: current.startedAt,
          finishedAt: now,
          solved: next.solved,
          failed: next.failed,
          timeMs: next.timeMs,
        },
      ],
    };
  }
  return { ...set, current: next };
}

/** When the next cycle is due (null before the first cycle or once the set is done). */
export function nextCycleDue(set: WoodpeckerSet): number | null {
  const last = set.cycles[set.cycles.length - 1];
  if (!last || set.cycles.length >= WOODPECKER_TARGET_CYCLES) return null;
  const gap = CYCLE_GAP_DAYS[Math.min(set.cycles.length - 1, CYCLE_GAP_DAYS.length - 1)] ?? 21;
  return last.finishedAt + gap * 86_400_000;
}

export interface CycleStats {
  cycle: number;
  accuracy: number;
  /** Seconds per puzzle. */
  pace: number;
  minutes: number;
}

export function cycleStats(set: WoodpeckerSet): CycleStats[] {
  return set.cycles.map((c, i) => {
    const total = c.solved + c.failed;
    return {
      cycle: i + 1,
      accuracy: total ? Math.round((c.solved / total) * 100) : 0,
      pace: total ? Math.round((c.timeMs / total / 1000) * 10) / 10 : 0,
      minutes: Math.round(c.timeMs / 60_000),
    };
  });
}

/** "Cycle 3 was 40 % faster than cycle 1 with 92 % accuracy." */
export function describeImprovement(set: WoodpeckerSet): string | null {
  const stats = cycleStats(set);
  const first = stats[0];
  const last = stats[stats.length - 1];
  if (!first || !last || stats.length < 2) return null;
  const faster = first.pace > 0 ? Math.round((1 - last.pace / first.pace) * 100) : 0;
  return `Cycle ${last.cycle} was ${faster >= 0 ? `${faster}% faster` : `${-faster}% slower`} than cycle 1, with ${last.accuracy}% accuracy (cycle 1: ${first.accuracy}%).`;
}

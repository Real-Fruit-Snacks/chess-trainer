import type { DrillResult } from '@/store/progress';
import { DRILL_GROUPS, type DrillGroup, ENDGAME_DRILLS, type EndgameDrill } from './endgameDrills';

/**
 * The endgame ladder: every drill in the library is a rung, ordered from the
 * elementary mates and pawn races up to Vancura and Réti. A rung is climbed
 * once the drill has been completed (won, or held) at least once.
 */
export interface LadderRung {
  rung: number;
  drill: EndgameDrill;
  done: boolean;
  attempts: number;
}

export interface GroupProgress {
  group: DrillGroup;
  done: number;
  total: number;
}

export interface EndgameLadder {
  rungs: LadderRung[];
  done: number;
  total: number;
  /** The lowest rung not yet climbed, or null when the ladder is complete. */
  next: LadderRung | null;
  groups: GroupProgress[];
}

/** Drills in ladder order: by difficulty, then by group, then as listed. */
export function ladderOrder(): EndgameDrill[] {
  return [...ENDGAME_DRILLS].sort(
    (a, b) =>
      a.difficulty - b.difficulty || DRILL_GROUPS.indexOf(a.group) - DRILL_GROUPS.indexOf(b.group),
  );
}

export function buildEndgameLadder(results: Record<string, DrillResult>): EndgameLadder {
  const rungs = ladderOrder().map((drill, i) => {
    const result = results[drill.id];
    return {
      rung: i + 1,
      drill,
      done: (result?.best ?? 0) > 0,
      attempts: result?.attempts ?? 0,
    };
  });
  const groups = DRILL_GROUPS.map((group) => {
    const own = rungs.filter((r) => r.drill.group === group);
    return { group, done: own.filter((r) => r.done).length, total: own.length };
  });
  return {
    rungs,
    done: rungs.filter((r) => r.done).length,
    total: rungs.length,
    next: rungs.find((r) => !r.done) ?? null,
    groups,
  };
}

/** "Rung 7 of 41" for the header, "complete" once every rung is climbed. */
export function describeLadder(ladder: EndgameLadder): string {
  if (ladder.done === ladder.total) return `All ${ladder.total} rungs climbed`;
  return `${ladder.done} of ${ladder.total} rungs climbed`;
}

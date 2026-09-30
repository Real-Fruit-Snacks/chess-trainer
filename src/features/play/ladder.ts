import { ENGINE_LEVELS, type EngineLevel } from '@/engine/levels';
import { outcomeFor } from '@/features/games/gameStats';
import type { GameRecord } from '@/store/progress';

/**
 * The engine ladder: the eight engine levels as rungs. A rung is climbed by
 * winning a game at that level from the initial position; the ladder then
 * points at the next level up, and back down again after a run of losses.
 */
export type RungStatus = 'climbed' | 'current' | 'above';

export interface EngineRung {
  level: EngineLevel;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  status: RungStatus;
}

export interface EngineLadder {
  rungs: EngineRung[];
  /** Highest level beaten so far (0 before the first win). */
  height: number;
  /** The level to play next. */
  next: EngineLevel;
  /** Why that level: one sentence for the card. */
  reason: string;
  /** True once the top rung has been climbed. */
  complete: boolean;
}

/** Games that count: against the engine, from the initial position. */
export function ladderGames(games: readonly GameRecord[]): GameRecord[] {
  return games.filter((g) => !g.pgn.includes('[FEN "') && !g.pgn.includes('[SetUp "1"]'));
}

const SLIP_LOSSES = 3;

export function buildEngineLadder(games: readonly GameRecord[]): EngineLadder {
  const counted = ladderGames(games);
  const rows = new Map<number, { games: number; wins: number; draws: number; losses: number }>();
  for (const level of ENGINE_LEVELS) rows.set(level.id, { games: 0, wins: 0, draws: 0, losses: 0 });
  for (const game of counted) {
    const row = rows.get(game.level);
    if (!row) continue;
    row.games += 1;
    const outcome = outcomeFor(game.result, game.color);
    if (outcome === 'win') row.wins += 1;
    else if (outcome === 'draw') row.draws += 1;
    else if (outcome === 'loss') row.losses += 1;
  }
  const height = Math.max(
    0,
    ...[...rows.entries()].filter(([, r]) => r.wins > 0).map(([id]) => id),
  );
  const top = ENGINE_LEVELS[ENGINE_LEVELS.length - 1] as EngineLevel;
  const complete = height >= top.id;
  let next = complete ? top : (ENGINE_LEVELS.find((l) => l.id === height + 1) ?? top);
  let reason: string;
  const nextRow = rows.get(next.id) ?? { games: 0, wins: 0, draws: 0, losses: 0 };
  // Three straight losses at the next rung: step down for a game to rebuild, then come back.
  const recentAtNext = counted
    .filter((g) => g.level === next.id)
    .slice(0, SLIP_LOSSES)
    .map((g) => outcomeFor(g.result, g.color));
  const slipped =
    !complete &&
    recentAtNext.length === SLIP_LOSSES &&
    recentAtNext.every((o) => o === 'loss') &&
    next.id > 1;
  if (complete) {
    reason = `You have beaten every level — Level ${top.id} (${top.name}) is the top of the ladder.`;
  } else if (slipped) {
    const lower = ENGINE_LEVELS.find((l) => l.id === next.id - 1) ?? next;
    reason = `Three losses in a row at Level ${next.id} — a game at Level ${lower.id} (${lower.name}) rebuilds the rhythm before you go back up.`;
    next = lower;
  } else if (nextRow.games === 0) {
    reason =
      height === 0
        ? `Beat Level ${next.id} (${next.name}) once to climb the first rung.`
        : `Level ${height} is beaten — win once at Level ${next.id} (${next.name}) to climb.`;
  } else {
    reason = `${nextRow.wins}–${nextRow.draws}–${nextRow.losses} so far at Level ${next.id} (${next.name}) — one win takes the rung.`;
  }
  const rungs: EngineRung[] = ENGINE_LEVELS.map((level) => {
    const row = rows.get(level.id) ?? { games: 0, wins: 0, draws: 0, losses: 0 };
    const status: RungStatus =
      row.wins > 0 ? 'climbed' : level.id === next.id ? 'current' : 'above';
    return { level, ...row, status };
  });
  return { rungs, height, next, reason, complete };
}

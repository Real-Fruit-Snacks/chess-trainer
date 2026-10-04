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

/** Games that count: ordinary games against the engine, from the initial position. */
export function ladderGames(games: readonly GameRecord[]): GameRecord[] {
  return games.filter(
    (g) =>
      (g.source === 'play' || g.source === 'ladder' || g.source === 'book') &&
      !g.pgn.includes('[FEN "') &&
      !g.pgn.includes('[SetUp "1"]'),
  );
}

/** Describes a rung for assistive technology: level, name, status and the record there. */
export function describeRung(rung: EngineRung): string {
  const status =
    rung.status === 'climbed' ? 'climbed' : rung.status === 'current' ? 'next to climb' : 'not yet';
  const record =
    rung.games === 0
      ? 'no games yet'
      : `${rung.wins} win${rung.wins === 1 ? '' : 's'}, ${rung.draws} draw${rung.draws === 1 ? '' : 's'}, ${rung.losses} loss${rung.losses === 1 ? '' : 'es'}`;
  return `Level ${rung.level.id} · ${rung.level.name}: ${status}, ${record}`;
}

const SLIP_LOSSES = 3;

/**
 * Builds the ladder from the recorded games (newest first). `knownHeight` is
 * the highest level ever beaten as remembered by the progress store, so rungs
 * climbed long ago survive the capped game list.
 */
export function buildEngineLadder(games: readonly GameRecord[], knownHeight = 0): EngineLadder {
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
    Math.min(Math.floor(knownHeight) || 0, ENGINE_LEVELS.length),
    ...[...rows.entries()].filter(([, r]) => r.wins > 0).map(([id]) => id),
  );
  const top = ENGINE_LEVELS[ENGINE_LEVELS.length - 1] as EngineLevel;
  const complete = height >= top.id;
  let next = complete ? top : (ENGINE_LEVELS.find((l) => l.id === height + 1) ?? top);
  let reason: string;
  const nextRow = rows.get(next.id) ?? { games: 0, wins: 0, draws: 0, losses: 0 };
  // Three straight losses at the next rung: step down for a game to rebuild, then come back.
  // One game at the lower rung clears the slip, so only losses since then count.
  const lowerPlayed = counted.findIndex((g) => g.level === next.id - 1);
  const sinceLower = lowerPlayed === -1 ? counted : counted.slice(0, lowerPlayed);
  const recentAtNext = sinceLower
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
      row.wins > 0 || level.id <= height ? 'climbed' : level.id === next.id ? 'current' : 'above';
    return { level, ...row, status };
  });
  return { rungs, height, next, reason, complete };
}

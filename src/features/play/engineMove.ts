import type { Square } from 'chess.js';
import type { Fen, Uci } from '@/chess/types';
import type { EngineClient } from '@/engine/EngineClient';
import { type EngineLevel, pickWeighted } from '@/engine/levels';
import { pickRandom } from '@/lib/random';

/** Remembers which Skill Level the engine was last told, so it is only sent when it changes. */
export interface SkillCache {
  skill: number | null;
}

export async function ensureSkill(
  client: EngineClient,
  cache: SkillCache,
  skill: number,
): Promise<void> {
  if (cache.skill === skill) return;
  await client.setOption('Skill Level', skill);
  cache.skill = skill;
}

export interface LevelMoveRequest {
  level: EngineLevel;
  fen: Fen;
  /** Moves played after `fen`, so the engine keeps the repetition history. */
  moves: Uci[];
  /** Legal destinations in the current position (for the random-move chance). */
  legal: Map<Square, Square[]>;
  /** The piece on a square, for promotions of random moves. */
  pieceAt: (square: Square) => { type: string } | null | undefined;
  /** Overrides of the level's own search limits (e.g. when short of time). */
  depth?: number;
  movetime?: number;
}

/**
 * Picks the engine's move at a playing level: Stockfish's Skill Level, a
 * shallow search sampled from several candidates for the weakest presets, and
 * occasionally a random legal move. Returns null when the search was stopped.
 */
export async function chooseLevelMove(
  client: EngineClient,
  cache: SkillCache,
  request: LevelMoveRequest,
): Promise<Uci | null> {
  const { level, legal } = request;
  await ensureSkill(client, cache, level.skill);
  if (level.randomMoveChance > 0 && Math.random() < level.randomMoveChance) {
    const from = pickRandom([...legal.keys()]);
    const to = from ? pickRandom(legal.get(from) ?? []) : undefined;
    if (from && to) {
      const piece = request.pieceAt(from);
      const promo = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : '';
      return `${from}${to}${promo}`;
    }
  }
  const depth = 'depth' in request ? request.depth : level.depth;
  const movetime = 'movetime' in request ? request.movetime : level.movetime;
  const result = await client.search({
    fen: request.fen,
    moves: request.moves,
    depth,
    movetime,
    multipv: level.multipv,
  }).result;
  if (result.stopped) return null;
  if (level.multipv > 1 && result.lines.size > 1) {
    const ranked = [...result.lines.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, info]) => info.pv[0])
      .filter((m): m is Uci => !!m);
    return pickWeighted(ranked) ?? result.bestmove.move;
  }
  return result.bestmove.move;
}

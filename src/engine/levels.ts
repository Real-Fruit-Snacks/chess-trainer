/**
 * Playing-strength presets for games against the engine.
 *
 * Stockfish's own `Skill Level` only goes down to roughly club level, so the
 * lowest presets additionally pick from several candidate moves at shallow
 * depth (and occasionally a random legal move) to produce a genuinely
 * beatable opponent for people who have just learned the rules.
 */
export interface EngineLevel {
  id: number;
  name: string;
  /** Rough human-equivalent rating, for display only. */
  approxElo: number;
  description: string;
  /** Stockfish `Skill Level` (0–20). */
  skill: number;
  /** Fixed search depth, or undefined to use `movetime`. */
  depth?: number;
  /** Time per move in milliseconds when `depth` is not set. */
  movetime?: number;
  /** Number of candidate lines to sample from. 1 = always the best move. */
  multipv: number;
  /** Probability of playing a uniformly random legal move instead. */
  randomMoveChance: number;
}

export const ENGINE_LEVELS: readonly EngineLevel[] = [
  {
    id: 1,
    name: 'Newcomer',
    approxElo: 400,
    description: 'Just learned the rules? Start here. Makes frequent mistakes.',
    skill: 0,
    depth: 1,
    multipv: 8,
    randomMoveChance: 0.25,
  },
  {
    id: 2,
    name: 'Beginner',
    approxElo: 700,
    description: 'Spots one-move threats but misses most tactics.',
    skill: 0,
    depth: 2,
    multipv: 5,
    randomMoveChance: 0.1,
  },
  {
    id: 3,
    name: 'Casual',
    approxElo: 1000,
    description: 'Plays sensible moves; still drops pieces to simple combinations.',
    skill: 2,
    depth: 4,
    multipv: 3,
    randomMoveChance: 0.03,
  },
  {
    id: 4,
    name: 'Club',
    approxElo: 1300,
    description: 'Solid club-level play. Punishes obvious blunders.',
    skill: 5,
    depth: 6,
    multipv: 1,
    randomMoveChance: 0,
  },
  {
    id: 5,
    name: 'Intermediate',
    approxElo: 1600,
    description: 'Sees two-move tactics and plays purposeful openings.',
    skill: 9,
    movetime: 400,
    multipv: 1,
    randomMoveChance: 0,
  },
  {
    id: 6,
    name: 'Advanced',
    approxElo: 1900,
    description: 'A strong tournament player. Few tactical oversights.',
    skill: 13,
    movetime: 600,
    multipv: 1,
    randomMoveChance: 0,
  },
  {
    id: 7,
    name: 'Expert',
    approxElo: 2200,
    description: 'Expert strength — expect precise, punishing play.',
    skill: 17,
    movetime: 900,
    multipv: 1,
    randomMoveChance: 0,
  },
  {
    id: 8,
    name: 'Master',
    approxElo: 2600,
    description: 'Full strength at a short think. Good luck.',
    skill: 20,
    movetime: 1500,
    multipv: 1,
    randomMoveChance: 0,
  },
];

export const DEFAULT_LEVEL_ID = 3;

export function getLevel(id: number): EngineLevel {
  return (
    ENGINE_LEVELS.find((l) => l.id === id) ??
    ENGINE_LEVELS.find((l) => l.id === DEFAULT_LEVEL_ID) ??
    (ENGINE_LEVELS[0] as EngineLevel)
  );
}

/**
 * Chooses among ranked candidate moves with a bias toward the better ones:
 * the i-th best move has weight (n - i)^2, so the top move is most likely but
 * weaker alternatives are still played regularly.
 */
export function pickWeighted<T>(ranked: T[], random: () => number = Math.random): T | undefined {
  const n = ranked.length;
  if (n === 0) return undefined;
  if (n === 1) return ranked[0];
  const weights = ranked.map((_, i) => (n - i) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < n; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return ranked[i];
  }
  return ranked[n - 1];
}

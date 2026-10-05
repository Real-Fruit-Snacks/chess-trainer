import { Chess } from 'chess.js';
import { GameTree, type TreeNode } from '@/chess/tree';
import type { Fen, LongColor, San } from '@/chess/types';
import type { ImportedGame } from '@/lib/gameImport';
import { displayOpeningName, findOpening, type Opening } from '@/lib/openings';

export type GameOutcome = 'win' | 'draw' | 'loss';

/** Which side the learner played, by name (case-insensitive), or null when unknown. */
export function learnerColor(
  game: Pick<ImportedGame, 'white' | 'black'>,
  player: string,
): LongColor | null {
  const me = player.trim().toLowerCase();
  if (!me) return null;
  if (game.white.trim().toLowerCase() === me) return 'white';
  if (game.black.trim().toLowerCase() === me) return 'black';
  return null;
}

/**
 * Which side the learner played in a game, from its PGN headers: "You" in
 * games against the engine, otherwise the name they import their games under.
 * Null when it cannot be told.
 */
export function learnerSideOf(headers: Record<string, string>, player: string): LongColor | null {
  const white = headers.White?.trim() ?? '';
  const black = headers.Black?.trim() ?? '';
  if (white === 'You' && black !== 'You') return 'white';
  if (black === 'You' && white !== 'You') return 'black';
  return learnerColor({ white, black }, player);
}

/** The result from one side's point of view; null for unfinished games. */
export function outcomeFor(result: string, color: LongColor): GameOutcome | null {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return color === 'white' ? 'win' : 'loss';
  if (result === '0-1') return color === 'black' ? 'win' : 'loss';
  return null;
}

export interface MainLineOfPgn {
  fens: Fen[];
  sans: San[];
  startFen: Fen;
}

/** Parsed main lines by PGN text: My games holds a few hundred games and re-reads them on every render. */
const LINE_CACHE_SIZE = 512;
const lineCache = new Map<string, MainLineOfPgn | null>();

/**
 * The main line of a PGN as positions (fens[0] = start) and SAN moves; null
 * when it does not parse. Memoised per PGN string, so callers must not mutate
 * the result.
 */
export function mainLineOfPgn(pgn: string): MainLineOfPgn | null {
  const hit = lineCache.get(pgn);
  if (hit !== undefined) {
    lineCache.delete(pgn);
    lineCache.set(pgn, hit);
    return hit;
  }
  let line: MainLineOfPgn | null;
  try {
    const tree = GameTree.fromPgn(pgn);
    const nodes: TreeNode[] = tree.mainLine();
    line = {
      startFen: tree.startFen,
      fens: [tree.startFen, ...nodes.map((n) => n.fen)],
      sans: nodes.map((n) => n.san),
    };
  } catch {
    line = null;
  }
  lineCache.set(pgn, line);
  if (lineCache.size > LINE_CACHE_SIZE) {
    const oldest = lineCache.keys().next().value;
    if (oldest !== undefined) lineCache.delete(oldest);
  }
  return line;
}

/** chess.js Move objects for a main line, for the game review. */
export function movesOfLine(startFen: Fen, sans: San[]) {
  const chess = new Chess(startFen);
  return sans.map((san) => chess.move(san));
}

export interface OpeningRow {
  key: string;
  eco: string;
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Points per game, 0–1. */
  score: number;
  gameIds: string[];
}

export interface OpeningStats {
  white: OpeningRow[];
  black: OpeningRow[];
  /** Games where the learner's name did not appear. */
  unknown: number;
}

const MAX_OPENING_PLIES = 24;

/**
 * Groups the learner's games by opening (deepest ECO match within the first
 * twelve moves) for each colour, most played first.
 */
export function openingStats(
  games: ImportedGame[],
  player: string,
  table: Parameters<typeof findOpening>[0],
): OpeningStats {
  const rows: Record<LongColor, Map<string, OpeningRow>> = { white: new Map(), black: new Map() };
  let unknown = 0;
  for (const game of games) {
    const color = learnerColor(game, player);
    if (!color) {
      unknown++;
      continue;
    }
    const line = mainLineOfPgn(game.pgn);
    if (!line) continue;
    const opening: Opening = findOpening(table, line.fens.slice(0, MAX_OPENING_PLIES + 1)) ?? {
      eco: '—',
      name: 'Unknown opening',
    };
    // Group by the opening family (the part before the colon) so lines add up.
    const family = opening.name.split(':')[0]?.trim() ?? opening.name;
    const key = `${opening.eco.slice(0, 1)}:${family}`;
    const row = rows[color].get(key) ?? {
      key,
      eco: opening.eco,
      name: displayOpeningName(family),
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      score: 0,
      gameIds: [],
    };
    row.games++;
    row.gameIds.push(game.id);
    const outcome = outcomeFor(game.result, color);
    if (outcome === 'win') row.wins++;
    else if (outcome === 'draw') row.draws++;
    else if (outcome === 'loss') row.losses++;
    rows[color].set(key, row);
  }
  const finish = (map: Map<string, OpeningRow>) =>
    [...map.values()]
      .map((r) => {
        const decided = r.wins + r.draws + r.losses;
        return { ...r, score: decided ? (r.wins + r.draws / 2) / decided : 0 };
      })
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
  return { white: finish(rows.white), black: finish(rows.black), unknown };
}

/** Overall results for the learner across all games. */
export function resultSummary(
  games: ImportedGame[],
  player: string,
): { games: number; wins: number; draws: number; losses: number; unknown: number } {
  const out = { games: 0, wins: 0, draws: 0, losses: 0, unknown: 0 };
  for (const game of games) {
    const color = learnerColor(game, player);
    if (!color) {
      out.unknown++;
      continue;
    }
    out.games++;
    const outcome = outcomeFor(game.result, color);
    if (outcome === 'win') out.wins++;
    else if (outcome === 'draw') out.draws++;
    else if (outcome === 'loss') out.losses++;
  }
  return out;
}

/** The most frequent player name across the games: a good guess for "you". */
export function guessPlayer(games: Pick<ImportedGame, 'white' | 'black'>[]): string {
  const counts = new Map<string, number>();
  for (const game of games) {
    for (const name of [game.white, game.black]) {
      const key = name.trim();
      if (!key || key === '?') continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

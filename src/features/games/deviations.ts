import { type GameTree, parsePgnCached, type TreeNode } from '@/chess/tree';
import type { Fen, LongColor, San } from '@/chess/types';
import type { ImportedGame } from '@/lib/gameImport';
import { learnerColor, mainLineOfPgn } from './gameStats';

/** The position without move counters: two transpositions reach the same EPD. */
export function epd(fen: Fen): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export interface RepertoireLike {
  id: string;
  name: string;
  color: LongColor;
  pgn: string;
}

export interface Deviation {
  gameId: string;
  repertoireId: string;
  repertoireName: string;
  /** 1-based half-move at which the learner left the repertoire. */
  ply: number;
  /** Position before the learner's move. */
  fen: Fen;
  played: San;
  /** The repertoire's main recommendation and any alternatives it also covers. */
  recommended: San;
  alternatives: San[];
}

export interface GameCoverage {
  gameId: string;
  repertoireId: string;
  repertoireName: string;
  /** How the game and the repertoire parted ways. */
  status: 'deviated' | 'opponent-left' | 'in-book';
  /** Half-moves the game stayed inside the repertoire. */
  depth: number;
  deviation: Deviation | null;
}

export interface DeviationReport {
  coverage: GameCoverage[];
  deviations: Deviation[];
  /** Games where the learner's colour has no repertoire that matches the first move. */
  uncovered: number;
  /** Games where the learner could not be identified. */
  unknown: number;
}

interface Walk {
  status: GameCoverage['status'];
  depth: number;
  deviation: Deviation | null;
}

/** Every position of a tree by EPD (the main-line node wins when two reach the same one). */
function positionIndex(tree: GameTree): Map<string, TreeNode> {
  const index = new Map<string, TreeNode>();
  const visit = (node: TreeNode) => {
    for (const child of node.children) {
      const key = epd(child.fen);
      if (!index.has(key)) index.set(key, child);
      visit(child);
    }
  };
  visit(tree.root);
  return index;
}

/**
 * Follows one game through one repertoire tree until they part ways. Moves are
 * matched by the position they reach, so a transposition into a book line
 * counts as staying in the book.
 */
function walk(
  line: { fens: Fen[]; sans: San[] },
  tree: GameTree,
  index: Map<string, TreeNode>,
  repertoire: RepertoireLike,
  gameId: string,
): Walk {
  let cursor: TreeNode = tree.root;
  for (let i = 0; i < line.sans.length; i++) {
    const san = line.sans[i];
    const fen = line.fens[i];
    const reached = line.fens[i + 1];
    if (san === undefined || fen === undefined || reached === undefined) break;
    if (cursor.children.length === 0) return { status: 'in-book', depth: i, deviation: null };
    const learnerMove = (i % 2 === 0 ? 'white' : 'black') === repertoire.color;
    const target = epd(reached);
    // The same position anywhere in the book (a transposition) keeps the game in it.
    const match = cursor.children.find((c) => epd(c.fen) === target) ?? index.get(target);
    if (match) {
      cursor = match;
      continue;
    }
    // A different move order that is back in the book within a move is a transposition too.
    const rejoin = [i + 1, i + 2]
      .map((j) => ({ j, node: line.fens[j + 1] ? index.get(epd(line.fens[j + 1] ?? '')) : null }))
      .find((r) => r.node);
    if (rejoin?.node) {
      cursor = rejoin.node;
      i = rejoin.j;
      continue;
    }
    if (!learnerMove) return { status: 'opponent-left', depth: i, deviation: null };
    const [main, ...rest] = cursor.children;
    return {
      status: 'deviated',
      depth: i,
      deviation: {
        gameId,
        repertoireId: repertoire.id,
        repertoireName: repertoire.name,
        ply: i + 1,
        fen,
        played: san,
        recommended: main?.san ?? '',
        alternatives: rest.map((c) => c.san),
      },
    };
  }
  return { status: 'in-book', depth: line.sans.length, deviation: null };
}

/**
 * Compares the learner's games with their repertoires: for each game the
 * best-matching repertoire of the learner's colour is followed move by move,
 * and the first learner move outside it is reported as a deviation.
 */
export function repertoireDeviations(
  games: ImportedGame[],
  player: string,
  repertoires: RepertoireLike[],
): DeviationReport {
  const trees = new Map<string, { tree: GameTree; index: Map<string, TreeNode> }>();
  for (const rep of repertoires) {
    try {
      const tree = parsePgnCached(rep.pgn);
      trees.set(rep.id, { tree, index: positionIndex(tree) });
    } catch {
      // A broken custom repertoire is simply skipped.
    }
  }
  const coverage: GameCoverage[] = [];
  let uncovered = 0;
  let unknown = 0;
  for (const game of games) {
    const color = learnerColor(game, player);
    if (!color) {
      unknown++;
      continue;
    }
    const line = mainLineOfPgn(game.pgn);
    if (!line || line.sans.length === 0) continue;
    let best: (Walk & { repertoire: RepertoireLike }) | null = null;
    for (const rep of repertoires) {
      if (rep.color !== color) continue;
      const entry = trees.get(rep.id);
      if (!entry) continue;
      const result = walk(line, entry.tree, entry.index, rep, game.id);
      // A repertoire that never matched the first move does not cover the game — whether
      // the learner (as White) or the opponent (against a Black repertoire) played it.
      if (result.depth === 0) continue;
      if (!best || result.depth > best.depth) best = { ...result, repertoire: rep };
    }
    if (!best) {
      uncovered++;
      continue;
    }
    coverage.push({
      gameId: game.id,
      repertoireId: best.repertoire.id,
      repertoireName: best.repertoire.name,
      status: best.status,
      depth: best.depth,
      deviation: best.deviation,
    });
  }
  return {
    coverage,
    deviations: coverage.flatMap((c) => (c.deviation ? [c.deviation] : [])),
    uncovered,
    unknown,
  };
}

/** Groups deviations by position so a repeated mistake shows once, with a count. */
export function groupDeviations(
  deviations: Deviation[],
): (Deviation & { count: number; gameIds: string[] })[] {
  const groups = new Map<string, Deviation & { count: number; gameIds: string[] }>();
  for (const d of deviations) {
    const key = `${d.repertoireId}|${d.fen}|${d.played}`;
    const group = groups.get(key);
    if (group) {
      group.count++;
      group.gameIds.push(d.gameId);
    } else {
      groups.set(key, { ...d, count: 1, gameIds: [d.gameId] });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.ply - b.ply);
}

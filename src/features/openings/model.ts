import type { GameTree, TreeNode } from '@/chess/tree';
import type { LongColor } from '@/chess/types';
import { isDue, isNew, type SrsCard } from '@/lib/srs';

/** Every root-to-leaf line of the tree (each entry excludes the root). */
export function repertoireLines(tree: GameTree): TreeNode[][] {
  const lines: TreeNode[][] = [];
  const walk = (node: TreeNode, path: TreeNode[]) => {
    if (node.children.length === 0) {
      if (path.length) lines.push(path);
      return;
    }
    for (const child of node.children) walk(child, [...path, child]);
  };
  walk(tree.root, []);
  return lines;
}

/** Whether a node is a move played by the learner's side. */
export function isLearnerMove(node: TreeNode, color: LongColor): boolean {
  // The parent's FEN says who is to move.
  const turn = node.parent?.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  return turn === color;
}

/** Stable key for a move card: the UCI path from the root. */
export function cardKey(node: TreeNode): string {
  const parts: string[] = [];
  let cursor: TreeNode | null = node;
  while (cursor?.parent) {
    parts.unshift(cursor.uci);
    cursor = cursor.parent;
  }
  return parts.join(' ');
}

export interface RepertoireStats {
  /** Learner moves in the repertoire. */
  total: number;
  /** Learned moves that are due for review. */
  due: number;
  /** Moves never studied. */
  fresh: number;
  learned: number;
}

export function repertoireStats(
  tree: GameTree,
  color: LongColor,
  cards: Record<string, SrsCard>,
  now: number,
): RepertoireStats {
  const stats: RepertoireStats = { total: 0, due: 0, fresh: 0, learned: 0 };
  const walk = (node: TreeNode) => {
    for (const child of node.children) {
      if (isLearnerMove(child, color)) {
        stats.total++;
        const card = cards[cardKey(child)];
        if (isNew(card)) stats.fresh++;
        else {
          stats.learned++;
          if (isDue(card, now)) stats.due++;
        }
      }
      walk(child);
    }
  };
  walk(tree.root);
  return stats;
}

/**
 * Picks the next line to train: the one with the most due learner moves,
 * breaking ties at random. Returns null when `dueOnly` and nothing is due.
 */
export function pickLine(
  lines: TreeNode[][],
  color: LongColor,
  cards: Record<string, SrsCard>,
  now: number,
  options: { dueOnly?: boolean; exclude?: TreeNode[] | null; random?: () => number } = {},
): TreeNode[] | null {
  const random = options.random ?? Math.random;
  let best: { line: TreeNode[]; due: number; soonest: number }[] = [];
  for (const line of lines) {
    if (options.exclude && line === options.exclude) continue;
    let due = 0;
    let soonest = Infinity;
    for (const node of line) {
      if (!isLearnerMove(node, color)) continue;
      const card = cards[cardKey(node)];
      if (isDue(card, now)) due++;
      soonest = Math.min(soonest, card?.due ?? now);
    }
    best.push({ line, due, soonest });
  }
  if (best.length === 0) return null;
  const maxDue = Math.max(...best.map((b) => b.due));
  if (maxDue === 0) {
    if (options.dueOnly) return null;
    // Nothing due: practise whatever comes due soonest.
    const soonest = Math.min(...best.map((b) => b.soonest));
    best = best.filter((b) => b.soonest === soonest);
  } else {
    best = best.filter((b) => b.due === maxDue);
  }
  const choice = best[Math.floor(random() * best.length)];
  return choice?.line ?? null;
}

import { GameTree } from '@/chess/tree';
import type { San } from '@/chess/types';

/**
 * Adds a line of moves (SAN, from the initial position) to a repertoire's PGN,
 * reusing the moves already there and adding the rest as a variation. Returns
 * the new PGN and how many moves were new; an illegal line throws.
 */
export function mergeLineIntoPgn(
  pgn: string,
  line: readonly San[],
): { pgn: string; added: number } {
  const tree = pgn.trim() ? GameTree.fromPgn(pgn) : new GameTree();
  tree.goStart();
  let added = 0;
  for (const san of line) {
    const existing = tree.current.children.find((c) => c.san === san);
    if (existing) {
      tree.goTo(existing);
      continue;
    }
    const node = tree.addMove(san, { navigate: true });
    if (!node) throw new Error(`Illegal move ${san} in the line`);
    added += 1;
  }
  return { pgn: tree.toPgn(), added };
}

/** The SAN moves of the main line of a PGN (for "add this line" from the analysis board). */
export function lineOf(tree: GameTree, node = tree.current): San[] {
  return tree.pathTo(node).map((n) => n.san);
}

/** "1. e4 e5 2. Nf3 …" for a line of SAN moves from the starting position. */
export function describeLine(line: readonly San[]): string {
  const parts: string[] = [];
  line.forEach((san, i) => {
    if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
    parts.push(san);
  });
  return parts.join(' ');
}

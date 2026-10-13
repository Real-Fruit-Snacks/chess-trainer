import { describe, expect, it } from 'vitest';
import { GameTree } from '@/chess/tree';
import { cardKey, positionKey, transpositionTwins } from './model';

/** 1. d4 Nf6 2. c4 e6 3. Nc3 and 1. c4 e6 2. d4 Nf6 3. Nc3 reach the same position before Nc3. */
const TRANSPOSING = '1. d4 (1. c4 e6 2. d4 Nf6 3. Nc3) 1... Nf6 2. c4 e6 3. Nc3 *';

/** The node reached by a path of SAN moves from the root. */
function nodeAt(tree: GameTree, ...sans: string[]) {
  let node = tree.root;
  for (const san of sans) {
    const next = node.children.find((c) => c.san === san);
    if (!next) throw new Error(`no ${san}`);
    node = next;
  }
  return node;
}

describe('repertoire transpositions', () => {
  it('keys a position without its move counters', () => {
    expect(positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    );
  });

  it('finds the same move from the same position reached by another move order', () => {
    const tree = GameTree.fromPgn(TRANSPOSING);
    const main = nodeAt(tree, 'd4', 'Nf6', 'c4', 'e6', 'Nc3');
    const side = nodeAt(tree, 'c4', 'e6', 'd4', 'Nf6', 'Nc3');
    expect(cardKey(main)).not.toBe(cardKey(side));
    expect(transpositionTwins(tree, main)).toEqual([side]);
    expect(transpositionTwins(tree, side)).toEqual([main]);
  });

  it('does not pair the same move played from different positions', () => {
    const tree = GameTree.fromPgn(TRANSPOSING);
    // c4 after 1. d4 Nf6 and c4 as the first move: same move, different positions.
    expect(transpositionTwins(tree, nodeAt(tree, 'd4', 'Nf6', 'c4'))).toEqual([]);
    expect(transpositionTwins(tree, nodeAt(tree, 'c4'))).toEqual([]);
    expect(transpositionTwins(tree, tree.root)).toEqual([]);
  });
});

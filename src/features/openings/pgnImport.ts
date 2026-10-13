import { Chess } from 'chess.js';
import { tryMove } from '@/chess/helpers';
import { type PgnLine, parsePgn, splitPgnGames } from '@/chess/pgn';
import { GameTree, type TreeNode } from '@/chess/tree';

/**
 * Merges every game in a PGN file (each possibly with variations) into one
 * tree, so a study exported as several chapters becomes a single repertoire.
 * Comments are kept; the first game's headers are ignored on purpose.
 */
export function mergePgnGames(text: string): GameTree {
  const games = splitPgnGames(text);
  if (games.length === 0) throw new Error('No PGN games found.');
  const tree = new GameTree();
  for (const gameText of games) {
    const game = parsePgn(gameText);
    if (game.headers.FEN) throw new Error('Repertoires must start from the initial position.');
    addLine(tree, tree.root, game.moves);
  }
  return tree;
}

function addLine(tree: GameTree, parent: TreeNode, line: PgnLine): void {
  let cursor = parent;
  for (const entry of line) {
    const chess = new Chess(cursor.fen);
    const move = tryMove(chess, entry.san);
    if (!move) throw new Error(`Illegal move "${entry.san}" after ${cursor.san || 'the start'}.`);
    tree.goTo(cursor);
    const node = tree.addMove({ from: move.from, to: move.to, promotion: move.promotion as never });
    if (!node) throw new Error(`Could not add "${entry.san}".`);
    if (entry.comment && !node.comment) node.comment = entry.comment;
    for (const variation of entry.variations) addLine(tree, cursor, variation);
    cursor = node;
  }
  tree.goStart();
}

import type { Move } from 'chess.js';
import { GameTree, type TreeNode } from '@/chess/tree';
import type { LongColor, San } from '@/chess/types';
import { cardKey } from '@/features/openings/model';
import type { SrsCard } from '@/lib/srs';
import { pickRandom } from '@/lib/random';

/**
 * Opening practice: the opponent's moves come from a repertoire while the game
 * stays inside it, so the learner rehearses the lines against a live engine
 * that takes over once the book runs out. The book follows the game's move
 * list from the root every time (cheap, and take-backs come for free).
 */
export interface BookDeviation {
  /** Ply number of the move that left the book (1 = White's first move). */
  ply: number;
  played: San;
  /** The repertoire's moves in that position. */
  expected: San[];
  /** Card key of the first expected move, for the spaced-repetition lapse. */
  cardKey: string;
  /** FEN before the deviation. */
  fen: string;
}

export type BookStatus = 'in-book' | 'out-of-book' | 'deviated';

export interface BookState {
  repertoireId: string;
  name: string;
  /** Side the learner plays (the repertoire's colour). */
  color: LongColor;
  tree: GameTree;
  /** Node reached by the game's moves, or null once the game left the tree. */
  node: TreeNode | null;
  status: BookStatus;
  /** Ply after which the book stopped supplying moves (null while in book). */
  endedAtPly: number | null;
  deviation: BookDeviation | null;
}

export function createBook(rep: {
  id: string;
  name: string;
  color: LongColor;
  pgn: string;
}): BookState {
  const tree = GameTree.fromPgn(rep.pgn);
  return {
    repertoireId: rep.id,
    name: rep.name,
    color: rep.color,
    tree,
    node: tree.root,
    status: 'in-book',
    endedAtPly: null,
    deviation: null,
  };
}

/** Recomputes the book position from the whole game history. */
export function followBook(book: BookState, history: readonly Move[]): BookState {
  let node: TreeNode = book.tree.root;
  for (const [i, move] of history.entries()) {
    const ply = i + 1;
    const mover: LongColor = move.color === 'w' ? 'white' : 'black';
    const next = node.children.find((c) => c.san === move.san);
    if (next) {
      node = next;
      continue;
    }
    if (node.children.length === 0) {
      // The book simply ran out; whoever moved, the engine is playing now.
      return { ...book, node: null, status: 'out-of-book', endedAtPly: ply - 1, deviation: null };
    }
    if (mover === book.color) {
      const first = node.children[0];
      return {
        ...book,
        node: null,
        status: 'deviated',
        endedAtPly: ply - 1,
        deviation: {
          ply,
          played: move.san,
          expected: node.children.map((c) => c.san),
          cardKey: first ? cardKey(first) : '',
          fen: node.fen,
        },
      };
    }
    // The engine (or a random move) went off-book: nothing to blame the learner for.
    return { ...book, node: null, status: 'out-of-book', endedAtPly: ply - 1, deviation: null };
  }
  if (node.children.length === 0) {
    return { ...book, node, status: 'out-of-book', endedAtPly: history.length, deviation: null };
  }
  return { ...book, node, status: 'in-book', endedAtPly: null, deviation: null };
}

/**
 * The opponent's next book move, weighted towards lines whose next learner
 * move is least known (never studied counts most, then lapsed, then due).
 */
export function bookReply(
  book: BookState,
  cards: Record<string, SrsCard>,
  now = Date.now(),
  random: () => number = Math.random,
): San | null {
  const node = book.node;
  if (!node || book.status !== 'in-book' || node.children.length === 0) return null;
  const weighted = node.children.map((child) => {
    const learnerReplies = child.children;
    let weight = 1;
    for (const reply of learnerReplies) {
      const card = cards[cardKey(reply)];
      if (!card || card.reps === 0) weight += 3;
      else if (card.lapses > 0 && card.reps < 3) weight += 2;
      else if (card.due <= now) weight += 1;
    }
    return { san: child.san, weight };
  });
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.san;
  }
  return (
    pickRandom(
      weighted.map((w) => w.san),
      random,
    ) ?? null
  );
}

/** "Left the book at move 5 (…Nf6 instead of …Bc5)". */
export function describeDeviation(deviation: BookDeviation): string {
  const number = Math.ceil(deviation.ply / 2);
  const black = deviation.ply % 2 === 0;
  const prefix = black ? `${number}…` : `${number}.`;
  const expected = deviation.expected.join(' or ');
  return `Left the book at move ${number}: ${prefix} ${deviation.played} instead of ${expected}.`;
}

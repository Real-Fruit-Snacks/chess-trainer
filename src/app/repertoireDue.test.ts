import { describe, expect, it } from 'vitest';
import { GameTree, type TreeNode } from '@/chess/tree';
import { cardKey, isLearnerMove } from '@/features/openings/model';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { reviewCard, newCard, type SrsCard } from '@/lib/srs';
import { countRepertoireDue } from './repertoireDue';

const NOW = Date.UTC(2026, 9, 3, 12);
const DAY = 86_400_000;

/** The first `count` learner moves of a repertoire, depth first. */
function learnerMoves(pgn: string, color: 'white' | 'black', count: number): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (node: TreeNode) => {
    for (const child of node.children) {
      if (out.length >= count) return;
      if (isLearnerMove(child, color)) out.push(child);
      walk(child);
    }
  };
  walk(GameTree.fromPgn(pgn).root);
  return out;
}

/** A card that was learned and came due `daysAgo` days ago. */
function learnedCard(daysAgo: number): SrsCard {
  return { ...reviewCard(newCard(NOW - 10 * DAY), 4, NOW - 10 * DAY), due: NOW - daysAgo * DAY };
}

describe('countRepertoireDue', () => {
  const rep = BUILT_IN_REPERTOIRES[0]!;

  it('counts the learned moves that are due, in built-in and custom repertoires', () => {
    const [a, b, c] = learnerMoves(rep.pgn, rep.color, 3);
    const cards: Record<string, SrsCard> = {
      [`${rep.id}|${cardKey(a!)}`]: learnedCard(1),
      [`${rep.id}|${cardKey(b!)}`]: learnedCard(2),
      // Not due yet.
      [`${rep.id}|${cardKey(c!)}`]: { ...learnedCard(0), due: NOW + DAY },
    };
    expect(countRepertoireDue(cards, [], NOW)).toBe(2);

    const custom = { id: 'mine', color: rep.color, pgn: rep.pgn };
    cards[`mine|${cardKey(a!)}`] = learnedCard(1);
    expect(countRepertoireDue(cards, [custom], NOW)).toBe(3);
  });

  it('skips a custom repertoire that no longer parses', () => {
    const cards = { 'broken|e2e4': learnedCard(1) };
    expect(
      countRepertoireDue(cards, [{ id: 'broken', color: 'white', pgn: '1. e4 e5 2. Qh8' }], NOW),
    ).toBe(0);
  });

  it('counts nothing without cards', () => {
    expect(countRepertoireDue({}, [], NOW)).toBe(0);
  });
});

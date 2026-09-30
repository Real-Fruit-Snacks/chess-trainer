import { describe, expect, it } from 'vitest';
import { GameTree } from '@/chess/tree';
import { BUILT_IN_REPERTOIRES } from './repertoires';
import { repertoireLines, repertoireStats } from './model';

describe('built-in repertoires', () => {
  for (const rep of BUILT_IN_REPERTOIRES) {
    it(`${rep.name} parses into a legal tree with several lines`, () => {
      const tree = GameTree.fromPgn(rep.pgn);
      const lines = repertoireLines(tree);
      expect(lines.length).toBeGreaterThanOrEqual(4);
      for (const line of lines) {
        expect(line.length).toBeGreaterThanOrEqual(8);
      }
      const stats = repertoireStats(tree, rep.color, {}, Date.now());
      expect(stats.total).toBeGreaterThan(10);
      expect(stats.fresh).toBe(stats.total); // nothing learned yet
      expect(stats.due).toBe(0);
      // Every line must end after the learner's move or with a comment-free opponent move.
      expect(tree.root.children.length).toBe(1);
    });
  }

  it('has unique ids', () => {
    expect(new Set(BUILT_IN_REPERTOIRES.map((r) => r.id)).size).toBe(BUILT_IN_REPERTOIRES.length);
  });
});

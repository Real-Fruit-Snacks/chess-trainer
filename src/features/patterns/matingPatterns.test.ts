import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { THEMES } from '@/features/puzzles/themes';
import { MATING_PATTERNS, patternDiagram, patternPuzzle } from './matingPatterns';

/** True when the side to move can force mate within `moves` of its own moves. */
function forcedMate(fen: string, moves: number): boolean {
  const chess = new Chess(fen);
  if (moves === 0) return chess.isCheckmate();
  for (const move of chess.moves()) {
    chess.move(move);
    if (chess.isCheckmate()) {
      chess.undo();
      return true;
    }
    let allReplies = !chess.isGameOver() && moves > 1;
    if (allReplies) {
      for (const reply of chess.moves()) {
        chess.move(reply);
        const ok = forcedMate(chess.fen(), moves - 1);
        chess.undo();
        if (!ok) {
          allReplies = false;
          break;
        }
      }
    }
    chess.undo();
    if (allReplies) return true;
  }
  return false;
}

describe('mating patterns', () => {
  it('cover every named mate theme of the puzzle library', () => {
    const mateThemes = Object.keys(THEMES).filter((t) => /[a-z]Mate$/.test(t));
    expect(new Set(MATING_PATTERNS.map((p) => p.id))).toEqual(new Set(mateThemes));
    expect(new Set(MATING_PATTERNS.map((p) => p.id)).size).toBe(MATING_PATTERNS.length);
  });

  it('reach the diagram with the setup move and mate with the line', () => {
    for (const pattern of MATING_PATTERNS) {
      const chess = new Chess(pattern.before);
      expect(chess.turn(), `${pattern.id}: the defender moves first`).toBe('b');
      expect(
        () => chess.move(pattern.setup),
        `${pattern.id}: setup ${pattern.setup}`,
      ).not.toThrow();
      expect(chess.fen()).toBe(patternDiagram(pattern));
      expect(chess.isCheck(), `${pattern.id}: the diagram starts with White in check`).toBe(false);
      for (const san of pattern.line) {
        expect(() => chess.move(san), `${pattern.id}: ${san}`).not.toThrow();
      }
      expect(chess.isCheckmate(), `${pattern.id}: ${pattern.line.join(' ')} is not mate`).toBe(
        true,
      );
      // The mate is forced from the diagram in the line's number of moves.
      const n = Math.ceil(pattern.line.length / 2);
      expect(
        forcedMate(patternDiagram(pattern), n),
        `${pattern.id}: not a forced mate in ${n}`,
      ).toBe(true);
    }
  });

  it('mate-in-one diagrams have exactly one mating move, so the named mate is the answer', () => {
    for (const pattern of MATING_PATTERNS) {
      if (pattern.line.length !== 1) continue;
      const chess = new Chess(patternDiagram(pattern));
      const mates = chess.moves().filter((san) => {
        chess.move(san);
        const mate = chess.isCheckmate();
        chess.undo();
        return mate;
      });
      expect(mates, `${pattern.id}: mates in one are ${mates.join(', ')}`).toEqual([
        pattern.line[0],
      ]);
    }
  });

  it('become puzzles with the setup move first', () => {
    for (const pattern of MATING_PATTERNS) {
      const puzzle = patternPuzzle(pattern);
      const moves = puzzle.moves.split(' ');
      expect(moves).toHaveLength(pattern.line.length + 1);
      expect(puzzle.themes).toContain(pattern.id);
      const chess = new Chess(puzzle.fen);
      for (const uci of moves) {
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      }
      expect(chess.isCheckmate()).toBe(true);
    }
  });
});

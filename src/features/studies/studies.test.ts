import { Chess, validateFen } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { normalizeSan } from '@/features/learn/taskCheck';
import { solverColor, STUDIES } from './studies';

describe('endgame studies', () => {
  it('have unique ids and sensible metadata', () => {
    const ids = STUDIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const study of STUDIES) {
      expect(study.line.length).toBeGreaterThan(0);
      expect(study.intro.length).toBeGreaterThan(20);
      expect(study.outro.length).toBeGreaterThan(20);
      expect(study.themes.length).toBeGreaterThan(0);
    }
  });

  for (const study of STUDIES) {
    it(`${study.title}: legal position, legal line, correct sides`, () => {
      const result = validateFen(study.fen);
      expect(result.ok, result.error).toBe(true);
      const parts = study.fen.split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      parts[3] = '-';
      expect(new Chess(parts.join(' ')).inCheck(), 'side not to move in check').toBe(false);

      const chess = new Chess(study.fen);
      const solver = solverColor(study);
      for (const [index, ply] of study.line.entries()) {
        expect(chess.turn() === 'w' ? 'white' : 'black', `ply ${index + 1} side`).toBe(solver);
        const base = chess.fen();
        expect(ply.moves.length).toBeGreaterThan(0);
        for (const san of ply.moves) {
          const probe = new Chess(base);
          const move = probe.move(san);
          expect(normalizeSan(move.san), `${san} is written as played`).toBe(normalizeSan(san));
          if (ply.reply) {
            expect(
              () => probe.move(ply.reply as string),
              `${ply.reply} after ${san}`,
            ).not.toThrow();
          }
        }
        chess.move(ply.moves[0] as string);
        if (ply.reply) chess.move(ply.reply);
        else expect(index, 'only the last ply may lack a reply').toBe(study.line.length - 1);
      }
      // A study should not end with the solver mated or the reply leaving the game finished mid-line.
      expect(chess.isCheckmate()).toBe(false);
    });
  }
});

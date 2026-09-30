import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { CLASSIC_GAMES } from './games';

describe('classic games', () => {
  for (const game of CLASSIC_GAMES) {
    it(`${game.title} replays legally and ends as recorded`, () => {
      const chess = new Chess();
      const moves = game.moves.split(' ');
      for (const san of moves) {
        expect(() => chess.move(san), `${game.id}: ${san}`).not.toThrow();
      }
      if (game.moves.endsWith('#')) {
        expect(chess.isCheckmate()).toBe(true);
        expect(chess.turn()).toBe(game.result === '1-0' ? 'b' : 'w');
      }
      // Notes must point at real plies of the guessed side.
      for (const ply of Object.keys(game.notes).map(Number)) {
        expect(ply).toBeGreaterThanOrEqual(1);
        expect(ply).toBeLessThanOrEqual(moves.length);
        const mover = ply % 2 === 1 ? 'white' : 'black';
        expect(mover, `${game.id} note at ply ${ply}`).toBe(game.guessColor);
      }
      // Guessing starts on the guesser's move.
      const startMover = game.guessFromPly % 2 === 0 ? 'white' : 'black';
      expect(startMover).toBe(game.guessColor);
      expect(game.guessFromPly).toBeLessThan(moves.length);
    });
  }

  it('has unique ids', () => {
    expect(new Set(CLASSIC_GAMES.map((g) => g.id)).size).toBe(CLASSIC_GAMES.length);
  });
});

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

describe('classics filters', () => {
  it('assigns every game to an era and filters by era, difficulty and status', async () => {
    const { ERAS, eraOf, filterGames } = await import('./eras');
    for (const game of CLASSIC_GAMES) {
      expect(ERAS.map((e) => e.id)).toContain(eraOf(game));
    }
    expect(eraOf({ year: 1858 })).toBe('romantic');
    expect(eraOf({ year: 1924 })).toBe('classical');
    expect(eraOf({ year: 1972 })).toBe('modern');
    expect(eraOf({ year: 1997 })).toBe('contemporary');
    const played = new Set([CLASSIC_GAMES[0]?.id ?? '']);
    const romantic = filterGames(
      CLASSIC_GAMES,
      { era: 'romantic', difficulty: 'all', status: 'all' },
      played,
    );
    expect(romantic.length).toBeGreaterThanOrEqual(5);
    expect(romantic.every((g) => g.year <= 1880)).toBe(true);
    const easy = filterGames(CLASSIC_GAMES, { era: 'all', difficulty: 1, status: 'new' }, played);
    expect(easy.every((g) => g.difficulty === 1 && !played.has(g.id))).toBe(true);
    expect(
      filterGames(CLASSIC_GAMES, { era: 'all', difficulty: 'all', status: 'played' }, played),
    ).toHaveLength(1);
  });
});

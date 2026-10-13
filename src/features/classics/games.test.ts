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
      // Notes must point at real plies of the guessed side, after guessing has begun (a note at
      // an earlier ply would never be shown), and quote a move that is really played there.
      for (const ply of Object.keys(game.notes).map(Number)) {
        expect(ply).toBeGreaterThanOrEqual(1);
        expect(ply).toBeLessThanOrEqual(moves.length);
        const mover = ply % 2 === 1 ? 'white' : 'black';
        expect(mover, `${game.id} note at ply ${ply}`).toBe(game.guessColor);
        expect(ply, `${game.id} note at ply ${ply} is before guessing starts`).toBeGreaterThan(
          game.guessFromPly,
        );
        const note = game.notes[ply] ?? '';
        const quoted = /^(?:\.\.\.)?([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)/.exec(
          note,
        );
        if (quoted) {
          const played = moves[ply - 1] ?? '';
          expect(
            played.replace(/[+#!?]/g, ''),
            `${game.id} note at ply ${ply} quotes ${quoted[1]} but ${played} was played`,
          ).toBe(quoted[1]);
        }
      }
      // The lines a note gives as variations must be legal from that position.
      for (const [ply, text] of Object.entries(game.notes)) {
        const before = new Chess();
        moves.slice(0, Number(ply)).forEach((san) => before.move(san));
        for (const variation of text.matchAll(
          /(?:after|with) ((?:[KQRBNO][^ .,;]* ){3,}[KQRBNO][^ .,;]*)/g,
        )) {
          const line = new Chess(before.fen());
          for (const san of variation[1]!.split(' ')) {
            expect(
              () => line.move(san),
              `${game.id} ply ${ply}: ${san} in "${variation[1]}"`,
            ).not.toThrow();
          }
        }
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

/** The position after `ply` half-moves of a classic game. */
function positionAfter(id: string, ply: number): Chess {
  const game = CLASSIC_GAMES.find((g) => g.id === id);
  if (!game) throw new Error(`no game ${id}`);
  const chess = new Chess();
  for (const san of game.moves.split(' ').slice(0, ply)) chess.move(san);
  return chess;
}

/** Plays `line` (SAN, space-separated) from a copy of `chess` and returns the result. */
function after(chess: Chess, line: string): Chess {
  const copy = new Chess(chess.fen());
  for (const san of line.split(' ')) copy.move(san);
  return copy;
}

const noteAt = (id: string, ply: number) => CLASSIC_GAMES.find((g) => g.id === id)?.notes[ply];

describe('classic game annotations hold on the board', () => {
  it('the Evergreen mate: d7 covers e8, f6 covers g7 and guards e7, the rook blocks g8', () => {
    expect(noteAt('evergreen-game', 47)).toMatch(/bishop on d7 covers e8/);
    const end = positionAfter('evergreen-game', 47);
    expect(end.isCheckmate()).toBe(true);
    expect(end.attackers('e8', 'w')).toContain('d7');
    expect(end.attackers('g7', 'w')).toContain('f6');
    expect(end.attackers('e7', 'w')).toContain('f6');
    expect(end.get('g8')).toEqual({ type: 'r', color: 'b' });
  });

  it('Steinitz–Bardeleben: Ne6 cannot be taken, and neither can Rxe7+', () => {
    expect(noteAt('steinitz-bardeleben', 37)).toMatch(/after Qxe6, Qxe6\+ wins the queen/);
    const ne6 = positionAfter('steinitz-bardeleben', 37);
    const traded = after(ne6, 'Qxe6 Qxe6+');
    expect(traded.inCheck()).toBe(true);
    // The rook on e1 guards e6: the king cannot take back.
    expect(traded.moves()).not.toContain('Kxe6');

    expect(noteAt('steinitz-bardeleben', 43)).toMatch(/Qxe7 runs into Rxc8\+/);
    const rxe7 = positionAfter('steinitz-bardeleben', 43);
    const queenTakes = after(rxe7, 'Qxe7');
    expect(queenTakes.moves()).toContain('Rxc8+');
    const hunted = after(rxe7, 'Kxe7 Re1+ Kd6 Qb4+ Kc7 Ne6+ Kb8 Qf4+');
    expect(hunted.inCheck()).toBe(true);
  });

  it('Bernstein–Capablanca: Qb2 hits c3 and e2, and both queen moves are met by mate', () => {
    expect(noteAt('bernstein-capablanca', 58)).toMatch(/Qxb2 is met by Rd1 mate/);
    const qb2 = positionAfter('bernstein-capablanca', 58);
    expect(qb2.attackers('c3', 'b')).toContain('b2');
    expect(qb2.attackers('e2', 'b')).toContain('b2');
    expect(after(qb2, 'Qxb2 Rd1#').isCheckmate()).toBe(true);
    expect(after(qb2, 'Qd1 Rxd1#').isCheckmate()).toBe(true);
  });

  it('Karpov–Kasparov 1985: Karpov resigned two moves after ...Qf2', () => {
    const game = CLASSIC_GAMES.find((g) => g.id === 'karpov-kasparov-1985');
    expect(game?.notes[76]).toMatch(/resigned two moves later/);
    const moves = game?.moves.split(' ') ?? [];
    expect(moves[75]).toBe('Qf2');
    // Black's 39th and 40th moves follow, and the game ends there.
    expect(moves.length - 76).toBe(4);
  });
});

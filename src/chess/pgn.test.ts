import { describe, expect, it } from 'vitest';
import { parsePgn, PgnParseError, splitPgnGames } from './pgn';
import { GameTree } from './tree';

const sans = (game: ReturnType<typeof parsePgn>) => game.moves.map((m) => m.san);

describe('parsePgn: movetext in the wild', () => {
  it('reads move numbers glued to the moves', () => {
    expect(sans(parsePgn('1.e4 e5 2.Nf3 Nc6 3.Bb5'))).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(sans(parsePgn('1.e4 e5 2.Nf3 (2.Bc4 Nf6) 2...Nc6 3. Bb5'))).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
      'Bb5',
    ]);
    expect(sans(parsePgn('12.\nNf3 12... Nc6 13.Bb5!?'))).toEqual(['Nf3', 'Nc6', 'Bb5']);
    expect(parsePgn('13.Bb5!?').moves[0]?.nags).toEqual([5]);
    // The whole thing replays, so the glued form really imports.
    expect(GameTree.fromPgn('1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O').mainLine()).toHaveLength(
      9,
    );
  });

  it('splits [%clk] and friends out of comments and keeps the prose clean', () => {
    const game = parsePgn(
      '1. e4 {[%clk 0:09:58.7]} e5 {[%clk 0:09:55] a solid reply [%eval 0.3,20]} 2. Nf3 {[%csl Ra1,Gb2][%cal Ge2e4] look here}',
    );
    expect(game.moves[0]?.comment).toBeUndefined();
    expect(game.moves[0]?.commands).toEqual([{ name: 'clk', args: '0:09:58.7' }]);
    expect(game.moves[1]?.comment).toBe('a solid reply');
    expect(game.moves[1]?.commands).toEqual([
      { name: 'clk', args: '0:09:55' },
      { name: 'eval', args: '0.3,20' },
    ]);
    expect(game.moves[2]?.comment).toBe('look here');
    expect(game.moves[2]?.commands.map((c) => c.name)).toEqual(['csl', 'cal']);
  });

  it('attaches a comment or NAG written before a variation’s first move to that move', () => {
    const game = parsePgn('1. e4 e5 2. Nf3 ({Better is} $1 2. Bc4 {the Italian way} Nf6) Nc6');
    const variation = game.moves[2]?.variations[0];
    expect(variation?.map((m) => m.san)).toEqual(['Bc4', 'Nf6']);
    expect(variation?.[0]?.commentBefore).toBe('Better is');
    expect(variation?.[0]?.nags).toEqual([1]);
    expect(variation?.[0]?.comment).toBe('the Italian way');
  });

  it('keeps the comment before the first move as the game comment', () => {
    const game = parsePgn('{A famous game.} {Two comments.} 1. e4 e5');
    expect(game.comment).toBe('A famous game. Two comments.');
    expect(sans(game)).toEqual(['e4', 'e5']);
  });

  it('turns evaluation symbols into NAGs and drops words that cannot be moves', () => {
    const game = parsePgn('1. e4 e5 +- 2. Nf3 ∞ Nc6 = 3. Bb5 ± a6 TN 4. Ba4 e.p. -+ Nf6 ⩲ N');
    expect(sans(game)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6']);
    expect(game.moves[1]?.nags).toEqual([18]);
    expect(game.moves[2]?.nags).toEqual([13]);
    expect(game.moves[3]?.nags).toEqual([10]);
    expect(game.moves[4]?.nags).toEqual([16]);
    expect(game.moves[6]?.nags).toEqual([19]);
    expect(game.moves[7]?.nags).toEqual([14, 146]);
  });

  it('reads ½-½ as a result and ignores % escape lines', () => {
    const game = parsePgn('% this line is not PGN\n1. e4 e5 2. Nf3 Nc6\n%another escape\n½-½');
    expect(sans(game)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(game.result).toBe('1/2-1/2');
  });

  it('keeps typos that carry a square so the error can name them', () => {
    const game = parsePgn('1. e4 e5 2. Nf33 Nc6');
    expect(sans(game)).toEqual(['e4', 'e5', 'Nf33', 'Nc6']);
    expect(() => GameTree.fromPgn('1. e4 e5 2. Nf33 Nc6')).toThrow('Illegal move Nf33 after e5');
  });

  it('reads long algebraic moves and lowercase castling', () => {
    expect(sans(parsePgn('1. e2-e4 e7e5 2. Ng1-f3 Nc6 3. Bc4 Nf6 4. o-o'))).toEqual([
      'e2e4',
      'e7e5',
      'Ng1f3',
      'Nc6',
      'Bc4',
      'Nf6',
      'O-O',
    ]);
    expect(
      GameTree.fromPgn('1. e2-e4 e7e5 2. Ng1-f3 Nc6 3. Bc4 Nf6 4. o-o').mainLine().at(-1)?.san,
    ).toBe('O-O');
  });

  it('reports unbalanced parentheses as PgnParseErrors', () => {
    expect(() => parsePgn('1. e4 (1. d4 d5')).toThrow(PgnParseError);
    expect(() => parsePgn('1. e4 (1. d4 d5')).toThrow(/Unbalanced/);
    try {
      parsePgn('1. e4 e5)');
    } catch (err) {
      expect(err).toBeInstanceOf(PgnParseError);
      expect((err as PgnParseError).token).toBe(')');
    }
  });
});

describe('splitPgnGames', () => {
  it('splits games on their header blocks', () => {
    const text = `[Event "1"]\n\n1. e4 *\n\n[Event "2"]\n\n1. d4 *\n`;
    const games = splitPgnGames(text);
    expect(games).toHaveLength(2);
    expect(parsePgn(games[1] as string).headers.Event).toBe('2');
  });

  it('splits header-less games after a result and a blank line', () => {
    const games = splitPgnGames('1. e4 e5 2. Nf3 1-0\n\n1. d4 d5 2. c4 *\n\n{Third} 1. c4 *');
    expect(games).toEqual(['1. e4 e5 2. Nf3 1-0', '1. d4 d5 2. c4 *', '{Third} 1. c4 *']);
  });

  it('splits header-less games on a move 1 that restarts after a finished game or a blank line', () => {
    expect(splitPgnGames('1. e4 e5 1-0\n1. d4 d5 0-1')).toEqual(['1. e4 e5 1-0', '1. d4 d5 0-1']);
    expect(splitPgnGames('1. e4 e5 2. Nf3\n\n1.d4 d5')).toEqual(['1. e4 e5 2. Nf3', '1.d4 d5']);
    // A wrapped game whose lines never start with "1." stays one game; so does a Black move 1.
    expect(
      splitPgnGames('[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6\n3. Bb5 a6 4. Ba4 Nf6\n1... e5 *'),
    ).toHaveLength(1);
  });

  it('ignores blank text', () => {
    expect(splitPgnGames('\n\n  \n')).toEqual([]);
  });
});

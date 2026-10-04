import { describe, expect, it } from 'vitest';
import { parsePgn, PgnParseError, splitPgnGames } from './pgn';
import { GameTree, parsePgnCached } from './tree';

const SAMPLE = `[Event "Test"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Nf3 {develops} Nc6 (2... Nf6 3. Nxe5 d6 4. Nf3 Nxe4) 3. Bb5 a6!? 4. Ba4 $1 1-0`;

describe('parsePgn', () => {
  it('reads headers, moves, comments, NAGs and variations', () => {
    const game = parsePgn(SAMPLE);
    expect(game.headers.White).toBe('A');
    expect(game.result).toBe('1-0');
    expect(game.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4']);
    expect(game.moves[2]?.comment).toBe('develops');
    expect(game.moves[5]?.nags).toEqual([5]);
    expect(game.moves[6]?.nags).toEqual([1]);
    const variation = game.moves[3]?.variations[0];
    expect(variation?.map((m) => m.san)).toEqual(['Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4']);
  });

  it('handles nested variations and zero-style castling', () => {
    const game = parsePgn(
      '1. e4 e5 2. Nf3 (2. Bc4 Nf6 (2... Bc5 3. Qh5) 3. d3) Nc6 3. Bc4 Bc5 4. 0-0',
    );
    expect(game.moves[2]?.variations[0]?.[1]?.variations[0]?.[0]?.san).toBe('Bc5');
    expect(game.moves[6]?.san).toBe('O-O');
  });

  it('throws on unbalanced parentheses', () => {
    expect(() => parsePgn('1. e4 (1. d4 d5')).toThrow(/Unbalanced/);
    expect(() => parsePgn('1. e4 e5)')).toThrow(/Unbalanced/);
  });

  it('splits multi-game files', () => {
    const text = `[Event "1"]\n\n1. e4 *\n\n[Event "2"]\n\n1. d4 *\n`;
    const games = splitPgnGames(text);
    expect(games).toHaveLength(2);
    expect(parsePgn(games[1] as string).headers.Event).toBe('2');
  });
});

describe('GameTree', () => {
  it('builds a tree from PGN and exports equivalent PGN', () => {
    const tree = GameTree.fromPgn(SAMPLE);
    expect(tree.mainLine().map((n) => n.san)).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
      'Bb5',
      'a6',
      'Ba4',
    ]);
    const nc6 = tree.mainLine()[3] as NonNullable<ReturnType<typeof tree.mainLine>[number]>;
    expect(nc6.parent?.children.map((c) => c.san)).toEqual(['Nc6', 'Nf6']);

    const pgn = tree.toPgn();
    expect(pgn).toContain('[White "A"]');
    expect(pgn.replace(/\n/g, ' ')).toContain(
      '2. Nf3 {develops} 2... Nc6 (2... Nf6 3. Nxe5 d6 4. Nf3 Nxe4) 3. Bb5 a6!? 4. Ba4! 1-0',
    );

    // Round trip: parsing the export gives the same structure.
    const again = GameTree.fromPgn(pgn);
    expect(again.toPgn()).toBe(pgn);
  });

  it('adds moves, reuses existing children and navigates', () => {
    const tree = new GameTree();
    const e4 = tree.addMove('e4');
    tree.addMove('e5');
    tree.back();
    const c5 = tree.addMove('c5'); // variation
    expect(e4?.children.map((c) => c.san)).toEqual(['e5', 'c5']);
    expect(tree.current).toBe(c5);
    tree.goStart();
    tree.forward();
    expect(tree.current.san).toBe('e4');
    tree.addMove({ from: 'e7', to: 'e5' }); // existing child
    expect(e4?.children).toHaveLength(2);
    expect(tree.current.san).toBe('e5');
    expect(tree.currentLineUci()).toEqual(['e2e4', 'e7e5']);
    expect(tree.addMove('Kd8')).toBeNull();
  });

  it('promotes variations and deletes subtrees', () => {
    const tree = GameTree.fromPgn('1. e4 e5 (1... c5 2. Nf3) 2. Nf3');
    const e4 = tree.root.children[0] as NonNullable<(typeof tree.root.children)[number]>;
    const c5 = e4.children[1] as NonNullable<(typeof e4.children)[number]>;
    expect(tree.isMainLine(c5)).toBe(false);
    tree.promoteToMain(c5);
    expect(tree.mainLine().map((n) => n.san)).toEqual(['e4', 'c5', 'Nf3']);
    expect(tree.isMainLine(c5)).toBe(true);

    tree.goTo(c5.children[0] as NonNullable<(typeof c5.children)[number]>);
    tree.deleteNode(c5);
    expect(e4.children.map((c) => c.san)).toEqual(['e5']);
    expect(tree.current).toBe(e4);
  });

  it('keeps a custom start position in the export', () => {
    const tree = new GameTree('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    tree.addMove('Ra8+');
    const pgn = tree.toPgn();
    expect(pgn).toContain('[FEN "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"]');
    expect(pgn).toContain('1. Ra8+');
    expect(GameTree.fromPgn(pgn).startFen).toBe('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
  });

  it('numbers black moves after variations and comments', () => {
    const tree = GameTree.fromPgn('1. e4 {best} e5 2. Nf3 (2. Nc3) Nc6');
    expect(tree.toPgn()).toContain('1. e4 {best} 1... e5 2. Nf3 (2. Nc3) 2... Nc6');
  });

  it('writes the comment before the first move and round-trips it', () => {
    const tree = GameTree.fromPgn('{A famous game.} 1. e4 e5 *');
    expect(tree.root.comment).toBe('A famous game.');
    const pgn = tree.toPgn();
    expect(pgn).toBe('{A famous game.} 1. e4 e5 *');
    expect(GameTree.fromPgn(pgn).root.comment).toBe('A famous game.');
    const fresh = new GameTree();
    fresh.setComment(fresh.root, 'Start here');
    fresh.addMove('e4');
    expect(fresh.toPgn()).toBe('{Start here} 1. e4 *');
  });

  it('keeps clocks and other commands through a round trip, apart from the prose', () => {
    const source =
      '1. e4 {[%clk 0:09:58.7]} e5 {[%clk 0:09:55] a solid reply} 2. Nf3 {[%csl Ra1][%cal Ge2e4] look} *';
    const tree = GameTree.fromPgn(source);
    const [e4, e5, nf3] = tree.mainLine();
    expect(e4?.comment).toBeUndefined();
    expect(e4?.commands).toEqual([{ name: 'clk', args: '0:09:58.7' }]);
    expect(e5?.comment).toBe('a solid reply');
    expect(nf3?.commands).toHaveLength(2);
    const pgn = tree.toPgn();
    expect(pgn.replace(/\n/g, ' ')).toBe(
      '1. e4 {[%clk 0:09:58.7]} 1... e5 {[%clk 0:09:55] a solid reply} 2. Nf3 {[%csl Ra1] [%cal Ge2e4] look} *',
    );
    expect(GameTree.fromPgn(pgn).toPgn()).toBe(pgn);
  });

  it('keeps the comment that opens a variation', () => {
    const tree = GameTree.fromPgn('1. e4 e5 2. Nf3 ({Better is} 2. Bc4 Nf6) Nc6 *');
    const e5 = tree.mainLine()[1];
    const bc4 = e5?.children[1];
    expect(bc4?.san).toBe('Bc4');
    expect(bc4?.commentBefore).toBe('Better is');
    const pgn = tree.toPgn();
    expect(pgn).toContain('({Better is} 2. Bc4 Nf6)');
    expect(GameTree.fromPgn(pgn).toPgn()).toBe(pgn);
  });

  it('refuses an invalid FEN header and names illegal moves with a PgnParseError', () => {
    expect(() => GameTree.fromPgn('[FEN "not a position"]\n[SetUp "1"]\n\n1. e4 *')).toThrow(
      PgnParseError,
    );
    expect(() => GameTree.fromPgn('[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]\n\n*')).toThrow(/Invalid FEN/);
    let caught: unknown;
    try {
      GameTree.fromPgn('1. e4 e5 2. Qh5 Nc6 3. Nf7');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PgnParseError);
    const error = caught as PgnParseError;
    expect(error.message).toBe('Illegal move Nf7 after Nc6');
    expect(error.token).toBe('Nf7');
    expect(error.ply).toBe(5);
    expect(() => GameTree.fromPgn('1. Ke2')).toThrow('Illegal move Ke2 at the start');
  });

  it('normalises a start position with stale castling flags', () => {
    // King on e2: no castling, whatever the FEN claims.
    const tree = GameTree.fromPgn(
      '[FEN "r3k2r/pppppppp/8/8/8/8/PPPPKPPP/R6R w KQkq - 0 1"]\n[SetUp "1"]\n\n1. Rhg1 *',
    );
    expect(tree.startFen).toBe('r3k2r/pppppppp/8/8/8/8/PPPPKPPP/R6R w kq - 0 1');
    expect(tree.headers.FEN).toBe(tree.startFen);
    expect(new GameTree('4k3/8/8/8/8/8/4K3/R6R w KQkq - 0 1').startFen).toBe(
      '4k3/8/8/8/8/8/4K3/R6R w - - 0 1',
    );
  });

  it('clones into an independent tree with fresh ids', () => {
    const tree = GameTree.fromPgn('{Start} 1. e4 {[%clk 0:10:00] fine} e5 (1... c5) 2. Nf3 *');
    tree.goEnd();
    const copy = tree.clone();
    expect(copy.toPgn()).toBe(tree.toPgn());
    expect(copy.current).toBe(copy.root);
    expect(copy.root.children[0]?.id).not.toBe(tree.root.children[0]?.id);
    copy.goEnd();
    expect(copy.addMove('Nc6')).not.toBeNull();
    expect(tree.mainLine()).toHaveLength(3);
    expect(copy.mainLine()).toHaveLength(4);
  });

  it('memoises parsing per PGN string and hands out copies', () => {
    const pgn = '1. d4 d5 2. c4 e6 3. Nc3 Nf6 *';
    const first = parsePgnCached(pgn);
    const second = parsePgnCached(pgn);
    expect(second).not.toBe(first);
    expect(second.toPgn()).toBe(first.toPgn());
    first.goEnd();
    first.addMove('Bg5');
    expect(parsePgnCached(pgn).mainLine()).toHaveLength(6);
  });
});

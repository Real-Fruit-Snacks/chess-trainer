import { describe, expect, it } from 'vitest';
import { parsePgn, splitPgnGames } from './pgn';
import { GameTree } from './tree';

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
});

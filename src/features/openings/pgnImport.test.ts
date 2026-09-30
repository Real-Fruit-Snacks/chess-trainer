import { describe, expect, it } from 'vitest';
import { repertoireLines } from './model';
import { mergePgnGames } from './pgnImport';

describe('mergePgnGames', () => {
  it('merges several games and their variations into one tree', () => {
    const tree = mergePgnGames(
      `[Event "A"]\n\n1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4 *\n\n[Event "B"]\n\n1. e4 c5 2. Nc3 {Closed} Nc6 *\n`,
    );
    const lines = repertoireLines(tree).map((l) => l.map((n) => n.san).join(' '));
    expect(lines).toEqual(['e4 c5 Nf3 d6 d4', 'e4 c5 Nf3 Nc6 d4', 'e4 c5 Nc3 Nc6']);
    const nc3 = tree.root.children[0]?.children[0]?.children[1];
    expect(nc3?.comment).toBe('Closed');
  });

  it('rejects illegal moves and custom start positions', () => {
    expect(() => mergePgnGames('1. e4 e5 2. Ke2 Kxe2')).toThrow(/Illegal move/);
    expect(() => mergePgnGames('[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. Ke2 *')).toThrow(
      /initial position/,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { GameTree } from '@/chess/tree';
import { describeLine, lineOf, mergeLineIntoPgn } from './mergeLine';

describe('merging a line into a repertoire', () => {
  it('starts a repertoire from nothing and adds variations to an existing one', () => {
    const first = mergeLineIntoPgn('', ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(first.added).toBe(5);
    expect(first.pgn).toContain('1. e4 e5 2. Nf3 Nc6 3. Bb5');
    const second = mergeLineIntoPgn(first.pgn, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
    expect(second.added).toBe(2);
    expect(second.pgn).toContain('(3. Bc4 Bc5)');
    // Adding the same line again changes nothing.
    expect(mergeLineIntoPgn(second.pgn, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']).added).toBe(0);
    expect(() => mergeLineIntoPgn(second.pgn, ['e4', 'e5', 'Nf6'])).toThrow(/Illegal/);
  });

  it('reads the current line of a tree', () => {
    const tree = GameTree.fromPgn('1. d4 d5 2. c4 e6');
    tree.goEnd();
    expect(lineOf(tree)).toEqual(['d4', 'd5', 'c4', 'e6']);
  });
});

describe('describeLine', () => {
  it('numbers the moves from the starting position', () => {
    expect(describeLine([])).toBe('');
    expect(describeLine(['e4'])).toBe('1. e4');
    expect(describeLine(['e4', 'c5', 'Nf3'])).toBe('1. e4 c5 2. Nf3');
  });
});

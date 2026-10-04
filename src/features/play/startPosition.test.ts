import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { checkStartPosition } from './startPosition';

describe('checkStartPosition', () => {
  it('accepts a playable position and normalises it', () => {
    expect(checkStartPosition(null)).toEqual({ fen: null, problem: null });
    expect(checkStartPosition(START_FEN)).toEqual({ fen: START_FEN, problem: null });
    expect(checkStartPosition('6k1/5ppp/8/8/8/8/8/Q5K1 w').fen).toBe(
      '6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1',
    );
  });

  it('refuses garbage, a side in check that is not to move, and a finished game', () => {
    expect(checkStartPosition('not a fen').problem).toMatch(/not a valid FEN/);
    expect(checkStartPosition('4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1').problem).toMatch(
      /Black is in check but it is not their move/,
    );
    expect(checkStartPosition('4k3/8/8/8/8/8/8/4K3 w - - 0 1').problem).toMatch(/already over/);
    expect(checkStartPosition('Q5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1').problem).toMatch(
      /already over \(checkmate\)/,
    );
  });
});

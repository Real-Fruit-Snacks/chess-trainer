import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/random';
import {
  ARMY_PRESETS,
  armyCost,
  armyPieces,
  armyProblem,
  canAdd,
  describeArmy,
  describeBudget,
  draftFen,
  EMPTY_ARMY,
  MAX_PAWNS,
  MAX_PIECES,
  placeArmy,
  randomArmy,
} from './army';

describe('army draft', () => {
  it('prices armies and enforces the budget and the board', () => {
    expect(armyCost({ q: 1, r: 2, b: 2, n: 2, p: 8 })).toBe(39);
    expect(armyProblem({ q: 1, r: 2, b: 2, n: 2, p: 8 }, 30)).toMatch(/Over budget by 9/);
    expect(armyProblem({ q: 0, r: 0, b: 0, n: 0, p: 9 }, 30)).toMatch(/8 pawns/);
    expect(armyProblem({ q: 0, r: 0, b: 4, n: 4, p: 0 }, 30)).toMatch(/7 pieces/);
    expect(armyProblem(EMPTY_ARMY, 30)).toMatch(/at least one/);
    expect(armyProblem({ q: 1, r: 2, b: 1, n: 1, p: 5 }, 30)).toBeNull();
    expect(canAdd({ q: 3, r: 0, b: 0, n: 0, p: 3 }, 'p', 30)).toBe(false);
    expect(canAdd({ q: 3, r: 0, b: 0, n: 0, p: 2 }, 'p', 30)).toBe(true);
  });

  it('ships presets that fit their budgets', () => {
    for (const preset of ARMY_PRESETS) {
      expect(armyProblem(preset.army, preset.budget), preset.name).toBeNull();
    }
  });

  it('places the king on e1/e8, pieces on the back rank and pawns from the centre', () => {
    const placed = placeArmy({ q: 1, r: 2, b: 1, n: 1, p: 3 }, 'white');
    expect(placed.get('e1')).toBe('k');
    expect(placed.get('a1')).toBe('r');
    expect(placed.get('h1')).toBe('r');
    expect(placed.get('d1')).toBe('q');
    expect([...placed.entries()].filter(([, p]) => p === 'p').map(([sq]) => sq)).toEqual([
      'e2',
      'd2',
      'f2',
    ]);
    const black = placeArmy({ q: 0, r: 0, b: 0, n: 7, p: 0 }, 'black');
    expect(black.get('e8')).toBe('k');
    expect([...black.values()].filter((p) => p === 'n')).toHaveLength(MAX_PIECES);
  });

  it('builds a legal position with no castling rights', () => {
    const fen = draftFen({ q: 3, r: 0, b: 0, n: 0, p: 3 }, { q: 0, r: 4, b: 0, n: 0, p: 8 });
    const chess = new Chess(fen);
    expect(chess.turn()).toBe('w');
    expect(fen.split(' ')[2]).toBe('-');
    expect(chess.isCheck()).toBe(false);
    expect(chess.moves().length).toBeGreaterThan(0);
    // Pawn-less armies are legal too: nothing on a back rank attacks the other king.
    const bare = new Chess(
      draftFen({ q: 0, r: 4, b: 0, n: 0, p: 0 }, { q: 2, r: 0, b: 0, n: 0, p: 0 }),
    );
    expect(bare.isCheck()).toBe(false);
  });

  it('drafts random armies that fit the budget', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 50; i++) {
      const budget = [20, 30, 39][i % 3] as number;
      const army = randomArmy(budget, random);
      expect(armyProblem(army, budget), JSON.stringify(army)).toBeNull();
      // It keeps buying until the budget is spent or the ranks are full.
      const full = armyPieces(army) === MAX_PIECES && army.p === MAX_PAWNS;
      expect(full || armyCost(army) >= budget - 2, JSON.stringify(army)).toBe(true);
    }
  });

  it('describes an army in words', () => {
    expect(describeArmy({ q: 1, r: 0, b: 0, n: 3, p: 1 })).toBe('1 queen, 3 knights, 1 pawn');
    expect(describeArmy(EMPTY_ARMY)).toBe('a lone king');
  });

  it('reads the budget out in words for the live budget line', () => {
    expect(describeBudget(EMPTY_ARMY, 30)).toBe('0 of 30 points spent, 30 left.');
    expect(describeBudget({ q: 0, r: 1, b: 1, n: 4, p: 8 }, 30)).toBe(
      '28 of 30 points spent, 2 left.',
    );
    expect(describeBudget({ q: 1, r: 2, b: 2, n: 2, p: 8 }, 30)).toBe(
      '39 of 30 points: 9 over budget.',
    );
  });
});

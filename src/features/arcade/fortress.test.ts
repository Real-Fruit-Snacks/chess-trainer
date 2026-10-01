import { describe, expect, it } from 'vitest';
import {
  describeTier,
  FALLEN_CP,
  fortressScoreDetail,
  health,
  pickFortressPosition,
  tierForHeld,
} from './fortress';
import {
  type EvalPosition,
  fortressPositions,
  fortressTier,
  moverCp,
  quietPositions,
} from './positions';

const pos = (id: string, cp: number, turn: 'w' | 'b' = 'w'): EvalPosition => ({
  id,
  gameId: 'g',
  ply: 20,
  fen: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR ${turn} KQkq - 0 1`,
  cp,
  best: 'e2e4',
  forcing: false,
  pieces: 32,
});

describe('fortress', () => {
  it('maps the evaluation onto a health bar', () => {
    expect(health(0)).toBe(1);
    expect(health(200)).toBe(1);
    expect(health(FALLEN_CP)).toBe(0);
    expect(health(-300)).toBeCloseTo(0.5);
  });

  it('tiers positions by how bad they are for the side to move', () => {
    expect(fortressTier(pos('a', -100))).toBeNull();
    expect(fortressTier(pos('b', -200))).toBe(1);
    expect(fortressTier(pos('c', -300))).toBe(2);
    expect(fortressTier(pos('d', -400))).toBe(3);
    expect(fortressTier(pos('e', -500))).toBeNull();
    // From Black's side the sign flips.
    expect(fortressTier(pos('f', 300, 'b'))).toBe(2);
    expect(moverCp(pos('g', 300, 'b'))).toBe(-300);
    expect(tierForHeld(0)).toBe(1);
    expect(tierForHeld(2)).toBe(2);
    expect(tierForHeld(4)).toBe(3);
    expect(describeTier(3)).toBe('On the brink');
  });

  it('picks unused positions of the wanted tier, falling back to any tier', () => {
    const pool = [pos('a', -200), pos('b', -300), pos('c', -400)];
    const used = new Set<string>();
    expect(pickFortressPosition(pool, 2, used)?.id).toBe('b');
    used.add('b');
    expect(pickFortressPosition(pool, 2, used, () => 0)?.id).toBe('a');
    used.add('a').add('c');
    expect(pickFortressPosition(pool, 1, used)).toBeUndefined();
    expect(fortressScoreDetail(1, 'Club')).toBe('Held 1 position against Club');
  });

  it('ships enough evaluated positions for both games', () => {
    expect(quietPositions().length).toBeGreaterThanOrEqual(200);
    expect(fortressPositions().length).toBeGreaterThanOrEqual(30);
    for (const p of fortressPositions()) expect(p.fen.split(' ')).toHaveLength(6);
  });
});

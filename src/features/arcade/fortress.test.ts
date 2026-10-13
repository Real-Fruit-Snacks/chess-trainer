import { describe, expect, it } from 'vitest';
import {
  describeTier,
  FALLEN_CP,
  formatEval,
  fortressScore,
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
  });

  it('weights the score by the engine level', () => {
    expect(fortressScore(0, 8)).toBe(0);
    expect(fortressScore(3, 1)).toBe(3);
    expect(fortressScore(3, 5)).toBe(15);
    // Two positions against level 6 beat three against level 2.
    expect(fortressScore(2, 6)).toBeGreaterThan(fortressScore(3, 2));
    expect(fortressScoreDetail(1, 4, 'Club')).toBe('Held 1 position against Level 4 · Club');
    expect(fortressScoreDetail(3, 6, 'Advanced')).toBe(
      'Held 3 positions against Level 6 · Advanced',
    );
  });

  it('writes evaluations as pawns and mates as "M3", never as 99.97', () => {
    expect(formatEval(0)).toBe('0.0');
    expect(formatEval(4)).toBe('0.0');
    expect(formatEval(35)).toBe('+0.4');
    expect(formatEval(-230)).toBe('−2.3');
    // scoreToCp turns "mate in 3" into 9997 and "mated in 2" into -9998.
    expect(formatEval(9997)).toBe('M3');
    expect(formatEval(-9998)).toBe('−M2');
    expect(formatEval(-10_000)).toBe('−M1');
  });

  it('ships enough evaluated positions for both games, with either side to move', () => {
    const quiet = quietPositions();
    const fortress = fortressPositions();
    expect(quiet.length).toBeGreaterThanOrEqual(200);
    expect(fortress.length).toBeGreaterThanOrEqual(30);
    for (const p of fortress) expect(p.fen.split(' ')).toHaveLength(6);
    // Both parities are sampled: Black is to move in plenty of positions and defends too.
    const blackToMove = quiet.filter((p) => p.fen.split(' ')[1] === 'b').length;
    expect(blackToMove).toBeGreaterThan(quiet.length / 4);
    expect(quiet.length - blackToMove).toBeGreaterThan(quiet.length / 4);
    expect(fortress.some((p) => p.fen.split(' ')[1] === 'b')).toBe(true);
    expect(fortress.some((p) => p.fen.split(' ')[1] === 'w')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { coachShouldInterrupt, coachVerdict } from './coach';

const cp = (value: number) => ({ type: 'cp' as const, value });

describe('coach verdicts', () => {
  it('lets good moves through and interrupts blunders with an explanation', () => {
    // Before: White to move, equal. After Ne5?? the knight hangs to dxe5 (Black to move, +300 for Black).
    const before = {
      fen: '4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1',
      score: cp(0),
      best: 'f3d4',
      pv: ['f3d4'],
    };
    const after = {
      fen: '4k3/8/3p4/4N3/8/8/8/4K3 b - - 0 1',
      score: cp(300),
      best: 'd6e5',
      pv: ['d6e5'],
    };
    const bad = coachVerdict(before, 'Ne5', 'f3e5', after);
    // Three pawns from an equal position is a 25 % swing: a mistake on the Lichess scale.
    expect(bad.judgement).toBe('mistake');
    expect(bad.loss).toBeGreaterThan(0.2);
    expect(bad.explanation?.motif).toBe('hanging-piece');
    expect(bad.bestSan).toBe('dxe5');
    expect(coachShouldInterrupt(bad)).toBe(true);

    const fine = coachVerdict(before, 'Nd4', 'f3d4', {
      fen: '4k3/8/3p4/8/3N4/8/8/4K3 b - - 0 1',
      score: cp(0),
      best: 'e8e7',
      pv: [],
    });
    expect(fine.judgement).toBe('best');
    expect(fine.explanation).toBeNull();
    expect(coachShouldInterrupt(fine)).toBe(false);

    // A small slip is noted as an inaccuracy but does not stop the game.
    const slip = coachVerdict(before, 'Ng1', 'f3g1', {
      fen: '4k3/8/3p4/8/8/8/8/4K1N1 b - - 0 1',
      score: cp(60),
      best: 'e8e7',
      pv: [],
    });
    expect(['inaccuracy', 'good']).toContain(slip.judgement);
    expect(coachShouldInterrupt(slip)).toBe(false);
  });

  it('treats mate scores as certain outcomes', () => {
    const before = {
      fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
      score: { type: 'mate' as const, value: 1 },
      best: 'a1a8',
      pv: ['a1a8'],
    };
    const after = {
      fen: '6k1/5ppp/8/8/8/8/8/R4K2 b - - 0 1',
      score: cp(-500),
      best: 'g8f8',
      pv: [],
    };
    const verdict = coachVerdict(before, 'Kf1', 'g1f1', after);
    // Still winning, so only an inaccuracy by the numbers — but a missed mate always interrupts.
    expect(verdict.judgement).toBe('inaccuracy');
    expect(verdict.explanation?.motif).toBe('missed-mate');
    expect(coachShouldInterrupt(verdict)).toBe(true);
  });
});

describe('coach and checkmate', () => {
  it('does not call a mating move a blunder when the engine has no line for the mated position', () => {
    // A back-rank mate: Qa8# against the king on g8 behind its own pawns.
    const before = {
      fen: '6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1',
      score: { type: 'mate' as const, value: 1 },
      best: 'a1a8',
      pv: ['a1a8'],
    };
    const after = { fen: 'Q5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1', score: null, best: null, pv: [] };
    const verdict = coachVerdict(before, 'Qa8#', 'a1a8', after);
    expect(verdict.judgement).toBe('best');
    expect(verdict.loss).toBe(0);
    // Even a mate the engine did not list first is a win, not a lost position.
    const other = coachVerdict({ ...before, best: 'a1b1' }, 'Qa8#', 'a1a8', after);
    expect(other.loss).toBe(0);
    expect(coachShouldInterrupt(other)).toBe(false);
  });
});

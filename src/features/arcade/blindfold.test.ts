import { describe, expect, it } from 'vitest';
import { BLINDFOLD_PEEKS, BLINDFOLD_SCORING, blindfoldScore, describeBlindfold } from './blindfold';

describe('blindfold scoring', () => {
  it('pays for the result and the unused peeks, times the engine level', () => {
    expect(blindfoldScore('win', 0, 1)).toBe(100 + BLINDFOLD_PEEKS * 15);
    expect(blindfoldScore('win', 0, 4)).toBe((100 + BLINDFOLD_PEEKS * 15) * 4);
    expect(blindfoldScore('win', BLINDFOLD_PEEKS, 8)).toBe(800);
    expect(blindfoldScore('draw', 1, 3)).toBe((50 + 2 * 15) * 3);
    // A stronger engine always counts for more than a weaker one, peeks or not.
    expect(blindfoldScore('win', BLINDFOLD_PEEKS, 2)).toBeGreaterThan(blindfoldScore('win', 0, 1));
  });

  it('pays nothing for a loss: resigning at once is not worth 45 points', () => {
    expect(blindfoldScore('loss', 0, 1)).toBe(0);
    expect(blindfoldScore('loss', 0, 8)).toBe(0);
    expect(blindfoldScore('loss', 2, 5)).toBe(0);
  });

  it('describes the game, with the spare peeks only when they counted', () => {
    expect(describeBlindfold('win', 1, 'Level 3')).toBe('Won vs Level 3 with 2 peeks to spare');
    expect(describeBlindfold('draw', 2, 'Level 1')).toBe('Drew vs Level 1 with 1 peek to spare');
    expect(describeBlindfold('loss', 0, 'Level 2')).toBe('Lost vs Level 2');
    expect(BLINDFOLD_SCORING).toMatch(/times the engine level/);
  });
});

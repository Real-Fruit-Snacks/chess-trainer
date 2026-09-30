import { describe, expect, it } from 'vitest';
import { daysBetween, trainingStreak } from './dates';

describe('trainingStreak', () => {
  it('counts consecutive days ending today or yesterday', () => {
    expect(trainingStreak(['2026-09-27', '2026-09-28', '2026-09-29'], '2026-09-29')).toEqual({
      current: 3,
      best: 3,
    });
    expect(trainingStreak(['2026-09-27', '2026-09-28'], '2026-09-29')).toEqual({
      current: 2,
      best: 2,
    });
    expect(trainingStreak(['2026-09-20', '2026-09-21', '2026-09-27'], '2026-09-29')).toEqual({
      current: 0,
      best: 2,
    });
    expect(trainingStreak([], '2026-09-29')).toEqual({ current: 0, best: 0 });
  });

  it('ignores duplicates and order', () => {
    expect(trainingStreak(['2026-09-29', '2026-09-28', '2026-09-28'], '2026-09-29').current).toBe(
      2,
    );
    expect(daysBetween('2026-09-28', '2026-09-29')).toBe(1);
  });
});

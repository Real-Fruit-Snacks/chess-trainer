import { describe, expect, it } from 'vitest';
import { daysBetween, trainingStreak, formatPgnDate } from './dates';

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

describe('formatPgnDate', () => {
  it('writes a whole PGN date the way timestamps are written', () => {
    expect(formatPgnDate('2026.09.29')).toBe('29 Sept 2026');
    expect(formatPgnDate(' 1858.11.02 ')).toBe('2 Nov 1858');
  });

  it('keeps just the year of a partial or impossible date', () => {
    expect(formatPgnDate('2026.??.??')).toBe('2026');
    expect(formatPgnDate('2026.09.??')).toBe('2026');
    expect(formatPgnDate('2026.02.31')).toBe('2026');
  });

  it('says nothing for an unknown or malformed date', () => {
    expect(formatPgnDate(undefined)).toBeNull();
    expect(formatPgnDate('????.??.??')).toBeNull();
    expect(formatPgnDate('29/09/2026')).toBeNull();
  });
});

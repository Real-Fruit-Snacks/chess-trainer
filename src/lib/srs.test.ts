import { describe, expect, it } from 'vitest';
import { DAY_MS, describeDue, isDue, isNew, newCard, reviewCard } from './srs';

describe('srs', () => {
  const now = 1_700_000_000_000;

  it('schedules 1 day, then 6 days, then ease-multiplied intervals', () => {
    let card = newCard(now);
    expect(isNew(card)).toBe(true);
    expect(isDue(card, now)).toBe(true);
    card = reviewCard(card, 5, now);
    expect(card.interval).toBe(1);
    expect(card.due).toBe(now + DAY_MS);
    expect(isDue(card, now)).toBe(false);
    card = reviewCard(card, 4, now + DAY_MS);
    expect(card.interval).toBe(6);
    card = reviewCard(card, 4, now + 7 * DAY_MS);
    expect(card.interval).toBe(Math.round(6 * card.ease));
    expect(card.reps).toBe(3);
  });

  it('resets on a lapse and lowers the ease', () => {
    let card = reviewCard(reviewCard(newCard(now), 5, now), 5, now + DAY_MS);
    const ease = card.ease;
    card = reviewCard(card, 1, now + 2 * DAY_MS);
    expect(card.reps).toBe(0);
    expect(card.interval).toBe(0);
    expect(card.lapses).toBe(1);
    expect(card.ease).toBeLessThan(ease);
    expect(card.due - (now + 2 * DAY_MS)).toBe(10 * 60_000);
  });

  it('never drops the ease below 1.3', () => {
    let card = newCard(now);
    for (let i = 0; i < 20; i++) card = reviewCard(card, 0, now);
    expect(card.ease).toBe(1.3);
  });

  it('describes due dates', () => {
    expect(describeDue(undefined, now)).toBe('now');
    expect(describeDue({ ...newCard(now), due: now + DAY_MS }, now)).toBe('tomorrow');
    expect(describeDue({ ...newCard(now), due: now + 3 * DAY_MS }, now)).toBe('in 3 days');
  });
});

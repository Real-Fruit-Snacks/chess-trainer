import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  dayDifference,
  describeDue,
  DUE_HOUR,
  dueAt,
  isDue,
  isNew,
  newCard,
  reviewCard,
} from './srs';

describe('srs', () => {
  const now = 1_700_000_000_000;

  it('schedules 1 day, then 6 days, then ease-multiplied intervals', () => {
    let card = newCard(now);
    expect(isNew(card)).toBe(true);
    expect(isDue(card, now)).toBe(true);
    card = reviewCard(card, 5, now);
    expect(card.interval).toBe(1);
    expect(card.due).toBe(dueAt(now, 1));
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

  it('a lapsed card is relearning, not new', () => {
    const lapsed = reviewCard(reviewCard(newCard(now), 5, now), 1, now + DAY_MS);
    expect(lapsed.reps).toBe(0);
    expect(isNew(lapsed)).toBe(false);
    expect(isNew(undefined)).toBe(true);
    expect(isNew(newCard(now))).toBe(true);
  });

  it('never drops the ease below 1.3', () => {
    let card = newCard(now);
    for (let i = 0; i < 20; i++) card = reviewCard(card, 0, now);
    expect(card.ease).toBe(1.3);
  });

  it('describes due dates by calendar day', () => {
    expect(describeDue(undefined, now)).toBe('now');
    expect(describeDue({ ...newCard(now), due: dueAt(now, 1) }, now)).toBe('tomorrow');
    expect(describeDue({ ...newCard(now), due: dueAt(now, 3) }, now)).toBe('in 3 days');
    expect(describeDue({ ...newCard(now), due: now + 60_000 }, now)).toBe('later today');
  });

  it('lands whole-day intervals at 04:00 local on the target day, sub-day ones as they are', () => {
    const lateEvening = new Date(2026, 9, 3, 23, 0).getTime();
    const due = new Date(dueAt(lateEvening, 1));
    expect(due.getDate()).toBe(4);
    expect(due.getHours()).toBe(DUE_HOUR);
    expect(due.getMinutes()).toBe(0);
    // Reviewed at 23:00, due tomorrow: five hours away, but "tomorrow" all the same.
    expect(dayDifference(lateEvening, due.getTime())).toBe(1);
    const earlyMorning = new Date(2026, 9, 3, 2, 0).getTime();
    expect(new Date(dueAt(earlyMorning, 1)).getDate()).toBe(4);
    expect(new Date(dueAt(earlyMorning, 6)).getDate()).toBe(9);
    // The learning step (ten minutes) is not moved to the next morning.
    expect(dueAt(lateEvening, 10 / (24 * 60))).toBe(lateEvening + 10 * 60_000);
    expect(dueAt(lateEvening, 0.5)).toBe(lateEvening + DAY_MS / 2);
  });
});

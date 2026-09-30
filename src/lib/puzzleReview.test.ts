import { describe, expect, it } from 'vitest';
import { dueReviews, nextReview, scheduleFailed, scheduleSolved } from './puzzleReview';
import { DAY_MS } from './srs';

const meta = { id: 'p1', rating: 1400, themes: 'fork short' };
const now = 1_700_000_000_000;

describe('puzzle review scheduling', () => {
  it('brings a missed puzzle back tomorrow and counts lapses', () => {
    const first = scheduleFailed(undefined, meta, now);
    expect(first).toMatchObject({ id: 'p1', step: 0, lapses: 0, due: now + DAY_MS });
    const again = scheduleFailed(first, meta, now + 5 * DAY_MS);
    expect(again.lapses).toBe(1);
    expect(again.step).toBe(0);
    expect(again.addedAt).toBe(now);
  });

  it('spaces solves out 1 → 3 → 7 → 14 → 30 days and then graduates', () => {
    let card = scheduleFailed(undefined, meta, now);
    const intervals: number[] = [];
    let t = now;
    for (let i = 0; i < 5; i++) {
      const next = scheduleSolved(card, t);
      if (!next) {
        intervals.push(-1);
        break;
      }
      intervals.push((next.due - t) / DAY_MS);
      card = next;
      t = next.due;
    }
    expect(intervals).toEqual([3, 7, 14, 30, -1]);
  });

  it('does not advance when a hint was used', () => {
    const card = scheduleFailed(undefined, meta, now);
    const next = scheduleSolved(card, now, { hintUsed: true });
    expect(next?.step).toBe(0);
    expect(next?.due).toBe(now + DAY_MS);
  });

  it('lists due cards earliest first', () => {
    const cards = {
      a: { ...scheduleFailed(undefined, { ...meta, id: 'a' }, now), due: now - 1000 },
      b: { ...scheduleFailed(undefined, { ...meta, id: 'b' }, now), due: now - 5000 },
      c: scheduleFailed(undefined, { ...meta, id: 'c' }, now),
    };
    expect(dueReviews(cards, now).map((c) => c.id)).toEqual(['b', 'a']);
    expect(nextReview(cards)?.id).toBe('b');
    expect(nextReview({})).toBeNull();
  });
});

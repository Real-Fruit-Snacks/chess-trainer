/**
 * A small SM-2 style spaced-repetition scheduler (the algorithm behind Anki
 * and SuperMemo), used for opening repertoire moves. Pure and testable.
 */
export interface SrsCard {
  /** Easiness factor, ≥ 1.3. */
  ease: number;
  /** Current interval in days (0 for cards still being learned). */
  interval: number;
  /** Timestamp (ms) when the card is next due. */
  due: number;
  /** Consecutive successful reviews. */
  reps: number;
  lapses: number;
  lastReviewed: number | null;
}

export const DAY_MS = 86_400_000;
const LEARNING_STEP_MS = 10 * 60_000;
/** Cards due on a later day come due at this local hour, when the day starts for most people. */
export const DUE_HOUR = 4;

/**
 * When a card reviewed at `now` is next due. Intervals shorter than a day are
 * taken literally; whole days land at 04:00 local time on the target day, so a
 * card reviewed at 23:00 with a one-day interval is "tomorrow", not "in an
 * hour", and the queue does not drift later through the day with every review.
 */
export function dueAt(now: number, days: number): number {
  if (days < 1) return now + days * DAY_MS;
  const target = new Date(now);
  target.setDate(target.getDate() + Math.round(days));
  target.setHours(DUE_HOUR, 0, 0, 0);
  return target.getTime();
}

/** Whole local calendar days from `now` to `due` (negative when overdue). */
export function dayDifference(now: number, due: number): number {
  const a = new Date(now);
  const b = new Date(due);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / DAY_MS);
}

export function newCard(now: number): SrsCard {
  return { ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, lastReviewed: null };
}

/** Quality of a recall on the SM-2 scale: 0–2 = forgot, 3–5 = remembered. */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

export function reviewCard(card: SrsCard, quality: Quality, now: number): SrsCard {
  if (quality < 3) {
    return {
      ...card,
      reps: 0,
      interval: 0,
      lapses: card.lapses + 1,
      due: now + LEARNING_STEP_MS,
      lastReviewed: now,
      ease: Math.max(1.3, card.ease - 0.2),
    };
  }
  const reps = card.reps + 1;
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(card.interval * card.ease);
  const ease = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  return {
    ...card,
    reps,
    interval,
    ease,
    due: dueAt(now, interval),
    lastReviewed: now,
  };
}

export function isDue(card: SrsCard | undefined, now: number): boolean {
  return !card || card.due <= now;
}

/** Never reviewed. A lapsed card has `reps` 0 too, but it is relearning, not new. */
export function isNew(card: SrsCard | undefined): boolean {
  return !card || (card.reps === 0 && card.lapses === 0 && card.lastReviewed === null);
}

/** Human-readable "in 3 days" / "now" for the UI. */
export function describeDue(card: SrsCard | undefined, now: number): string {
  if (!card || card.due <= now) return 'now';
  const days = dayDifference(now, card.due);
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

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
    due: now + interval * DAY_MS,
    lastReviewed: now,
  };
}

export function isDue(card: SrsCard | undefined, now: number): boolean {
  return !card || card.due <= now;
}

export function isNew(card: SrsCard | undefined): boolean {
  return !card || card.reps === 0;
}

/** Human-readable "in 3 days" / "now" for the UI. */
export function describeDue(card: SrsCard | undefined, now: number): string {
  if (!card || card.due <= now) return 'now';
  const days = Math.round((card.due - now) / DAY_MS);
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

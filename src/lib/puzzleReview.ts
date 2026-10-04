import { dueAt } from './srs';

/**
 * Scheduling for the puzzle review queue ("mistakes come back"). Simpler
 * than SM-2 on purpose: a missed puzzle returns after one day, and every
 * clean solve pushes it further out until it graduates after 30 days.
 */
export const PUZZLE_REVIEW_STEPS_DAYS = [1, 3, 7, 14, 30] as const;

export interface PuzzleReviewCard {
  id: string;
  rating: number;
  themes: string;
  /** Index into PUZZLE_REVIEW_STEPS_DAYS. */
  step: number;
  due: number;
  lapses: number;
  addedAt: number;
}

/** A puzzle was missed: (re)start the schedule at step 0, due tomorrow (04:00 local). */
export function scheduleFailed(
  existing: PuzzleReviewCard | undefined,
  meta: { id: string; rating: number; themes: string },
  now: number,
): PuzzleReviewCard {
  return {
    id: meta.id,
    rating: meta.rating,
    themes: meta.themes,
    step: 0,
    due: dueAt(now, PUZZLE_REVIEW_STEPS_DAYS[0] ?? 1),
    lapses: (existing?.lapses ?? 0) + (existing ? 1 : 0),
    addedAt: existing?.addedAt ?? now,
  };
}

/**
 * A queued puzzle was solved during review. Returns the rescheduled card, or
 * null when it has graduated out of the queue. Solving with a hint keeps the
 * current step rather than advancing.
 */
export function scheduleSolved(
  card: PuzzleReviewCard,
  now: number,
  options: { hintUsed?: boolean } = {},
): PuzzleReviewCard | null {
  const step = options.hintUsed ? card.step : card.step + 1;
  const days = PUZZLE_REVIEW_STEPS_DAYS[step];
  if (days === undefined) return null;
  return { ...card, step, due: dueAt(now, days) };
}

/** Cards that are due, earliest first. */
export function dueReviews(
  cards: Record<string, PuzzleReviewCard>,
  now: number,
): PuzzleReviewCard[] {
  return Object.values(cards)
    .filter((c) => c.due <= now)
    .sort((a, b) => a.due - b.due);
}

/** The next card to come due, if any. */
export function nextReview(cards: Record<string, PuzzleReviewCard>): PuzzleReviewCard | null {
  const all = Object.values(cards).sort((a, b) => a.due - b.due);
  return all[0] ?? null;
}

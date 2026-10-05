import { HUMAN_MAX_RATING, HUMAN_MIN_RATING, HUMAN_RATING_STEP } from '@/engine/maia/ratings';
import type { LichessRatings } from './auth';

export interface LichessRatingHint {
  /** The human-like opponent's nearest rating. */
  rating: number;
  /** The Lichess rating it comes from. */
  perf: 'rapid' | 'blitz' | 'classical';
  lichess: number;
}

const PERFS = ['rapid', 'blitz', 'classical'] as const;

/**
 * A starting rating for the human-like opponent from the account's Lichess
 * game ratings (Maia learned from Lichess games, so the scales match): rapid
 * first, then blitz, then classical — a settled rating before a provisional
 * one — rounded to the opponent's steps.
 */
export function maiaRatingFromLichess(ratings: LichessRatings | null): LichessRatingHint | null {
  if (!ratings) return null;
  const known = PERFS.flatMap((perf) => {
    const value = ratings[perf];
    return value ? [{ perf, value }] : [];
  });
  const pick = known.find((k) => !k.value.prov) ?? known[0];
  if (!pick) return null;
  const rounded = Math.round(pick.value.rating / HUMAN_RATING_STEP) * HUMAN_RATING_STEP;
  return {
    rating: Math.min(HUMAN_MAX_RATING, Math.max(HUMAN_MIN_RATING, rounded)),
    perf: pick.perf,
    lichess: pick.value.rating,
  };
}

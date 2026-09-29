/**
 * Elo-style rating for the puzzle trainer.
 *
 * Puzzles carry a fixed rating (from the Lichess database). The player's
 * rating moves toward or away from each puzzle's rating depending on the
 * result, with a larger K-factor while the rating is still provisional so new
 * players converge on their level within a couple of dozen puzzles.
 */
export const RATING_MIN = 100;
export const RATING_MAX = 3500;
export const PROVISIONAL_GAMES = 30;

export function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

export function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < 10) return 60;
  if (gamesPlayed < PROVISIONAL_GAMES) return 40;
  return 20;
}

export interface RatingUpdate {
  before: number;
  after: number;
  delta: number;
}

/**
 * @param score 1 for a solve, 0 for a fail; use 0.5 when a hint was used.
 */
export function updateRating(
  playerRating: number,
  puzzleRating: number,
  score: 0 | 0.5 | 1,
  gamesPlayed: number,
): RatingUpdate {
  const expected = expectedScore(playerRating, puzzleRating);
  const k = kFactor(gamesPlayed);
  const raw = playerRating + k * (score - expected);
  const after = Math.round(Math.max(RATING_MIN, Math.min(RATING_MAX, raw)));
  return { before: playerRating, after, delta: after - playerRating };
}

/** Self-assessment options shown to first-time users. */
export const STARTING_RATINGS = [
  { id: 'new', label: 'I am new to chess', rating: 500 },
  { id: 'beginner', label: 'I know the rules and play occasionally', rating: 800 },
  { id: 'casual', label: 'I play regularly online', rating: 1200 },
  { id: 'club', label: 'I play in clubs or tournaments', rating: 1600 },
  { id: 'strong', label: 'I am a strong tournament player', rating: 2000 },
] as const;

export type StartingRatingId = (typeof STARTING_RATINGS)[number]['id'];

export const DEFAULT_START_RATING = 1000;

/** Rounds a rating for display ("1,247") using the site locale. */
export function formatRating(rating: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(rating);
}

/** Human label for a rating band, used in progress summaries. */
export function ratingBand(rating: number): string {
  if (rating < 800) return 'Beginner';
  if (rating < 1100) return 'Novice';
  if (rating < 1400) return 'Casual';
  if (rating < 1700) return 'Club';
  if (rating < 2000) return 'Intermediate';
  if (rating < 2300) return 'Advanced';
  if (rating < 2600) return 'Expert';
  return 'Master';
}

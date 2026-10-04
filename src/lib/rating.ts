/**
 * The puzzle rating: constants and presentation helpers. The maths is
 * Glicko-2 (lib/glicko.ts) and the value of an attempt is lib/puzzleScore.ts.
 *
 * Puzzles carry a fixed rating and deviation from the Lichess database. The
 * player's rating moves toward or away from each puzzle's rating depending on
 * the result, quickly while the deviation is large and slowly once it has
 * settled; the deviation grows again during long breaks.
 */
export { RATING_MAX, RATING_MIN } from './glicko';

/** Deviation given to a self-assessed starting rating: trusted, but only so far. */
export const SELF_ASSESSED_RD = 250;
/** Deviation assumed for a puzzle without one in the data. */
export const DEFAULT_PUZZLE_RD = 90;
/** The level-finding run: this many rated puzzles from a very uncertain start. */
export const CALIBRATION_PUZZLES = 12;
export const CALIBRATION_START_RATING = 1100;

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
export function formatRating(rating: number, locale = 'en-GB'): string {
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

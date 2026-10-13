import type { Puzzle } from '@/features/puzzles/puzzleService';
import { localDateKey, trainingStreak } from '@/lib/dates';
import { INITIAL_RD } from '@/lib/glicko';
import { scheduleFailed } from '@/lib/puzzleReview';
import {
  addThemeStats,
  capReviews,
  type GameRecord,
  keepReviewedPuzzles,
  type LichessRoundCount,
  MAX_GAMES,
  MAX_HISTORY,
  MAX_LICHESS_ROUNDS,
  MAX_TRAINING_DAYS,
  pruneSeen,
  type PuzzleOutcome,
  useProgress,
} from '@/store/progress';
import type { LichessRound } from './puzzles';

/**
 * What the sync changes in the progress store. Kept here, with the sync,
 * rather than as store actions: only the sync needs them, and the store's
 * code is part of every start-up.
 */

/**
 * Takes the Lichess puzzle rating as this profile's own: the level is then
 * known, so onboarding and any calibration are done. A rating that has not
 * moved changes nothing.
 */
export function adoptLichessRating(rating: number, rd: number, now = Date.now()): void {
  if (!Number.isFinite(rating) || !Number.isFinite(rd)) return;
  const state = useProgress.getState();
  const rounded = Math.round(rating);
  const deviation = Math.min(INITIAL_RD, Math.max(45, rd));
  const moved =
    Math.round(state.puzzleRating) !== rounded ||
    Math.round(state.puzzleRd) !== Math.round(deviation);
  if (!moved && state.onboarded && !state.calibration) return;
  useProgress.setState({
    onboarded: true,
    puzzleRating: rounded,
    puzzleRd: deviation,
    // Lichess's deviation already counts the time away: no second inflation here.
    lastRatedAt: now,
    calibration: null,
    ratingHistory:
      Math.round(state.puzzleRating) === rounded
        ? state.ratingHistory
        : [...state.ratingHistory, { at: now, rating: rounded }].slice(-MAX_HISTORY),
  });
}

/**
 * Brings in rounds from the Lichess puzzle history: puzzles not seen here
 * count as seen and join the theme statistics (and the rounds counted, so
 * device sync can tell a round two devices both brought in), their days count
 * as training days, and misses whose puzzle is at hand (in `puzzles`, or kept
 * from before) join the review queue. Returns how many puzzles were new here
 * and how many cards were added.
 */
export function mergeLichessRounds(
  rounds: readonly LichessRound[],
  puzzles: readonly Puzzle[],
  now = Date.now(),
): { added: number; reviews: number } {
  const state = useProgress.getState();
  if (rounds.length === 0 && puzzles.length === 0) return { added: 0, reviews: 0 };
  // Oldest first, so the newest result for a puzzle is the one that decides.
  const ordered = [...rounds].sort((a, b) => a.date - b.date);
  const seen: Record<string, PuzzleOutcome> = { ...state.seen };
  let themeStats = state.themeStats;
  const counted: LichessRoundCount[] = [];
  const latest = new Map<string, LichessRound>();
  for (const round of ordered) {
    latest.set(round.id, round);
    if (round.id in seen) continue;
    const outcome: PuzzleOutcome = round.win ? 'solved' : 'failed';
    seen[round.id] = outcome;
    themeStats = addThemeStats(themeStats, round.themes, outcome);
    counted.push({ id: round.id, at: round.date, win: round.win, themes: round.themes });
  }
  const added = counted.length;
  const lichessPuzzles = { ...state.lichessPuzzles };
  for (const puzzle of puzzles) lichessPuzzles[puzzle.id] = puzzle;
  const reviews = { ...state.puzzleReviews };
  let reviewsAdded = 0;
  for (const round of latest.values()) {
    if (round.win || reviews[round.id]) continue;
    const puzzle = lichessPuzzles[round.id];
    if (!puzzle) continue;
    reviews[round.id] = scheduleFailed(
      undefined,
      { id: puzzle.id, rating: puzzle.rating, themes: puzzle.themes },
      now,
    );
    reviewsAdded++;
  }
  const puzzleReviews = capReviews(reviews);
  // A day of puzzles on Lichess (or on another device) is a training day here too.
  const days = new Set(state.trainingDays);
  for (const round of rounds) days.add(localDateKey(new Date(round.date)));
  const trainingDays = [...days].sort().slice(-MAX_TRAINING_DAYS);
  useProgress.setState({
    seen: pruneSeen(seen),
    themeStats,
    lichessRounds:
      counted.length === 0
        ? state.lichessRounds
        : [...state.lichessRounds, ...counted]
            .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
            .slice(-MAX_LICHESS_ROUNDS),
    puzzleReviews,
    lichessPuzzles: keepReviewedPuzzles(lichessPuzzles, puzzleReviews),
    trainingDays,
    bestStreak: Math.max(state.bestStreak, trainingStreak(trainingDays).best),
  });
  return { added, reviews: reviewsAdded };
}

/** Adds games recorded on other devices (by id; the newest are kept). Returns how many came in. */
export function mergeLichessGames(records: readonly GameRecord[]): number {
  const state = useProgress.getState();
  const known = new Set(state.games.map((g) => g.id));
  const fresh = records.filter((r) => !known.has(r.id));
  if (fresh.length === 0) return 0;
  const games = [...state.games, ...fresh].sort((a, b) => b.at - a.at).slice(0, MAX_GAMES);
  const kept = fresh.filter((r) => games.includes(r)).length;
  const days = new Set(state.trainingDays);
  for (const record of fresh) days.add(localDateKey(new Date(record.at)));
  const trainingDays = [...days].sort().slice(-MAX_TRAINING_DAYS);
  useProgress.setState({
    games,
    trainingDays,
    bestStreak: Math.max(state.bestStreak, trainingStreak(trainingDays).best),
  });
  return kept;
}

/** Notes where a game went on Lichess. */
export function setGameLichessId(recordId: string, lichessId: string): void {
  const games = useProgress.getState().games;
  if (!games.some((g) => g.id === recordId && g.lichessId !== lichessId)) return;
  useProgress.setState({
    games: games.map((g) => (g.id === recordId ? { ...g, lichessId } : g)),
  });
}

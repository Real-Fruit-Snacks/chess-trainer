import { daysBetween } from '@/lib/dates';
import { displayOpeningName, foldOpeningSpelling } from '@/lib/openings';
import { hashString, seededRandom } from '@/lib/random';
import type { DailyOpeningState } from '@/store/progress';
import type { OpeningLine } from './openingLines';

/**
 * Daily Opening: one line a day, six guesses, Wordle-style feedback per move.
 */
export const MAX_GUESSES = 6;
/** Answers are lines of three to seven moves: long enough to give feedback, short enough to get. */
export const MIN_PLIES = 6;
export const MAX_PLIES = 14;

/** Lines that can be guessed: every unique name in the book (its first line). */
export function guessableLines(lines: readonly OpeningLine[]): OpeningLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (seen.has(line.name)) return false;
    seen.add(line.name);
    return true;
  });
}

/**
 * Lines that can be the answer: the guessable entries of a sensible length.
 * Drawn from the very same entries as the guesses, so the answer's moves are
 * always the ones its name shows in the list (a name whose first line is too
 * short or too long is never the answer, rather than answering with another
 * line of the same name).
 */
export function candidateLines(lines: readonly OpeningLine[]): OpeningLine[] {
  return guessableLines(lines).filter(
    (line) => line.moves.length >= MIN_PLIES && line.moves.length <= MAX_PLIES,
  );
}

/** The answer for a day (YYYY-MM-DD): the same for everyone, different every day. */
export function dailyLine(candidates: readonly OpeningLine[], dateKey: string): OpeningLine {
  const random = seededRandom(hashString(`daily-opening:${dateKey}`));
  const index = Math.floor(random() * candidates.length);
  return candidates[index] as OpeningLine;
}

/** A random answer, for practice outside the daily game. */
export function practiceLine(
  candidates: readonly OpeningLine[],
  random: () => number = Math.random,
): OpeningLine {
  return candidates[Math.floor(random() * candidates.length)] as OpeningLine;
}

export type Tile = 'hit' | 'near' | 'miss' | 'extra';

/**
 * Feedback for a guess, one tile per move of the guess: `hit` when the move is
 * in the right place, `near` when it occurs elsewhere in the answer (each
 * answer move can only be matched once), `miss` otherwise, and `extra` for
 * moves beyond the answer's length.
 */
export function gradeGuess(guess: OpeningLine, answer: OpeningLine): Tile[] {
  const tiles: Tile[] = guess.moves.map(() => 'miss');
  const spare = new Map<string, number>();
  answer.moves.forEach((move, i) => {
    if (guess.moves[i] === move) tiles[i] = 'hit';
    else spare.set(move, (spare.get(move) ?? 0) + 1);
  });
  guess.moves.forEach((move, i) => {
    if (tiles[i] === 'hit') return;
    if (i >= answer.moves.length) {
      tiles[i] = 'extra';
      return;
    }
    const left = spare.get(move) ?? 0;
    if (left > 0) {
      tiles[i] = 'near';
      spare.set(move, left - 1);
    }
  });
  return tiles;
}

/** The answer's moves known for sure: the run of correct moves from the start. */
export function knownPrefix(guesses: readonly OpeningLine[], answer: OpeningLine): string[] {
  const known: string[] = [];
  for (let i = 0; i < answer.moves.length; i++) {
    const move = answer.moves[i];
    if (guesses.some((g) => g.moves[i] === move)) known.push(move as string);
    else break;
  }
  return known;
}

/** Hints that unlock as guesses are used up. */
export function hints(answer: OpeningLine, wrongGuesses: number): string[] {
  const out = [`${answer.moves.length} moves (${Math.ceil(answer.moves.length / 2)} for White).`];
  out.push(`ECO ${answer.eco.charAt(0)}.`);
  if (wrongGuesses >= 2) out.push(`It starts with 1. ${answer.moves[0] ?? '?'}.`);
  if (wrongGuesses >= 3) out.push(`ECO ${answer.eco}.`);
  if (wrongGuesses >= 4) {
    const family = answer.name.split(':')[0] ?? answer.name;
    out.push(`It is a line of the ${displayOpeningName(family)}.`);
  }
  return out;
}

/**
 * Up to `limit` opening names matching what was typed, shortest names first.
 * "Defence" finds "Defense" and "Centre" finds "Center": the names are shown the
 * British way but kept as the opening table spells them.
 */
export function searchLines(
  lines: readonly OpeningLine[],
  query: string,
  limit = 12,
): OpeningLine[] {
  const q = foldOpeningSpelling(query.trim());
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  return lines
    .filter((line) => {
      const name = foldOpeningSpelling(line.name);
      return words.every((w) => name.includes(w));
    })
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * The state for a day: the stored one when it is that day's, a fresh one for
 * a new day (the streak and history kept), and a finished one for a day that
 * is already in the history — a clock set back, or a trip west, never makes a
 * played day playable again.
 */
export function stateForDay(state: DailyOpeningState | null, dateKey: string): DailyOpeningState {
  if (state?.date === dateKey) return state;
  const played = state?.history[dateKey];
  return {
    date: dateKey,
    guesses: [],
    result: played === undefined ? null : played > 0 ? 'solved' : 'failed',
    streak: state?.streak ?? 0,
    bestStreak: state?.bestStreak ?? 0,
    history: state?.history ?? {},
  };
}

/** How many guesses a finished day took (from the history when the guesses are gone). */
export function guessesTaken(state: DailyOpeningState): number {
  return state.guesses.length || (state.history[state.date] ?? 0);
}

/** A game of the day is under way: guessed at least once and not finished. */
export function inProgress(state: DailyOpeningState | null, dateKey: string): boolean {
  return !!state && state.date === dateKey && state.result === null && state.guesses.length > 0;
}

/**
 * The streak as it stands on `today`: the stored one only while it is alive —
 * today solved, or yesterday solved and today still to play. A day missed or
 * failed since then has broken it.
 */
export function liveStreak(state: DailyOpeningState | null, today: string): number {
  if (!state) return 0;
  const todays = state.history[today];
  if (todays !== undefined) return todays > 0 ? state.streak : 0;
  const yesterday = Object.keys(state.history).find(
    (day) => daysBetween(day, today) === 1 && (state.history[day] ?? 0) > 0,
  );
  return yesterday ? state.streak : 0;
}

/** One line about today for the hub: "Today: solved in 3 · streak 4 · best 6". */
export function describeToday(state: DailyOpeningState | null, today: string): string | null {
  if (!state) return null;
  const day = stateForDay(state, today);
  const todayText =
    day.result === 'solved'
      ? `solved in ${guessesTaken(day)}`
      : day.result === 'failed'
        ? 'missed'
        : day.guesses.length > 0
          ? `${day.guesses.length} of ${MAX_GUESSES} guesses`
          : 'not played yet';
  const streak = liveStreak(state, today);
  return [
    `Today: ${todayText}`,
    streak > 0 ? `streak ${streak}` : null,
    state.bestStreak > 0 ? `best ${state.bestStreak}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The day the page shows once the clock has moved on to `now`. The day is
 * frozen while its game is under way (a guess made, no result yet) so midnight
 * never swaps the answer mid-game; a finished day stays on screen until the
 * page is revisited (`revisited`: it was hidden and is shown again), so the
 * result is not snatched away; a day not started moves on at once.
 */
export function dayToShow(
  shown: string,
  now: string,
  state: DailyOpeningState | null,
  revisited: boolean,
): string {
  if (now === shown || inProgress(state, shown)) return shown;
  const finished = state?.date === shown && state.result !== null;
  return finished && !revisited ? shown : now;
}

/** A YYYY-MM-DD day as a local date (not UTC midnight, which is the day before in the west). */
export function dayToDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** The state after a guess: solved, failed (last guess wrong) or still going. */
export function afterGuess(
  state: DailyOpeningState,
  guess: OpeningLine,
  answer: OpeningLine,
): DailyOpeningState {
  if (state.result) return state;
  const guesses = [...state.guesses, guess.name];
  const solved = guess.name === answer.name;
  const failed = !solved && guesses.length >= MAX_GUESSES;
  if (!solved && !failed) return { ...state, guesses };
  return finish({ ...state, guesses }, solved);
}

/** Give up: counts as a miss for the day. */
export function giveUp(state: DailyOpeningState): DailyOpeningState {
  return state.result ? state : finish(state, false);
}

function finish(state: DailyOpeningState, solved: boolean): DailyOpeningState {
  const history = { ...state.history, [state.date]: solved ? state.guesses.length : 0 };
  let streak = 0;
  if (solved) {
    // A streak continues from yesterday's solve; a missed day or a failed day breaks it.
    const yesterday = Object.keys(history).find(
      (day) => daysBetween(day, state.date) === 1 && (history[day] ?? 0) > 0,
    );
    streak = yesterday ? state.streak + 1 : 1;
  }
  return {
    ...state,
    result: solved ? 'solved' : 'failed',
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    history,
  };
}

/** A text summary to paste anywhere. */
export function shareText(dateKey: string, rows: readonly Tile[][], solved: boolean): string {
  const symbol: Record<Tile, string> = { hit: 'G', near: 'Y', miss: '-', extra: '+' };
  const grid = rows.map((row) => row.map((t) => symbol[t]).join('')).join('\n');
  const score = solved ? `${rows.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  return `Daily Opening ${dateKey} ${score}\n${grid}`;
}

/** Moves as numbered PGN movetext: "1. e4 e5 2. Nf3". */
export function movesToPgn(moves: readonly string[]): string {
  return moves.map((move, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${move}` : move)).join(' ');
}

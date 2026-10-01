import { daysBetween } from '@/lib/dates';
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

/** Lines that can be the answer: unique names of a sensible length. */
export function candidateLines(lines: readonly OpeningLine[]): OpeningLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (seen.has(line.name)) return false;
    if (line.moves.length < MIN_PLIES || line.moves.length > MAX_PLIES) return false;
    seen.add(line.name);
    return true;
  });
}

/** Lines that can be guessed: every unique name in the book. */
export function guessableLines(lines: readonly OpeningLine[]): OpeningLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (seen.has(line.name)) return false;
    seen.add(line.name);
    return true;
  });
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
    out.push(`It is a line of the ${family}.`);
  }
  return out;
}

/** Up to `limit` opening names matching what was typed, shortest names first. */
export function searchLines(
  lines: readonly OpeningLine[],
  query: string,
  limit = 12,
): OpeningLine[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  return lines
    .filter((line) => {
      const name = line.name.toLowerCase();
      return words.every((w) => name.includes(w));
    })
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Today's state: yesterday's guesses are cleared, the streak and history kept. */
export function stateForDay(state: DailyOpeningState | null, dateKey: string): DailyOpeningState {
  if (state?.date === dateKey) return state;
  return {
    date: dateKey,
    guesses: [],
    result: null,
    streak: state?.streak ?? 0,
    bestStreak: state?.bestStreak ?? 0,
    history: state?.history ?? {},
  };
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

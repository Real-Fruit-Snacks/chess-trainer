import { pickRandom } from '@/lib/random';
import type { OpeningLine } from './openingLines';

/**
 * Engine Says: a Simon game with chess moves. The engine plays the first few
 * moves of a real opening line, the board resets, and you replay them; each
 * round adds a move. Replay a whole line and a fresh one starts, the moves of
 * the finished line carried into the score.
 */
export const FIRST_ROUND_PLIES = 3;
/** Lines long enough to make a run of it. */
export const MIN_LINE_PLIES = 14;

/** How fast the engine shows the sequence. */
export type Pace = 'normal' | 'slow';
/** Delay between the engine's moves while it shows the sequence. */
export const SHOW_STEP_MS: Record<Pace, number> = { normal: 700, slow: 1400 };
/** Extra pause after the last move before the board resets for the replay. */
export const SHOW_END_PAUSE_MS = 300;

export function sequenceLines(lines: readonly OpeningLine[]): OpeningLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (line.moves.length < MIN_LINE_PLIES || seen.has(line.name)) return false;
    seen.add(line.name);
    return true;
  });
}

export function pickSequenceLine(
  lines: readonly OpeningLine[],
  random: () => number = Math.random,
): OpeningLine | undefined {
  return pickRandom(lines, random);
}

/** How many plies round `round` (1-based) asks for. */
export function pliesForRound(round: number): number {
  return FIRST_ROUND_PLIES + round - 1;
}

/**
 * The score after failing (or stopping) in `round`: the moves of every line
 * replayed in full so far (`carried`) plus the longest sequence of the current
 * line replayed in full.
 */
export function scoreAfterRound(round: number, carried = 0): number {
  return carried + (round <= 1 ? 0 : pliesForRound(round - 1));
}

/** The score carried on after a whole line of `plies` moves has been replayed. */
export function carryLine(carried: number, plies: number): number {
  return carried + plies;
}

export function describeEngineSays(score: number): string {
  return `${score} move${score === 1 ? '' : 's'} replayed from memory`;
}

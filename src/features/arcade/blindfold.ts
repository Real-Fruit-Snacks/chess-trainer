/**
 * Blindfold game scoring: the result plus the peeks you did not need, times
 * the engine level, so a win against a stronger engine always counts for more.
 * Unused peeks only pay after a win or a draw — resigning at once earns nothing.
 */
export const BLINDFOLD_PEEKS = 3;
/** How long one peek shows the pieces. */
export const PEEK_MS = 2000;

export type Verdict = 'win' | 'loss' | 'draw';

const BASE: Record<Verdict, number> = { win: 100, loss: 0, draw: 50 };
export const PER_UNUSED_PEEK = 15;

export function blindfoldScore(verdict: Verdict, peeksUsed: number, levelId: number): number {
  if (verdict === 'loss') return 0;
  const unused = Math.max(0, BLINDFOLD_PEEKS - peeksUsed);
  return (BASE[verdict] + unused * PER_UNUSED_PEEK) * Math.max(1, levelId);
}

export function describeBlindfold(verdict: Verdict, peeksUsed: number, levelName: string): string {
  if (verdict === 'loss') return `Lost vs ${levelName}`;
  const unused = Math.max(0, BLINDFOLD_PEEKS - peeksUsed);
  const result = verdict === 'win' ? 'Won' : 'Drew';
  return `${result} vs ${levelName} with ${unused} peek${unused === 1 ? '' : 's'} to spare`;
}

/** How the score is worked out, for the page. */
export const BLINDFOLD_SCORING = `A win is 100, a draw 50, plus ${PER_UNUSED_PEEK} for every peek you did not need — all times the engine level (1 to 8). A loss scores nothing.`;

/** Blindfold game scoring: the result, plus the peeks you did not need. */
export const BLINDFOLD_PEEKS = 3;
/** How long one peek shows the pieces. */
export const PEEK_MS = 2000;

export type Verdict = 'win' | 'loss' | 'draw';

const BASE: Record<Verdict, number> = { win: 100, loss: 0, draw: 50 };
const PER_UNUSED_PEEK = 15;

export function blindfoldScore(verdict: Verdict, peeksUsed: number): number {
  const unused = Math.max(0, BLINDFOLD_PEEKS - peeksUsed);
  return BASE[verdict] + unused * PER_UNUSED_PEEK;
}

export function describeBlindfold(verdict: Verdict, peeksUsed: number, levelName: string): string {
  const unused = Math.max(0, BLINDFOLD_PEEKS - peeksUsed);
  const result = verdict === 'win' ? 'Won' : verdict === 'draw' ? 'Drew' : 'Lost';
  return `${result} vs ${levelName} with ${unused} peek${unused === 1 ? '' : 's'} to spare`;
}

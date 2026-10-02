/**
 * Hands a game to the analysis board: the PGN goes into session storage and
 * `/analyze?from=game` picks it up. Kept apart from the pages that use it so
 * importing the key never pulls a whole page into another page's chunk.
 */
export const HANDOFF_PGN_KEY = 'chess-trainer:handoff-pgn';

/** Stores the PGN for the analysis board and returns the path that loads it. */
export function handOffToAnalysis(pgn: string): string {
  try {
    sessionStorage.setItem(HANDOFF_PGN_KEY, pgn);
  } catch {
    // Storage blocked: the analysis board simply opens empty.
  }
  return '/analyze?from=game';
}

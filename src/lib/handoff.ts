import type { LongColor } from '@/chess/types';

/**
 * Hands a game to the analysis board: the PGN goes into session storage and
 * `/analyze?from=game` picks it up. Kept apart from the pages that use it so
 * importing the key never pulls a whole page into another page's chunk.
 */
export const HANDOFF_PGN_KEY = 'chess-trainer:handoff-pgn';

export interface HandoffOptions {
  /** The side the learner played: the board opens from that side. */
  orientation?: LongColor;
}

export interface Handoff {
  pgn: string;
  orientation: LongColor | null;
}

/** Stores the PGN for the analysis board and returns the path that loads it. */
export function handOffToAnalysis(pgn: string, options: HandoffOptions = {}): string {
  try {
    sessionStorage.setItem(
      HANDOFF_PGN_KEY,
      JSON.stringify({ pgn, orientation: options.orientation ?? null }),
    );
  } catch {
    // Storage blocked: the analysis board simply opens empty.
  }
  return '/analyze?from=game';
}

/**
 * Reads a pending hand-off without clearing it (so a reload still finds it);
 * call `clearHandoff` once the game is on the board. Plain PGN text written
 * by older builds is still understood.
 */
export function readHandoff(): Handoff | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(HANDOFF_PGN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { pgn?: unknown; orientation?: unknown };
      if (typeof parsed.pgn === 'string') {
        return {
          pgn: parsed.pgn,
          orientation:
            parsed.orientation === 'white' || parsed.orientation === 'black'
              ? parsed.orientation
              : inferOrientation(parsed.pgn),
        };
      }
    } catch {
      // Not JSON after all: treat it as PGN text.
    }
  }
  return { pgn: raw, orientation: inferOrientation(raw) };
}

export function clearHandoff(): void {
  try {
    sessionStorage.removeItem(HANDOFF_PGN_KEY);
  } catch {
    // ignore
  }
}

/** Games against the engine name the learner "You"; anything else opens from White's side. */
function inferOrientation(pgn: string): LongColor | null {
  if (pgn.includes('[Black "You"]')) return 'black';
  if (pgn.includes('[White "You"]')) return 'white';
  return null;
}

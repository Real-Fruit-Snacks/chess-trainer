import { useEffect } from 'react';
import { useFocus } from '@/app/focus';
import { toast } from '@/components/ui/toastStore';
import { useSettings } from '@/store/settings';

/**
 * Helpers shared by the arcade games played against the engine (Hand & Brain,
 * Odds Ladder, Army Draft, Fortress, Blindfold and the Simul).
 */

/**
 * Focus mode, as on the Play page: with the setting on (Settings → Play), the
 * shell hides its header and navigation while `active` — a game is on.
 */
export function useArcadeFocus(active: boolean): void {
  const playFocus = useSettings((s) => s.playFocus);
  const setFocus = useFocus((s) => s.set);
  const on = playFocus && active;
  useEffect(() => {
    setFocus(on);
    return () => setFocus(false);
  }, [on, setFocus]);
}

/** Copies a game's PGN, with a toast either way. */
export async function copyPgn(pgn: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(pgn);
    toast('PGN copied to clipboard.');
  } catch {
    toast('Could not access the clipboard.', { tone: 'warning' });
  }
}

/** "PGN" headers for an arcade game against the engine, as the Play page writes them. */
export function arcadeHeaders({
  event,
  playerColor,
  engine,
  result,
  date = new Date(),
}: {
  /** What the game is, e.g. "Hand & Brain · Brain". */
  event: string;
  playerColor: 'white' | 'black';
  /** The engine's name, e.g. "Stockfish (level 3 · Casual)". */
  engine: string;
  result: string;
  date?: Date;
}): Record<string, string> {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    Event: `Chess Trainer — ${event}`,
    Site: 'Chess Trainer',
    Date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    White: playerColor === 'white' ? 'You' : engine,
    Black: playerColor === 'black' ? 'You' : engine,
    Result: result,
  };
}

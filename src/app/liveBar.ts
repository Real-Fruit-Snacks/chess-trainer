import { create } from 'zustand';
import { storageKeyFor } from '@/store/profiles';

/**
 * Whether a live game this device took part in may still be on: one kept by
 * the live-games code (features/live/seats.ts) that is not known to be over
 * and is younger than a game can last. The bar then loads and checks on it,
 * so a game survives the app being closed, or reloaded on another page.
 */
function mayBePlaying(): boolean {
  try {
    const now = Date.now();
    for (const key of ['chess-trainer:live-seats', 'chess-trainer:live-lichess']) {
      const games = JSON.parse(localStorage.getItem(storageKeyFor(key)) ?? '{}') as Record<
        string,
        { at?: unknown; over?: unknown } | null
      >;
      for (const game of Object.values(games)) {
        if (typeof game?.at === 'number' && now - game.at < 6 * 3_600_000 && !game.over) {
          return true;
        }
      }
    }
  } catch {
    // Nothing to read: nothing to check on.
  }
  return false;
}

/**
 * Whether the live-games bar has something to say (a game posted and waiting,
 * a game just paired, a game in progress elsewhere in the app, or one that may
 * still be on since before this start). The shell only loads the bar itself
 * once this is on, so start-up carries none of its code. Not persisted: the
 * live-games code turns it on when it has a reason to.
 */
export const useLiveBar = create<{ active: boolean; set: (active: boolean) => void }>((set) => ({
  active: mayBePlaying(),
  set: (active) => set({ active }),
}));

import { create } from 'zustand';
import { storageKeyFor } from '@/store/profiles';

/**
 * Whether a live game this device took part in may still be on: one kept by
 * the live-games code (features/live/seats.ts) that is not known to be over
 * and is younger than a game can last (a correspondence game, played over
 * days, lasts a year at most), or a group room it is a member of (a race
 * room, an analysis room: features/live/rooms.ts). The bar then loads and checks on it, so a game
 * survives the app being closed, or reloaded on another page, and a
 * correspondence game where it is your move shows.
 */
function mayBePlaying(): boolean {
  try {
    const now = Date.now();
    const keys = [
      'chess-trainer:live-seats',
      'chess-trainer:live-lichess',
      'chess-trainer:live-rooms',
    ];
    for (const key of keys) {
      const games = JSON.parse(localStorage.getItem(storageKeyFor(key)) ?? '{}') as Record<
        string,
        { at?: unknown; over?: unknown; corr?: unknown } | null
      >;
      for (const game of Object.values(games)) {
        const lasts = game?.corr === true ? 366 * 86_400_000 : 6 * 3_600_000;
        if (typeof game?.at === 'number' && now - game.at < lasts && !game.over) {
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

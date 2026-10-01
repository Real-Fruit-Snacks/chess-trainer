import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistStorage';
import type { ImportedGame } from '@/lib/gameImport';
import { hashString } from '@/lib/random';
import type { ReviewDigest } from '@/features/games/insights';
import { storageKeyFor } from './profiles';

export type GameSource = 'lichess' | 'chesscom' | 'pgn';

/** A stored review: enough for the games table and the daily plan, not the full move list. */
export interface StoredReview {
  accuracy: { white: number; black: number };
  counts: {
    white: { inaccuracy: number; mistake: number; blunder: number };
    black: { inaccuracy: number; mistake: number; blunder: number };
  };
  depth: number;
  at: number;
  /** Where the errors happened and what kind they were (added in 0.7.0; older reviews lack it). */
  digest?: ReviewDigest;
}

export interface StoredGame extends ImportedGame {
  source: GameSource;
  importedAt: number;
  review: StoredReview | null;
}

export interface GamesState {
  games: Record<string, StoredGame>;
  /** The learner's name as it appears in the games (for colour detection). */
  player: string;
  addGames: (games: ImportedGame[], source: GameSource) => number;
  removeGame: (id: string) => void;
  setPlayer: (player: string) => void;
  setReview: (id: string, review: StoredReview) => void;
  clear: () => void;
}

export const MAX_STORED_GAMES = 200;
export const GAMES_STORAGE_KEY = 'chess-trainer:games';

/** Stable id for a game: its source URL when it has one, else a hash of the PGN. */
export function gameKey(game: Pick<ImportedGame, 'url' | 'pgn'>): string {
  return game.url ?? `pgn-${hashString(game.pgn.replace(/\s+/g, ' ').trim()).toString(36)}`;
}

export const useGames = create<GamesState>()(
  persist(
    (set, get) => ({
      games: {},
      player: '',

      addGames: (incoming, source) => {
        const games = { ...get().games };
        const now = Date.now();
        let added = 0;
        for (const game of incoming) {
          const id = gameKey(game);
          if (games[id]) continue;
          games[id] = { ...game, id, source, importedAt: now, review: null };
          added++;
        }
        if (added === 0) return 0;
        const kept = Object.values(games)
          .sort((a, b) => b.importedAt - a.importedAt || (b.timestamp ?? 0) - (a.timestamp ?? 0))
          .slice(0, MAX_STORED_GAMES);
        set({ games: Object.fromEntries(kept.map((g) => [g.id, g])) });
        return added;
      },

      removeGame: (id) => {
        const games = { ...get().games };
        delete games[id];
        set({ games });
      },

      setPlayer: (player) => set({ player: player.trim() }),

      setReview: (id, review) => {
        const game = get().games[id];
        if (!game) return;
        set({ games: { ...get().games, [id]: { ...game, review } } });
      },

      clear: () => set({ games: {} }),
    }),
    {
      name: storageKeyFor(GAMES_STORAGE_KEY),
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ games: state.games, player: state.player }),
    },
  ),
);

/** Games sorted newest first (by when they were played, then imported). */
export function sortedGames(games: Record<string, StoredGame>): StoredGame[] {
  return Object.values(games).sort(
    (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0) || b.importedAt - a.importedAt,
  );
}

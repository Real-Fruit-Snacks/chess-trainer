import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  keepCorruptBlob,
  rehydrateOnStorageChange,
  safeLocalStorage,
  warnNewerSave,
} from '@/lib/persistStorage';
import type { ImportedGame } from '@/lib/gameImport';
import { hashString } from '@/lib/random';
import type { ReviewDigest } from '@/features/games/insights';
import { gamesSlice, parse } from './backupSchema';
import { storageKeyFor } from './profiles';

/**
 * Where a game came from: imported from Lichess or chess.com, pasted as PGN,
 * or played online through the app's own relay (a live game; live games
 * played on Lichess count as Lichess games, with their URL).
 */
export type GameSource = 'lichess' | 'chesscom' | 'pgn' | 'online';

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

export interface AddGamesResult {
  /** Games that were new. */
  added: number;
  /** Games (old ones, or new ones past the cap) that had to go to stay within the cap. */
  dropped: number;
}

export interface GamesState {
  games: Record<string, StoredGame>;
  /** The learner's name as it appears in the games (for colour detection). */
  player: string;
  /**
   * Adds games that are not stored yet. Past `MAX_STORED_GAMES`, games that were
   * never reviewed go first (oldest first), then the oldest reviewed ones.
   */
  addGames: (games: ImportedGame[], source: GameSource) => AddGamesResult;
  removeGame: (id: string) => void;
  setPlayer: (player: string) => void;
  setReview: (id: string, review: StoredReview) => void;
  clear: () => void;
  /** Replaces the store with a validated backup part (missing fields start empty). */
  replaceState: (state: Partial<PersistedGames>) => void;
}

export const MAX_STORED_GAMES = 200;
export const GAMES_STORAGE_KEY = 'chess-trainer:games';
export const GAMES_VERSION = 1;

export interface PersistedGames {
  games: Record<string, StoredGame>;
  player: string;
}

const initialState: PersistedGames = { games: {}, player: '' };

/** Stable id for a game: its source URL when it has one, else a hash of the PGN. */
export function gameKey(game: Pick<ImportedGame, 'url' | 'pgn'>): string {
  return game.url ?? `pgn-${hashString(game.pgn.replace(/\s+/g, ' ').trim()).toString(36)}`;
}

/** Newest first: by import, then by when the game was played. */
const byRecency = (a: StoredGame, b: StoredGame) =>
  b.importedAt - a.importedAt || (b.timestamp ?? 0) - (a.timestamp ?? 0);

/**
 * Trims the collection to the cap. Reviewed games carry work the learner did
 * (Insights, deviations), so unreviewed games are evicted first, oldest first.
 */
export function capGames(
  games: Record<string, StoredGame>,
  max = MAX_STORED_GAMES,
): { games: Record<string, StoredGame>; dropped: number } {
  const all = Object.values(games);
  if (all.length <= max) return { games, dropped: 0 };
  const reviewed = all.filter((g) => g.review !== null).sort(byRecency);
  const unreviewed = all.filter((g) => g.review === null).sort(byRecency);
  const kept = [...reviewed, ...unreviewed].slice(0, max).sort(byRecency);
  return { games: Object.fromEntries(kept.map((g) => [g.id, g])), dropped: all.length - max };
}

/** A stored blob checked game by game; damaged entries are dropped, unknown keys kept. */
export function repairGames(stored: unknown): PersistedGames & Record<string, unknown> {
  const parsed = parse(gamesSlice, stored, 'repair', 'games');
  const known = parsed.ok ? parsed.value : {};
  const state: Record<string, unknown> = {
    games: capGames(known.games ?? {}).games,
    player: known.player ?? '',
  };
  if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      if (!(key in initialState) && value !== undefined) state[key] = value;
    }
  }
  return state as PersistedGames & Record<string, unknown>;
}

export const useGames = create<GamesState>()(
  persist<GamesState, [], [], PersistedGames>(
    (set, get) => ({
      ...initialState,

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
        if (added === 0) return { added: 0, dropped: 0 };
        const capped = capGames(games);
        set({ games: capped.games });
        return { added, dropped: capped.dropped };
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

      clear: () => set({ games: {}, player: '' }),

      replaceState: (state) => {
        const games: Record<string, StoredGame> = {};
        for (const game of Object.values(state.games ?? {})) games[game.id] = game;
        set({ games: capGames(games).games, player: state.player ?? '' });
      },
    }),
    {
      name: storageKeyFor(GAMES_STORAGE_KEY),
      version: GAMES_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => {
        const out = {} as Record<string, unknown>;
        for (const [key, value] of Object.entries(state)) {
          if (typeof value !== 'function') out[key] = value;
        }
        return out as unknown as PersistedGames;
      },
      migrate: (stored, version): PersistedGames => {
        if (version > GAMES_VERSION) warnNewerSave(GAMES_STORAGE_KEY, version, GAMES_VERSION);
        return repairGames(stored);
      },
      merge: (persistedState, current): GamesState => ({
        ...current,
        ...repairGames(persistedState),
      }),
      onRehydrateStorage: keepCorruptBlob(storageKeyFor(GAMES_STORAGE_KEY)),
    },
  ),
);

rehydrateOnStorageChange(useGames, storageKeyFor(GAMES_STORAGE_KEY));

/** Games sorted newest first (by when they were played, then imported). */
export function sortedGames(games: Record<string, StoredGame>): StoredGame[] {
  return Object.values(games).sort(
    (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0) || b.importedAt - a.importedAt,
  );
}

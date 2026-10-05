import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  keepCorruptBlob,
  rehydrateOnStorageChange,
  safeLocalStorage,
  warnNewerSave,
} from '@/lib/persistStorage';
import { START_FEN } from '@/chess/startFen';
import type { Fen } from '@/chess/types';
import type { ImportedGame } from '@/lib/gameImport';
import { analysesSlice, parse } from './backupSchema';
import { useLichess } from './lichess';
import { storageKeyFor } from './profiles';

/**
 * The analysis library: saved analyses and studies, grouped into collections.
 * Each entry is a PGN with variations and comments, exactly as the analysis
 * board wrote it, so reopening restores the whole tree.
 */
export interface SavedAnalysis {
  id: string;
  name: string;
  collection: string;
  pgn: string;
  startFen: Fen;
  /** Main-line move count, for the list. */
  moves: number;
  createdAt: number;
  updatedAt: number;
}

export const ANALYSES_STORAGE_KEY = 'chess-trainer:analyses';
export const ANALYSES_VERSION = 1;
export const DEFAULT_COLLECTION = 'My analyses';
export const MAX_ANALYSES = 500;

export interface PersistedAnalyses {
  items: Record<string, SavedAnalysis>;
}

/** The newest `MAX_ANALYSES` entries (by last update), re-keyed by id. */
export function capAnalyses(items: Record<string, SavedAnalysis>): Record<string, SavedAnalysis> {
  const all = Object.values(items);
  if (all.length <= MAX_ANALYSES) return items;
  const kept = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ANALYSES);
  return Object.fromEntries(kept.map((a) => [a.id, a]));
}

/** A stored blob checked entry by entry; damaged entries are dropped, unknown keys kept. */
export function repairAnalyses(stored: unknown): PersistedAnalyses & Record<string, unknown> {
  const parsed = parse(analysesSlice, stored, 'repair', 'analyses');
  const state: Record<string, unknown> = {
    items: capAnalyses(parsed.ok ? (parsed.value.items ?? {}) : {}),
  };
  if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      if (key !== 'items' && value !== undefined) state[key] = value;
    }
  }
  return state as PersistedAnalyses & Record<string, unknown>;
}

export interface AnalysesState {
  items: Record<string, SavedAnalysis>;
  save: (
    input: Pick<SavedAnalysis, 'name' | 'pgn' | 'startFen' | 'moves'> & { collection?: string },
  ) => SavedAnalysis;
  /** Overwrites the PGN of an existing entry (after editing a reopened analysis). */
  update: (
    id: string,
    patch: Partial<Pick<SavedAnalysis, 'name' | 'collection' | 'pgn' | 'moves'>>,
  ) => void;
  remove: (id: string) => void;
  removeCollection: (collection: string) => void;
  clear: () => void;
  /**
   * Replaces the library with a validated backup part (like every other store
   * on import); the cap applies, newest entries first.
   */
  replaceState: (state: Partial<PersistedAnalyses>) => void;
}

const nonEmpty = (text: string | undefined): string | undefined =>
  text !== undefined && text.length > 0 ? text : undefined;

const newId = () => `an-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const useAnalyses = create<AnalysesState>()(
  persist<AnalysesState, [], [], PersistedAnalyses>(
    (set, get) => ({
      items: {},

      save: (input) => {
        const now = Date.now();
        const entry: SavedAnalysis = {
          id: newId(),
          name: input.name.trim() || 'Analysis',
          collection: (input.collection ?? DEFAULT_COLLECTION).trim() || DEFAULT_COLLECTION,
          pgn: input.pgn,
          startFen: input.startFen,
          moves: input.moves,
          createdAt: now,
          updatedAt: now,
        };
        // Keep the library bounded: the oldest entries go first.
        set({ items: capAnalyses({ ...get().items, [entry.id]: entry }) });
        return entry;
      },

      update: (id, patch) => {
        const current = get().items[id];
        if (!current) return;
        set({
          items: {
            ...get().items,
            [id]: {
              ...current,
              ...patch,
              name: nonEmpty(patch.name?.trim()) ?? current.name,
              collection: nonEmpty(patch.collection?.trim()) ?? current.collection,
              updatedAt: Date.now(),
            },
          },
        });
      },

      remove: (id) => {
        // The Lichess sync deletes its chapter too (an analysis merely missing is restored).
        useLichess.getState().noteDeleted(`ana:${id}`);
        const items = { ...get().items };
        delete items[id];
        set({ items });
      },

      removeCollection: (collection) => {
        for (const entry of Object.values(get().items)) {
          if (entry.collection === collection) useLichess.getState().noteDeleted(`ana:${entry.id}`);
        }
        set({
          items: Object.fromEntries(
            Object.entries(get().items).filter(([, a]) => a.collection !== collection),
          ),
        });
      },

      clear: () => set({ items: {} }),

      replaceState: (state) => {
        const items: Record<string, SavedAnalysis> = {};
        for (const entry of Object.values(state.items ?? {})) items[entry.id] = entry;
        set({ items: capAnalyses(items) });
      },
    }),
    {
      name: storageKeyFor(ANALYSES_STORAGE_KEY),
      version: ANALYSES_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => {
        const out = {} as Record<string, unknown>;
        for (const [key, value] of Object.entries(state)) {
          if (typeof value !== 'function') out[key] = value;
        }
        return out as unknown as PersistedAnalyses;
      },
      migrate: (stored, version): PersistedAnalyses => {
        if (version > ANALYSES_VERSION) {
          warnNewerSave(ANALYSES_STORAGE_KEY, version, ANALYSES_VERSION);
        }
        return repairAnalyses(stored);
      },
      merge: (persistedState, current): AnalysesState => ({
        ...current,
        ...repairAnalyses(persistedState),
      }),
      onRehydrateStorage: keepCorruptBlob(storageKeyFor(ANALYSES_STORAGE_KEY)),
    },
  ),
);

rehydrateOnStorageChange(useAnalyses, storageKeyFor(ANALYSES_STORAGE_KEY));

/** Collections with their entries, newest first, the default collection first. */
export function groupAnalyses(
  items: Record<string, SavedAnalysis>,
): { collection: string; entries: SavedAnalysis[] }[] {
  const groups = new Map<string, SavedAnalysis[]>();
  for (const entry of Object.values(items)) {
    const list = groups.get(entry.collection) ?? [];
    list.push(entry);
    groups.set(entry.collection, list);
  }
  return [...groups.entries()]
    .map(([collection, entries]) => ({
      collection,
      entries: entries.sort((a, b) => b.updatedAt - a.updatedAt),
    }))
    .sort((a, b) =>
      a.collection === DEFAULT_COLLECTION
        ? -1
        : b.collection === DEFAULT_COLLECTION
          ? 1
          : a.collection.localeCompare(b.collection),
    );
}

/**
 * Splits a multi-game PGN (a Lichess study export, say) into chapters: the
 * collection name comes from the study's Event tag ("Study: Chapter 1" → "Study"),
 * each entry's name from the ChapterName or Event tag.
 */
export function studyChapters(games: ImportedGame[]): {
  collection: string;
  chapters: { name: string; pgn: string; startFen: Fen; moves: number }[];
} {
  const first = games[0];
  const event = first?.headers?.Event ?? first?.event ?? '';
  const collection =
    nonEmpty((event.includes(':') ? event.split(':')[0] : event)?.trim()) ?? 'Imported study';
  const chapters = games.map((game, i) => {
    const headers = game.headers ?? {};
    const eventName = headers.Event ?? game.event;
    const afterColon = eventName.includes(':') ? eventName.slice(eventName.indexOf(':') + 1) : '';
    const name = (headers.ChapterName ?? afterColon).trim() || `Chapter ${i + 1}`;
    return {
      name,
      pgn: game.pgn,
      startFen: game.startFen ?? START_FEN,
      moves: Math.ceil(game.plies / 2),
    };
  });
  return { collection, chapters };
}

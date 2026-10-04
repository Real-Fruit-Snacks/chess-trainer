import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  keepCorruptBlob,
  rehydrateOnStorageChange,
  safeLocalStorage,
  warnNewerSave,
} from '@/lib/persistStorage';
import type { LongColor } from '@/chess/types';
import { newCard, type Quality, reviewCard, type SrsCard } from '@/lib/srs';
import { parse, repertoireSlice } from './backupSchema';
import { storageKeyFor } from './profiles';

export interface CustomRepertoire {
  id: string;
  name: string;
  color: LongColor;
  pgn: string;
  createdAt: number;
}

export interface RepertoireSession {
  at: number;
  repertoireId: string;
  correct: number;
  total: number;
}

export interface RepertoireState {
  /** SRS cards keyed by `${repertoireId}|${uci path}`. */
  cards: Record<string, SrsCard>;
  custom: CustomRepertoire[];
  sessions: RepertoireSession[];

  review: (repertoireId: string, key: string, quality: Quality, now?: number) => void;
  addCustom: (rep: Omit<CustomRepertoire, 'id' | 'createdAt'>) => CustomRepertoire;
  /** Changes a custom repertoire's name, colour or lines. */
  updateCustom: (
    id: string,
    patch: Partial<Pick<CustomRepertoire, 'name' | 'color' | 'pgn'>>,
  ) => void;
  removeCustom: (id: string) => void;
  recordSession: (session: Omit<RepertoireSession, 'at'>) => void;
  resetRepertoire: (repertoireId: string) => void;
  /** Replaces the whole store with a validated backup part (missing fields start empty). */
  replaceState: (state: Partial<PersistedRepertoire>) => void;
  resetAll: () => void;
}

const MAX_SESSIONS = 50;

const initialState = {
  cards: {} as Record<string, SrsCard>,
  custom: [] as CustomRepertoire[],
  sessions: [] as RepertoireSession[],
};

export type PersistedRepertoire = typeof initialState;

export const REPERTOIRE_STORAGE_KEY = 'chess-trainer:repertoire';
export const REPERTOIRE_VERSION = 1;

/** A stored blob checked field by field; damaged entries are dropped, unknown keys kept. */
export function repairRepertoire(stored: unknown): PersistedRepertoire & Record<string, unknown> {
  const parsed = parse(repertoireSlice, stored, 'repair', 'repertoire');
  const state: Record<string, unknown> = { ...initialState, ...(parsed.ok ? parsed.value : {}) };
  if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      if (!(key in initialState) && value !== undefined) state[key] = value;
    }
  }
  return state as PersistedRepertoire & Record<string, unknown>;
}

export function repertoireCardId(repertoireId: string, key: string): string {
  return `${repertoireId}|${key}`;
}

/** Cards for one repertoire, keyed by the move path only. */
export function cardsFor(
  cards: Record<string, SrsCard>,
  repertoireId: string,
): Record<string, SrsCard> {
  const prefix = `${repertoireId}|`;
  const out: Record<string, SrsCard> = {};
  for (const [id, card] of Object.entries(cards)) {
    if (id.startsWith(prefix)) out[id.slice(prefix.length)] = card;
  }
  return out;
}

export const useRepertoire = create<RepertoireState>()(
  persist<RepertoireState, [], [], PersistedRepertoire>(
    (set, get) => ({
      ...initialState,

      review: (repertoireId, key, quality, now = Date.now()) => {
        const id = repertoireCardId(repertoireId, key);
        const current = get().cards[id] ?? newCard(now);
        set({ cards: { ...get().cards, [id]: reviewCard(current, quality, now) } });
      },

      addCustom: (rep) => {
        const created: CustomRepertoire = {
          ...rep,
          id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now(),
        };
        set({ custom: [...get().custom, created] });
        return created;
      },

      updateCustom: (id, patch) => {
        set({ custom: get().custom.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
      },

      removeCustom: (id) => {
        const prefix = `${id}|`;
        const cards = Object.fromEntries(
          Object.entries(get().cards).filter(([cardId]) => !cardId.startsWith(prefix)),
        );
        set({ custom: get().custom.filter((r) => r.id !== id), cards });
      },

      recordSession: (session) =>
        set({
          sessions: [{ ...session, at: Date.now() }, ...get().sessions].slice(0, MAX_SESSIONS),
        }),

      resetRepertoire: (repertoireId) => {
        const prefix = `${repertoireId}|`;
        set({
          cards: Object.fromEntries(
            Object.entries(get().cards).filter(([cardId]) => !cardId.startsWith(prefix)),
          ),
        });
      },

      replaceState: (state) =>
        set({
          cards: state.cards ?? {},
          custom: state.custom ?? [],
          sessions: (state.sessions ?? []).slice(0, MAX_SESSIONS),
        }),

      resetAll: () => set({ ...initialState }),
    }),
    {
      name: storageKeyFor(REPERTOIRE_STORAGE_KEY),
      version: REPERTOIRE_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => {
        const out = {} as Record<string, unknown>;
        for (const [key, value] of Object.entries(state)) {
          if (typeof value !== 'function') out[key] = value;
        }
        return out as PersistedRepertoire;
      },
      migrate: (stored, version): PersistedRepertoire => {
        if (version > REPERTOIRE_VERSION) {
          warnNewerSave(REPERTOIRE_STORAGE_KEY, version, REPERTOIRE_VERSION);
        }
        return repairRepertoire(stored);
      },
      merge: (persistedState, current): RepertoireState => ({
        ...current,
        ...repairRepertoire(persistedState),
      }),
      onRehydrateStorage: keepCorruptBlob(storageKeyFor(REPERTOIRE_STORAGE_KEY)),
    },
  ),
);

rehydrateOnStorageChange(useRepertoire, storageKeyFor(REPERTOIRE_STORAGE_KEY));

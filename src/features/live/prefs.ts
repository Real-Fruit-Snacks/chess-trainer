import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  keepCorruptBlob,
  rehydrateOnStorageChange,
  safeLocalStorage,
  warnNewerSave,
} from '@/lib/persistStorage';
import { storageKeyFor } from '@/store/profiles';
import { COLOR_CHOICES, isPlayerName, parseTimeControl } from '../../../relay/src/live/shared.mjs';
import { differentName, randomName } from './names';
import type { LivePrefs } from './types';

/**
 * The player's choices for live games on this device and profile: the name
 * they play under, whether their rating shows, and what they posted last.
 * Kept apart from settings on purpose: not in backups, not synced between
 * devices (each device keeps its own name until the player rolls another).
 */
export interface LivePrefsState extends LivePrefs {
  /** A new generated name. */
  rollName: () => void;
  update: (patch: Partial<LivePrefs>) => void;
}

export const LIVE_PREFS_STORAGE_KEY = 'chess-trainer:live';
export const LIVE_PREFS_VERSION = 1;

/** The choices of a device that has made none yet (with a name made up for it). */
export function defaultLivePrefs(): LivePrefs {
  return {
    name: randomName(),
    showRating: true,
    lichess: false,
    lichessRated: false,
    color: 'random',
    tc: '10+0',
  };
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const CHECKS: { [K in keyof LivePrefs]: (value: unknown) => boolean } = {
  // Only a name the relay takes: anything else would be refused at every post.
  name: isPlayerName,
  showRating: isBoolean,
  lichess: isBoolean,
  lichessRated: isBoolean,
  color: (value) =>
    typeof value === 'string' && (COLOR_CHOICES as readonly string[]).includes(value),
  tc: (value) => parseTimeControl(value) !== null,
};

const isPrefKey = (key: string): key is keyof LivePrefs => Object.hasOwn(CHECKS, key);

/** The fields of `patch` that check out; the others are left out. */
function checked(patch: Record<string, unknown>): Partial<LivePrefs> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (isPrefKey(key) && CHECKS[key](value)) out[key] = value;
  }
  return out;
}

type StoredLivePrefs = Partial<LivePrefs> & Record<string, unknown>;

/**
 * A stored value read field by field: a field that does not check out is
 * left out (its default stays); fields this version does not know (a newer
 * version's) are kept untouched.
 */
export function repairLivePrefs(stored: unknown): StoredLivePrefs {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  const input = stored as Record<string, unknown>;
  const out: Record<string, unknown> = { ...checked(input) };
  for (const [key, value] of Object.entries(input)) {
    if (!isPrefKey(key) && value !== undefined && typeof value !== 'function') out[key] = value;
  }
  return out;
}

const storageKey = () => storageKeyFor(LIVE_PREFS_STORAGE_KEY);

export const useLivePrefs = create<LivePrefsState>()(
  persist<LivePrefsState, [], [], StoredLivePrefs>(
    (set, get) => ({
      ...defaultLivePrefs(),
      rollName: () => set({ name: differentName(get().name) }),
      update: (patch) => {
        const valid = checked(patch);
        if (Object.keys(valid).length > 0) set(valid);
      },
    }),
    {
      name: storageKey(),
      version: LIVE_PREFS_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(state)) {
          if (typeof value !== 'function') out[key] = value;
        }
        return out;
      },
      migrate: (stored, version) => {
        if (version > LIVE_PREFS_VERSION) {
          warnNewerSave(storageKey(), version, LIVE_PREFS_VERSION);
        }
        return repairLivePrefs(stored);
      },
      merge: (stored, current) => ({ ...current, ...repairLivePrefs(stored) }),
      onRehydrateStorage: keepCorruptBlob(storageKey()),
    },
  ),
);

rehydrateOnStorageChange(useLivePrefs, storageKey());

/** The name in storage, when it holds one the relay takes. */
function storedName(): string | null {
  const raw = safeLocalStorage.getItem(storageKey());
  if (typeof raw !== 'string') return null;
  try {
    const name = (JSON.parse(raw) as { state?: { name?: unknown } } | null)?.state?.name;
    return isPlayerName(name) ? (name as string) : null;
  } catch {
    return null;
  }
}

// A name made up at this start is saved at once: otherwise every start would
// make up another, and the player would never keep the name they were shown.
if (storedName() !== useLivePrefs.getState().name) useLivePrefs.setState({});

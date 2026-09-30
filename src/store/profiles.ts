import { create } from 'zustand';

/**
 * Profiles: several learners on one device, each with their own progress,
 * repertoires, games and library. A profile is a namespace for the persisted
 * stores — the first profile keeps the plain storage keys, every other one
 * gets `<key>:<profile id>`. Switching profiles reloads the app so that every
 * store starts from the right namespace.
 */
export interface Profile {
  id: string;
  name: string;
  createdAt: number;
}

export const PROFILES_STORAGE_KEY = 'chess-trainer:profiles';
export const DEFAULT_PROFILE_ID = 'default';
/** Storage keys that belong to a profile (not shared device settings). */
export const PROFILE_SCOPED_KEYS = [
  'chess-trainer:progress',
  'chess-trainer:repertoire',
  'chess-trainer:games',
  'chess-trainer:analyses',
] as const;

interface StoredProfiles {
  profiles: Profile[];
  activeId: string;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadProfiles(): StoredProfiles {
  const fallback: StoredProfiles = {
    profiles: [{ id: DEFAULT_PROFILE_ID, name: 'Me', createdAt: 0 }],
    activeId: DEFAULT_PROFILE_ID,
  };
  const raw = storage()?.getItem(PROFILES_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProfiles>;
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.filter(
          (p): p is Profile => typeof p?.id === 'string' && typeof p.name === 'string',
        )
      : [];
    if (profiles.length === 0) return fallback;
    const activeId =
      typeof parsed.activeId === 'string' && profiles.some((p) => p.id === parsed.activeId)
        ? parsed.activeId
        : (profiles[0]?.id ?? DEFAULT_PROFILE_ID);
    return { profiles, activeId };
  } catch {
    return fallback;
  }
}

function saveProfiles(state: StoredProfiles): void {
  storage()?.setItem(PROFILES_STORAGE_KEY, JSON.stringify(state));
}

/** The profile the app booted with. Stores read this once when they are created. */
export const ACTIVE_PROFILE_ID: string = loadProfiles().activeId;

/** The storage key a base key maps to for a profile. */
export function storageKeyFor(base: string, profileId: string = ACTIVE_PROFILE_ID): string {
  return profileId === DEFAULT_PROFILE_ID ? base : `${base}:${profileId}`;
}

export interface ProfilesState extends StoredProfiles {
  add: (name: string) => Profile;
  rename: (id: string, name: string) => void;
  /** Deletes the profile and every store it owns. The active profile cannot be removed. */
  remove: (id: string) => void;
  /** Makes the profile active and reloads the app into it. */
  switchTo: (id: string) => void;
}

const newId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const useProfiles = create<ProfilesState>()((set, get) => ({
  ...loadProfiles(),

  add: (name) => {
    const profile: Profile = { id: newId(), name: name.trim() || 'Learner', createdAt: Date.now() };
    const next = { profiles: [...get().profiles, profile], activeId: get().activeId };
    saveProfiles(next);
    set(next);
    return profile;
  },

  rename: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = {
      profiles: get().profiles.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
      activeId: get().activeId,
    };
    saveProfiles(next);
    set(next);
  },

  remove: (id) => {
    if (id === get().activeId || get().profiles.length <= 1) return;
    const next = { profiles: get().profiles.filter((p) => p.id !== id), activeId: get().activeId };
    saveProfiles(next);
    const store = storage();
    if (store) {
      for (const base of PROFILE_SCOPED_KEYS) store.removeItem(storageKeyFor(base, id));
    }
    set(next);
  },

  switchTo: (id) => {
    if (!get().profiles.some((p) => p.id === id) || id === get().activeId) return;
    saveProfiles({ profiles: get().profiles, activeId: id });
    set({ activeId: id });
    window.location.reload();
  },
}));

export function activeProfile(state: Pick<ProfilesState, 'profiles' | 'activeId'>): Profile {
  return (
    state.profiles.find((p) => p.id === state.activeId) ??
    state.profiles[0] ?? { id: DEFAULT_PROFILE_ID, name: 'Me', createdAt: 0 }
  );
}

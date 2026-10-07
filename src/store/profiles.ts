import { create } from 'zustand';
import { safeLocalStorage, writeStorage } from '@/lib/persistStorage';

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
  'chess-trainer:lichess',
  'chess-trainer:device-sync',
] as const;

export interface StoredProfiles {
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

const DEFAULT_PROFILE: Profile = { id: DEFAULT_PROFILE_ID, name: 'Me', createdAt: 0 };

/**
 * When the profile list itself is missing or unreadable, the profiles are
 * rebuilt from the store keys that exist, so no learner's data is orphaned:
 * the plain keys belong to the default profile, `<key>:<id>` to profile `id`.
 */
export function profilesFromKeys(store: Storage | null = storage()): Profile[] {
  const ids = new Set<string>();
  if (store) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i) ?? '';
      for (const base of PROFILE_SCOPED_KEYS) {
        if (key === base) ids.add(DEFAULT_PROFILE_ID);
        else if (key.startsWith(`${base}:`)) {
          const id = key.slice(base.length + 1);
          // Salvaged copies (`:corrupt-<time>`) are not profiles.
          if (id && !id.startsWith('corrupt-')) ids.add(id);
        }
      }
    }
  }
  const profiles = [...ids]
    .sort((a, b) => (a === DEFAULT_PROFILE_ID ? -1 : b === DEFAULT_PROFILE_ID ? 1 : 0))
    .map((id, index) =>
      id === DEFAULT_PROFILE_ID
        ? DEFAULT_PROFILE
        : { id, name: `Recovered profile ${index}`, createdAt: 0 },
    );
  return profiles.length > 0 ? profiles : [DEFAULT_PROFILE];
}

export function loadProfiles(): StoredProfiles {
  const fallback = (): StoredProfiles => {
    const profiles = profilesFromKeys();
    return { profiles, activeId: profiles[0]?.id ?? DEFAULT_PROFILE_ID };
  };
  const raw = safeLocalStorage.getItem(PROFILES_STORAGE_KEY);
  if (typeof raw !== 'string') return fallback();
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProfiles>;
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.filter(
          (p): p is Profile =>
            typeof p === 'object' &&
            p !== null &&
            typeof p.id === 'string' &&
            p.id.length > 0 &&
            typeof p.name === 'string',
        )
      : [];
    if (profiles.length === 0) return fallback();
    const activeId =
      typeof parsed.activeId === 'string' && profiles.some((p) => p.id === parsed.activeId)
        ? parsed.activeId
        : (profiles[0]?.id ?? DEFAULT_PROFILE_ID);
    return { profiles, activeId };
  } catch {
    return fallback();
  }
}

/** Writes the list through the quota-safe wrapper; false when the disk is full. */
function saveProfiles(state: StoredProfiles): boolean {
  return writeStorage(PROFILES_STORAGE_KEY, JSON.stringify(state));
}

/** The profile the app booted with. Stores read this once when they are created. */
export const ACTIVE_PROFILE_ID: string = loadProfiles().activeId;

/** The storage key a base key maps to for a profile. */
export function storageKeyFor(base: string, profileId: string = ACTIVE_PROFILE_ID): string {
  return profileId === DEFAULT_PROFILE_ID ? base : `${base}:${profileId}`;
}

export interface ProfilesState extends StoredProfiles {
  /** Adds a profile; null when the name is empty or already taken. */
  add: (name: string) => Profile | null;
  /** Renames a profile; false when the name is empty or another profile has it. */
  rename: (id: string, name: string) => boolean;
  /** Deletes the profile and every store it owns. The active profile cannot be removed. */
  remove: (id: string) => void;
  /** Makes the profile active and reloads the app into it (not when the choice could not be saved). */
  switchTo: (id: string) => void;
}

const newId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Names are compared without case or surrounding spaces. */
export function nameTaken(profiles: readonly Profile[], name: string, exceptId?: string): boolean {
  const wanted = name.trim().toLocaleLowerCase();
  return profiles.some((p) => p.id !== exceptId && p.name.trim().toLocaleLowerCase() === wanted);
}

export const useProfiles = create<ProfilesState>()((set, get) => ({
  ...loadProfiles(),

  add: (name) => {
    const trimmed = name.trim();
    if (!trimmed || nameTaken(get().profiles, trimmed)) return null;
    const profile: Profile = { id: newId(), name: trimmed, createdAt: Date.now() };
    const next = { profiles: [...get().profiles, profile], activeId: get().activeId };
    if (!saveProfiles(next)) return null;
    set(next);
    return profile;
  },

  rename: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed || nameTaken(get().profiles, trimmed, id)) return false;
    const next = {
      profiles: get().profiles.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
      activeId: get().activeId,
    };
    if (!saveProfiles(next)) return false;
    set(next);
    return true;
  },

  remove: (id) => {
    if (id === get().activeId || get().profiles.length <= 1) return;
    const next = { profiles: get().profiles.filter((p) => p.id !== id), activeId: get().activeId };
    // Removing frees space, so this write is the one most likely to succeed on a full disk.
    for (const base of PROFILE_SCOPED_KEYS) safeLocalStorage.removeItem(storageKeyFor(base, id));
    saveProfiles(next);
    set(next);
  },

  switchTo: (id) => {
    if (!get().profiles.some((p) => p.id === id) || id === get().activeId) return;
    // Reloading without the choice saved would bring the same profile back.
    if (!saveProfiles({ profiles: get().profiles, activeId: id })) return;
    set({ activeId: id });
    window.location.reload();
  },
}));

// Another tab added, renamed or removed a profile: show the same list here. The
// active profile stays the one this tab booted into (its stores are bound to it).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== PROFILES_STORAGE_KEY) return;
    useProfiles.setState({ profiles: loadProfiles().profiles });
  });
}

export function activeProfile(state: Pick<ProfilesState, 'profiles' | 'activeId'>): Profile {
  return (
    state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0] ?? DEFAULT_PROFILE
  );
}

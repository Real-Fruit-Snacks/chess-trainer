import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_ID,
  loadProfiles,
  PROFILE_SCOPED_KEYS,
  PROFILES_STORAGE_KEY,
  storageKeyFor,
  useProfiles,
} from './profiles';

describe('profiles', () => {
  beforeEach(() => {
    localStorage.clear();
    useProfiles.setState(loadProfiles());
  });

  it('starts with one default profile that keeps the plain storage keys', () => {
    const state = loadProfiles();
    expect(state.activeId).toBe(DEFAULT_PROFILE_ID);
    expect(state.profiles).toHaveLength(1);
    expect(storageKeyFor('chess-trainer:progress')).toBe('chess-trainer:progress');
    expect(storageKeyFor('chess-trainer:progress', 'p-abc')).toBe('chess-trainer:progress:p-abc');
  });

  it('adds, renames and persists profiles', () => {
    const added = useProfiles.getState().add('  Ada  ');
    expect(added.name).toBe('Ada');
    useProfiles.getState().rename(added.id, 'Ada L.');
    const stored = JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY) ?? '{}') as {
      profiles: { id: string; name: string }[];
      activeId: string;
    };
    expect(stored.profiles.map((p) => p.name)).toEqual(['Me', 'Ada L.']);
    expect(stored.activeId).toBe(DEFAULT_PROFILE_ID);
    expect(loadProfiles().profiles).toHaveLength(2);
  });

  it('removes an inactive profile together with its stores', () => {
    const added = useProfiles.getState().add('Guest');
    for (const base of PROFILE_SCOPED_KEYS) {
      localStorage.setItem(storageKeyFor(base, added.id), '{"state":{}}');
    }
    useProfiles.getState().remove(added.id);
    expect(useProfiles.getState().profiles).toHaveLength(1);
    for (const base of PROFILE_SCOPED_KEYS) {
      expect(localStorage.getItem(storageKeyFor(base, added.id))).toBeNull();
    }
    // The active profile can never be removed.
    useProfiles.getState().remove(DEFAULT_PROFILE_ID);
    expect(useProfiles.getState().profiles).toHaveLength(1);
  });

  it('falls back to the default profile when the stored list is corrupt', () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, '{"profiles": "nope"}');
    expect(loadProfiles().activeId).toBe(DEFAULT_PROFILE_ID);
    localStorage.setItem(
      PROFILES_STORAGE_KEY,
      JSON.stringify({ profiles: [{ id: 'x', name: 'X', createdAt: 1 }], activeId: 'missing' }),
    );
    expect(loadProfiles().activeId).toBe('x');
  });
});

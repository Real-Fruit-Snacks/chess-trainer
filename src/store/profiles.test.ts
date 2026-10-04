import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStorageHealth } from '@/lib/persistStorage';
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

  it('adds, renames and persists profiles, refusing duplicate names', () => {
    const added = useProfiles.getState().add('  Ada  ');
    expect(added?.name).toBe('Ada');
    expect(useProfiles.getState().add('ada')).toBeNull();
    expect(useProfiles.getState().add('  ')).toBeNull();
    expect(useProfiles.getState().rename(added!.id, 'me')).toBe(false);
    expect(useProfiles.getState().rename(added!.id, 'Ada L.')).toBe(true);
    const stored = JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY) ?? '{}') as {
      profiles: { id: string; name: string }[];
      activeId: string;
    };
    expect(stored.profiles.map((p) => p.name)).toEqual(['Me', 'Ada L.']);
    expect(stored.activeId).toBe(DEFAULT_PROFILE_ID);
    expect(loadProfiles().profiles).toHaveLength(2);
  });

  it('removes an inactive profile together with its stores', () => {
    const added = useProfiles.getState().add('Guest')!;
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

  it('rebuilds the list from the store keys when the stored list is corrupt', () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, '{"profiles": "nope"}');
    expect(loadProfiles().activeId).toBe(DEFAULT_PROFILE_ID);
    // A second learner's stores exist: their profile comes back rather than being orphaned.
    localStorage.setItem('chess-trainer:progress', '{"state":{}}');
    localStorage.setItem('chess-trainer:progress:p-lost', '{"state":{}}');
    localStorage.setItem('chess-trainer:progress:corrupt-1', '{');
    const rebuilt = loadProfiles();
    expect(rebuilt.profiles.map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID, 'p-lost']);
    expect(rebuilt.profiles[1]?.name).toMatch(/Recovered/);
    localStorage.removeItem('chess-trainer:progress');
    localStorage.removeItem('chess-trainer:progress:p-lost');
    localStorage.removeItem('chess-trainer:progress:corrupt-1');
    localStorage.setItem(
      PROFILES_STORAGE_KEY,
      JSON.stringify({ profiles: [{ id: 'x', name: 'X', createdAt: 1 }], activeId: 'missing' }),
    );
    expect(loadProfiles().activeId).toBe('x');
  });
});

describe('profiles on a full disk', () => {
  beforeEach(() => {
    localStorage.clear();
    useProfiles.setState(loadProfiles());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useStorageHealth.getState().markOk();
  });

  const quotaError = () => {
    const error = new Error('quota');
    error.name = 'QuotaExceededError';
    return error;
  };

  it('does not throw, reports the failure and never reloads into an unsaved switch', () => {
    const other = useProfiles.getState().add('Other')!;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    });
    expect(() => useProfiles.getState().add('Third')).not.toThrow();
    expect(useProfiles.getState().add('Third')).toBeNull();
    expect(useProfiles.getState().rename(other.id, 'Renamed')).toBe(false);
    expect(useProfiles.getState().profiles.map((p) => p.name)).toEqual(['Me', 'Other']);
    useProfiles.getState().switchTo(other.id);
    expect(reload).not.toHaveBeenCalled();
    expect(useProfiles.getState().activeId).toBe(DEFAULT_PROFILE_ID);
    expect(useStorageHealth.getState().full).toBe(true);
  });
});

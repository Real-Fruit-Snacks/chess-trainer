/**
 * Device sync must never count anything twice, take anything for deleted that
 * was not, or lose what a device did: whatever happens between the device,
 * the relay and the device's own storage. Each test is one way the base of a
 * merge could stop being the version both sides grew from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storageKeyFor } from '@/store/profiles';
import { useToasts } from '@/components/ui/toastStore';
import { STORAGE_FULL_MESSAGE, useStorageHealth } from '@/lib/persistStorage';
import { siteConfig } from '@/site.config';
import { ANALYSES_STORAGE_KEY, useAnalyses } from '@/store/analyses';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { useGames } from '@/store/games';
import {
  inspectBackup,
  MAX_ATTEMPTS,
  MAX_HISTORY,
  PROGRESS_STORAGE_KEY,
  useProgress,
} from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { fakeCaches } from '@/test/fakeCaches';
import { fakeLocks } from '@/test/fakeLocks';
import { installFakeRelay, type FakeRelay } from '@/test/fakeRelay';
import { otherDevice } from '@/test/syncDevices';
import {
  deleteAnalysis,
  deleteRepertoire,
  editRepertoire,
  emptySnapshot,
  fixtureSnapshot,
  playArcade,
  saveAnalysis,
  solvePuzzle,
} from '@/test/syncFixtures';
import { BASE_MARK_KEY, dropCopies } from './base';
import {
  CHANGE_DELAY_MS,
  importIntoSync,
  joinSync,
  START_DELAY_MS,
  startDeviceSync,
  STORAGE_FULL,
  stopSync,
  syncNow,
  turnOnSync,
  useDeviceSync,
} from './deviceSync';
import type { SyncSnapshot } from './merge';
import { applySnapshot, shareHistory, snapshotJson, takeSnapshot } from './snapshot';

const T = 1_791_000_000_000;
const REP = 'custom-muofwy80-fruf';

function load(snapshot: SyncSnapshot) {
  applySnapshot(snapshot, takeSnapshot());
}

const before = () => fixtureSnapshot().progress;

let relay: FakeRelay;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  relay = installFakeRelay();
  load(fixtureSnapshot());
});

afterEach(async () => {
  vi.restoreAllMocks();
  useStorageHealth.getState().markOk();
  await stopSync();
  // A run still on its way (one a join started, say) ends before the next test.
  await syncNow();
  useDeviceSyncStore.getState().clearStopped();
  localStorage.removeItem(storageKeyFor(BASE_MARK_KEY));
  vi.useRealTimers();
  vi.unstubAllGlobals();
  load(emptySnapshot());
});

async function turnOn(): Promise<string[]> {
  const result = await turnOnSync();
  if (!result.ok) throw new Error(result.reason);
  return result.words;
}

/**
 * Lets the run that turning sync on schedules go by, and waits for it: a test
 * that counts the runs a change starts counts that one otherwise, or not,
 * depending on how fast the machine is.
 */
async function afterStartUp() {
  await vi.advanceTimersByTimeAsync(START_DELAY_MS);
  await syncNow();
}

/** Answers lost on their way back, once: the relay handled the request, the device never heard. */
function loseNextAnswer(to: string) {
  let lost = false;
  relay.loseAnswer = (method) => {
    if (method !== to || lost) return false;
    lost = true;
    return true;
  };
}

/** The app starting again: every store reads back what localStorage holds. */
async function restart() {
  await Promise.all([
    useProgress.persist.rehydrate(),
    useRepertoire.persist.rehydrate(),
    useAnalyses.persist.rehydrate(),
    useGames.persist.rehydrate(),
    useDeviceSyncStore.persist.rehydrate(),
  ]);
}

/** localStorage refusing writes to `key`: every write, or (`growing`) only one that needs more room. */
function fullFor(key: string, growing = false) {
  const setItem = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    name: string,
    value: string,
  ) {
    if (name === key && (!growing || value.length > (this.getItem(name) ?? '').length)) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    setItem.call(this, name, value);
  });
}

describe('a write whose answer never arrived', () => {
  it('counts what it sent once', async () => {
    const words = await turnOn();
    loseNextAnswer('PUT');
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({
      phase: 'failed',
      error: 'The sync service could not be reached.',
    });
    expect(useDeviceSyncStore.getState().pending).not.toBeNull();
    await syncNow();
    const vault = await (await otherDevice(words)).read();
    expect(vault.snapshot.progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
    expect(vault.snapshot.progress.ratedAttempts).toBe(before().ratedAttempts + 1);
    expect(vault.snapshot.progress.themeStats.fork).toEqual(
      takeSnapshot().progress.themeStats.fork,
    );
    expect(takeSnapshot().progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
    expect(useDeviceSyncStore.getState().pending).toBeNull();
  });

  it('counts everything once when another device wrote, and this one changed more, before it heard back', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    loseNextAnswer('PUT');
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    await other.change((s) => solvePuzzle(s, 'there', T + 60_000));
    load(solvePuzzle(takeSnapshot(), 'n2', T + 120_000));
    await syncNow();
    const vault = await other.read();
    for (const p of [vault.snapshot.progress, takeSnapshot().progress]) {
      expect(p.lifetime.attempts).toBe(before().lifetime.attempts + 3);
      expect(p.ratedAttempts).toBe(before().ratedAttempts + 3);
      expect(p.attempts.slice(0, 3).map((a) => a.id)).toEqual(['n2', 'there', 'n1']);
    }
  });

  it('sends again what never reached the relay', async () => {
    const words = await turnOn();
    let dropped = false;
    relay.beforeRequest = (method) => {
      if (method !== 'PUT' || dropped) return;
      dropped = true;
      throw new TypeError('Failed to fetch');
    };
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    expect(relay.puts()).toBe(1); // only turning on reached the relay
    await syncNow();
    const vault = await (await otherDevice(words)).read();
    expect(vault.snapshot.progress.attempts[0]?.id).toBe('n1');
    expect(vault.snapshot.progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
  });
});

describe('a full disk', () => {
  it('takes back a merge that did not fit, and brings it in once there is room', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) =>
      solvePuzzle(saveAnalysis(s, 'an-phone', 'From the phone', T), 'p1', T),
    );
    const full = fullFor(storageKeyFor(ANALYSES_STORAGE_KEY), true);
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    // Nothing of it stays, in memory or in storage, and nothing was agreed on top of it.
    expect(useAnalyses.getState().items['an-phone']).toBeUndefined();
    expect(takeSnapshot().progress.attempts[0]?.id).not.toBe('p1');
    await restart();
    expect(takeSnapshot().progress.attempts[0]?.id).not.toBe('p1');
    // Until a write fits again, syncing waits: it only asks whether the vault changed.
    const requests = relay.requests.length;
    await syncNow();
    expect(relay.requests.slice(requests).map((r) => `${r.method} ${r.status}`)).toEqual([
      'GET 204',
    ]);

    // The learner makes room: an analysis goes, and the write fits.
    full.mockRestore();
    const [oldest] = Object.keys(useAnalyses.getState().items);
    load(deleteAnalysis(takeSnapshot(), oldest ?? ''));
    expect(useStorageHealth.getState().full).toBe(false);
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('done');
    const vault = await other.read();
    for (const s of [vault.snapshot, takeSnapshot()]) {
      expect(Object.keys(s.analyses.items)).toContain('an-phone');
      expect(s.progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
    }
  });

  it('deletes nothing, everywhere, that this device could not save', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) =>
      solvePuzzle(saveAnalysis(s, 'an-phone', 'From the phone', T), 'p1', T),
    );
    // Not even putting the old library back fits.
    const full = fullFor(storageKeyFor(ANALYSES_STORAGE_KEY));
    await syncNow();
    full.mockRestore();
    useStorageHealth.getState().markOk();
    await restart();
    await syncNow();
    const vault = await other.read();
    expect(Object.keys(vault.snapshot.analyses.items)).toContain('an-phone');
    expect(vault.snapshot.progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
  });

  it('does not take back, everywhere, the other device’s puzzles this device could not save', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) => solvePuzzle(solvePuzzle(s, 'p1', T), 'p2', T + 1000));
    const full = fullFor(PROGRESS_STORAGE_KEY);
    await syncNow();
    full.mockRestore();
    useStorageHealth.getState().markOk();
    await restart();
    await syncNow();
    const vault = await other.read();
    expect(vault.snapshot.progress.attempts.slice(0, 2).map((a) => a.id)).toEqual(['p2', 'p1']);
    expect(vault.snapshot.progress.lifetime.attempts).toBe(before().lifetime.attempts + 2);
    expect(vault.snapshot.progress.puzzleRating).toBe(before().puzzleRating + 10);
  });

  it('waits, without “room again” or a retry after every change, until room is made or asked', async () => {
    const words = await turnOn();
    await afterStartUp();
    const other = await otherDevice(words);
    await other.change((s) => saveAnalysis(s, 'an-phone', 'From the phone', T));
    const full = fullFor(storageKeyFor(ANALYSES_STORAGE_KEY), true);
    useToasts.setState({ toasts: [] });
    await syncNow();
    const messages = () => useToasts.getState().toasts.map((t) => t.message);
    expect(messages()).toEqual([STORAGE_FULL]);
    expect(useStorageHealth.getState().full).toBe(false); // storage holds what it held
    // The learner solves a puzzle (no room made): no "room again", and no new attempt — only a
    // question whether the vault changed.
    const requests = relay.requests.length;
    load(solvePuzzle(takeSnapshot(), 'n1', T + 1000));
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS + 100);
    await vi.waitFor(() =>
      expect(relay.requests.slice(requests).map((r) => `${r.method} ${r.status}`)).toEqual([
        'GET 204',
      ]),
    );
    expect(messages()).toEqual([STORAGE_FULL]);
    expect(messages()).not.toContain(STORAGE_FULL_MESSAGE);
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    // Asked to, it tries again (and still finds no room).
    await syncNow({ asked: true });
    expect(relay.requests.length).toBeGreaterThan(requests);
    // Room is made: an analysis goes, and the next run brings the merge in.
    full.mockRestore();
    const [oldest] = Object.keys(useAnalyses.getState().items);
    load(deleteAnalysis(takeSnapshot(), oldest ?? ''));
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('done');
    expect(Object.keys(useAnalyses.getState().items)).toContain('an-phone');
  });

  it('lifts the wait once the vault changes, as when another device made room', async () => {
    const words = await turnOn();
    startDeviceSync();
    const other = await otherDevice(words);
    await other.change((s) => saveAnalysis(s, 'an-phone', 'From the phone', T));
    fullFor(storageKeyFor(ANALYSES_STORAGE_KEY), true);
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    // The other device deletes that analysis again; here the learner goes on solving puzzles.
    await other.change((s) => deleteAnalysis(s, 'an-phone'));
    load(solvePuzzle(takeSnapshot(), 'here-1', T + 1000));
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    await vi.waitFor(() => expect(useDeviceSync.getState().phase).toBe('done'));
    expect((await other.read()).snapshot.progress.attempts.map((a) => a.id)).toContain('here-1');
  });

  it('reads the vault once a run, and warns once, while another device keeps syncing', async () => {
    const words = await turnOn();
    startDeviceSync()(); // runs only when the test asks
    const other = await otherDevice(words);
    await other.change((s) => saveAnalysis(s, 'an-phone', 'From the phone', T));
    fullFor(storageKeyFor(ANALYSES_STORAGE_KEY), true);
    useToasts.setState({ toasts: [] });
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    const warnings = () => useToasts.getState().toasts.filter((t) => t.message === STORAGE_FULL);
    expect(warnings()).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      await other.change((s) => solvePuzzle(s, `there-${i}`, T + i * 60_000));
      useToasts.setState({ toasts: [] });
      relay.requests = [];
      await syncNow();
      expect(relay.requests.map((r) => `${r.method} ${r.status}`)).toEqual(['GET 200']);
      expect(warnings()).toEqual([]);
      expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    }
    // Offline, it still says why it waits.
    relay.offline = true;
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    relay.offline = false;
    // Asked, it says so again.
    await syncNow({ asked: true });
    expect(warnings()).toHaveLength(1);
  });

  it('warns once when even the note of a write does not fit', async () => {
    await turnOn();
    startDeviceSync()(); // runs only when the test asks
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    // The agreement still fits; the note of a pending write, a little longer, does not.
    fullFor(storageKeyFor('chess-trainer:device-sync'), true);
    useToasts.setState({ toasts: [] });
    for (let i = 0; i < 3; i++) await syncNow();
    expect(useToasts.getState().toasts.filter((t) => t.message === STORAGE_FULL)).toHaveLength(1);
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    expect(relay.puts()).toBe(1); // turning sync on, and nothing since
  });

  it('starts afresh when sync is turned off and on again', async () => {
    const words = await turnOn();
    await (
      await otherDevice(words)
    ).change((s) => saveAnalysis(s, 'an-phone', 'From the phone', T));
    const full = fullFor(storageKeyFor(ANALYSES_STORAGE_KEY), true);
    await syncNow();
    expect(useDeviceSync.getState().error).toBe(STORAGE_FULL);
    full.mockRestore();
    await stopSync();
    const again = await turnOn();
    load(solvePuzzle(takeSnapshot(), 'here-1', T + 1000));
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('done');
    expect((await (await otherDevice(again)).read()).snapshot.progress.attempts[0]?.id).toBe(
      'here-1',
    );
  });

  it('deletes nothing elsewhere when storage fails for another reason than room', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) =>
      solvePuzzle(saveAnalysis(s, 'an-phone', 'From the phone', T), 'p1', T),
    );
    // Storage fails once, not for lack of room (Firefox's NS_ERROR_FILE_CORRUPTED, say).
    const setItem = Storage.prototype.setItem;
    let failed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      name: string,
      value: string,
    ) {
      if (name === PROGRESS_STORAGE_KEY && !failed) {
        failed = true;
        throw new DOMException('The storage could not be written.', 'UnknownError');
      }
      setItem.call(this, name, value);
    });
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('failed');
    vi.restoreAllMocks();
    await restart();
    await syncNow();
    const vault = await other.read();
    expect(Object.keys(vault.snapshot.analyses.items)).toContain('an-phone');
    expect(vault.snapshot.progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
  });

  it('leaves no base over stores that do not hold the merge when storage keeps failing', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) =>
      solvePuzzle(saveAnalysis(s, 'an-phone', 'From the phone', T), 'p1', T),
    );
    // From the first progress write on, storage fails (not for lack of room) for progress and
    // for the base mark; the agreement was written just before.
    const failing = [PROGRESS_STORAGE_KEY, storageKeyFor(BASE_MARK_KEY)];
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      name: string,
      value: string,
    ) {
      if (failing.includes(name)) {
        throw new DOMException('The storage could not be written.', 'UnknownError');
      }
      setItem.call(this, name, value);
    });
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('failed');
    vi.restoreAllMocks();
    await restart();
    await syncNow();
    expect(Object.keys((await other.read()).snapshot.analyses.items)).toContain('an-phone');
  });

  it('changes nothing here when even the agreement does not fit', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) => solvePuzzle(s, 'there', T));
    const agreed = useDeviceSyncStore.getState().etag;
    const full = fullFor(storageKeyFor('chess-trainer:device-sync'));
    await syncNow();
    full.mockRestore();
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    expect(useDeviceSyncStore.getState().etag).toBe(agreed);
    expect(takeSnapshot().progress.attempts[0]?.id).not.toBe('there');
    await restart();
    await syncNow({ asked: true });
    expect(takeSnapshot().progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
  });

  it('agrees nothing while a change of this device is only in memory', async () => {
    await turnOn();
    const requests = relay.requests.length;
    useStorageHealth.getState().markFull(PROGRESS_STORAGE_KEY);
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed', error: STORAGE_FULL });
    expect(relay.requests).toHaveLength(requests);
  });
});

describe('the base across tabs and storage', () => {
  it('is not brought back from this tab’s memory after another tab forgot it (an import)', async () => {
    const caches = fakeCaches();
    vi.stubGlobal('caches', caches.api);
    const words = await turnOn();
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    // Another tab imports a backup without the repertoire: its stores reach this tab, and
    // forgetting the base there writes a new mark and deletes the shared copies.
    load(deleteRepertoire(takeSnapshot(), REP));
    localStorage.setItem(storageKeyFor(BASE_MARK_KEY), 'another-tab');
    caches.entries.clear();
    await syncNow();
    const vault = await (await otherDevice(words)).read();
    expect(vault.snapshot.repertoire.custom.map((r) => r.id)).toContain(REP);
  });

  it('counts once when the Cache API refuses the copies (a full disk)', async () => {
    const caches = fakeCaches();
    vi.stubGlobal('caches', caches.api);
    const words = await turnOn();
    const other = await otherDevice(words);
    caches.failPuts = true;
    load(solvePuzzle(takeSnapshot(), 'here', T));
    await syncNow();
    await other.change((s) => solvePuzzle(s, 'there', T + 1000));
    await syncNow();
    const vault = await other.read();
    expect(vault.snapshot.progress.attempts.slice(0, 2).map((a) => a.id)).toEqual([
      'there',
      'here',
    ]);
    expect(vault.snapshot.progress.lifetime.attempts).toBe(before().lifetime.attempts + 2);
    // And with nothing new anywhere, nothing more is written.
    const puts = relay.puts();
    await syncNow();
    await syncNow();
    expect(relay.puts()).toBe(puts);
  });

  it('counts once when another profile is deleted while a write is on its way', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    load(solvePuzzle(takeSnapshot(), 'here', T));
    let once = false;
    relay.beforeRequest = async (method) => {
      if (method !== 'PUT' || once) return;
      once = true;
      await dropCopies('p-some-other-profile');
    };
    await syncNow();
    relay.beforeRequest = null;
    await other.change((s) => solvePuzzle(s, 'there', T + 1000));
    await syncNow();
    const vault = await other.read();
    expect(vault.snapshot.progress.lifetime.attempts).toBe(before().lifetime.attempts + 2);
  });
});

describe('importing a backup while sync is on', () => {
  const backupOf = (snapshot: SyncSnapshot) => {
    const preview = inspectBackup(JSON.parse(snapshotJson(snapshot, 0)));
    if (!preview.ok) throw new Error(preview.reason);
    return preview.shape;
  };

  it('keeps what this device did since its last sync, and deletes nothing', async () => {
    const words = await turnOn();
    relay.offline = true;
    load(solvePuzzle(takeSnapshot(), 'offline-1', T));
    await syncNow();
    // Offline, nothing is imported: the device syncs first.
    const refused = await importIntoSync(backupOf(deleteRepertoire(fixtureSnapshot(), REP)));
    expect(refused).toEqual({
      ok: false,
      reason:
        'With sync between devices on, this device syncs before it adds a backup, and that did not work: The sync service could not be reached.',
    });
    // Back online, the learner imports an older backup without the repertoire.
    relay.offline = false;
    expect(await importIntoSync(backupOf(deleteRepertoire(fixtureSnapshot(), REP)))).toEqual({
      ok: true,
    });
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('done');
    const vault = await (await otherDevice(words)).read();
    for (const s of [vault.snapshot, takeSnapshot()]) {
      expect(s.progress.attempts.map((a) => a.id)).toContain('offline-1');
      expect(s.repertoire.custom.map((r) => r.id)).toContain(REP);
      expect(s.progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
    }
  });

  it('counts what both devices did since this one last synced', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) =>
      playArcade(solvePuzzle(solvePuzzle(s, 'there-1', T), 'there-2', T + 1000), 'fortress', 5, T),
    );
    load(playArcade(solvePuzzle(takeSnapshot(), 'here-1', T + 2000), 'fortress', 3, T + 2000));
    expect(await importIntoSync(backupOf(fixtureSnapshot()))).toEqual({ ok: true });
    await syncNow();
    const p = (await other.read()).snapshot.progress;
    expect(p.ratedAttempts).toBe(before().ratedAttempts + 3);
    expect(p.themeStats.fork?.solved).toBe((before().themeStats.fork?.solved ?? 0) + 3);
    expect(p.arcade.fortress?.plays).toBe((before().arcade.fortress?.plays ?? 0) + 2);
  });

  it('counts once what the backup holds that the vault holds too', async () => {
    const words = await turnOn();
    const laptop = await otherDevice(words);
    // The laptop solves two puzzles and syncs, then exports a backup; this device has not
    // synced since, and the learner imports the laptop's backup here.
    await laptop.change((s) => solvePuzzle(solvePuzzle(s, 'laptop-1', T), 'laptop-2', T + 1000));
    expect(await importIntoSync(backupOf((await laptop.read()).snapshot))).toEqual({ ok: true });
    await syncNow();
    const p = (await laptop.read()).snapshot.progress;
    expect(p.lifetime.attempts).toBe(before().lifetime.attempts + 2);
    expect(p.ratedAttempts).toBe(before().ratedAttempts + 2);
    expect(p.themeStats.fork?.solved).toBe((before().themeStats.fork?.solved ?? 0) + 2);
  });

  it('does not add up again an old backup of this profile, however old its logs', async () => {
    // A learner with puzzles only, whose profile was exported (and so named) long ago.
    const puzzlesOnly = () => {
      const s = fixtureSnapshot();
      s.repertoire.custom = [];
      s.analyses.items = {};
      s.progress.lineage = ['profile-name1'];
      return s;
    };
    const old = puzzlesOnly();
    let now = puzzlesOnly();
    for (let i = 0; i < MAX_HISTORY; i++) now = solvePuzzle(now, `later-${i}`, T + i * 60_000);
    now.progress.attempts = now.progress.attempts.slice(0, MAX_ATTEMPTS);
    now.progress.ratingHistory = now.progress.ratingHistory.slice(-MAX_HISTORY);
    now.progress.games = [];
    load(now);
    const words = await turnOn();
    expect(await importIntoSync(backupOf(old))).toEqual({ ok: true });
    await syncNow();
    const p = (await (await otherDevice(words)).read()).snapshot.progress;
    expect(p.lifetime.attempts).toBe(now.progress.lifetime.attempts);
    expect(p.arcade.fortress?.plays).toBe(now.progress.arcade.fortress?.plays);
  });

  it('keeps an edit made elsewhere, the backup’s version beside it, and undoes no deletion', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) => editRepertoire(s, REP, '1. d4 d5 2. c4 *'));
    const old = fixtureSnapshot().repertoire.custom.find((r) => r.id === REP);
    expect(await importIntoSync(backupOf(fixtureSnapshot()))).toEqual({ ok: true });
    await syncNow();
    // The edit stays where it was; the backup's older version is kept as a copy, named so.
    const custom = (await other.read()).snapshot.repertoire.custom;
    expect(custom.map((r) => [r.name, r.pgn])).toEqual([
      [old?.name, '1. d4 d5 2. c4 *'],
      [`${old?.name} (backup)`, old?.pgn],
    ]);
    // Deleted elsewhere, and a backup that does not hold it: it stays deleted.
    await other.change((s) => deleteRepertoire(s, REP));
    expect(await importIntoSync(backupOf(emptySnapshot()))).toEqual({ ok: true });
    await syncNow();
    expect((await other.read()).snapshot.repertoire.custom.map((r) => r.id)).not.toContain(REP);
  });

  it('adds a backup from elsewhere, and keeps this device’s version of an item both changed', async () => {
    const words = await turnOn();
    let apart = emptySnapshot();
    for (let i = 0; i < 2; i++) apart = solvePuzzle(apart, `apart-${i}`, T + i * 60_000);
    expect(await importIntoSync(backupOf(apart))).toEqual({ ok: true });
    await syncNow();
    const p = (await (await otherDevice(words)).read()).snapshot.progress;
    expect(p.lifetime.attempts).toBe(before().lifetime.attempts + 2);
    expect(p.ratedAttempts).toBe(before().ratedAttempts + 2);
    // An item both changed: this device's stays, the backup's is kept beside it.
    load(editRepertoire(takeSnapshot(), REP, '1. e4 c5 *'));
    expect(
      await importIntoSync(backupOf(editRepertoire(fixtureSnapshot(), REP, '1. c4 *'))),
    ).toEqual({ ok: true });
    const custom = takeSnapshot().repertoire.custom;
    expect(custom.find((r) => r.id === REP)?.pgn).toBe('1. e4 c5 *');
    expect(custom.find((r) => r.name.endsWith('(backup)'))?.pgn).toBe('1. c4 *');
  });
});

describe('joining from a device used apart', () => {
  it('adds up both devices’ counts when their only common items came through Lichess', async () => {
    const laptopGame = {
      id: 'g-laptop-1',
      at: T - 3 * 24 * 3600_000,
      level: 4,
      color: 'white' as const,
      result: '1-0' as const,
      reason: 'checkmate',
      plies: 7,
      pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
      source: 'play' as const,
      lichessId: 'AbCdEfGh',
    };
    const withGame = (s: SyncSnapshot, sent: boolean): SyncSnapshot => {
      const next = structuredClone(s);
      const { lichessId, ...record } = laptopGame;
      // The laptop sent it to Lichess; the phone read it back from there, without the id.
      next.progress.games = [sent ? { ...record, lichessId } : record, ...next.progress.games];
      return next;
    };
    load(withGame(fixtureSnapshot(), true));
    const on = await turnOn();
    await stopSync();
    let phone = withGame(emptySnapshot(), false);
    for (let i = 0; i < 3; i++) phone = solvePuzzle(phone, `phone-${i}`, T + i * 60_000);
    load(phone);
    expect(shareHistory(takeSnapshot(), withGame(fixtureSnapshot(), true))).toBe(false);
    expect(await joinSync(on.join(' '), 'merge')).toEqual({ ok: true });
    const p = takeSnapshot().progress;
    const laptop = before();
    expect(p.lifetime.attempts).toBe(laptop.lifetime.attempts + 3);
    expect(p.ratedAttempts).toBe(laptop.ratedAttempts + 3);
    expect(p.games.filter((g) => g.id === laptopGame.id)).toHaveLength(1);
  });
});

describe('an import while a sync of this tab is under way', () => {
  it('waits for it, then syncs and adds the backup, counting everything once', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator) as Navigator, { locks }));
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) => solvePuzzle(s, 'there', T));
    load(solvePuzzle(takeSnapshot(), 'here', T + 1000));
    // This tab's run is held up on its write.
    let release: () => void = () => undefined;
    let held = false;
    relay.beforeRequest = async (method) => {
      if (method !== 'PUT' || held) return;
      held = true;
      await new Promise<void>((resolve) => (release = resolve));
    };
    const run = syncNow();
    await vi.waitFor(() => expect(held).toBe(true));
    // The learner imports a backup made elsewhere (two puzzles, on a device used apart)...
    let apart = emptySnapshot();
    apart = solvePuzzle(solvePuzzle(apart, 'apart-1', T - 5000), 'apart-2', T - 4000);
    const preview = inspectBackup(JSON.parse(snapshotJson(apart, 0)));
    if (!preview.ok) throw new Error(preview.reason);
    const importing = importIntoSync(preview.shape);
    // ...and the scheduler asks for a run too.
    void syncNow();
    release();
    await run;
    expect(await importing).toEqual({ ok: true });
    relay.beforeRequest = null;
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('done');
    const p = (await other.read()).snapshot.progress;
    expect(p.lifetime.attempts).toBe(before().lifetime.attempts + 4);
    expect(p.ratedAttempts).toBe(before().ratedAttempts + 4);
    expect(locks.log).toContain('queued');
  });
});

describe('turning sync off during a run', () => {
  it('asks the relay for nothing more', async () => {
    const caches = fakeCaches();
    vi.stubGlobal('caches', caches.api);
    const words = await turnOn();
    await (await otherDevice(words)).change((s) => solvePuzzle(s, 'there', T));
    let off = false;
    caches.onPut = () => {
      if (!off) {
        off = true;
        void stopSync(); // in this tab, or another
      }
      return undefined;
    };
    relay.requests = [];
    await syncNow();
    expect(relay.requests.map((r) => `${r.method} ${r.status}`)).toEqual(['GET 200']);
  });
});

describe('a relay that answers “unchanged” to a plain read', () => {
  it('is a failure, not a reason to ask again and again', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.startsWith(siteConfig.syncRelay)) throw new Error(`Unexpected ${url}`);
        calls++;
        if (calls > 50) throw new TypeError('Failed to fetch');
        return Promise.resolve(new Response(null, { status: 204 }));
      }),
    );
    const result = await joinSync(
      'legal winner thank year wave sausage worth useful legal winner thank yellow',
      'merge',
    );
    expect(result).toEqual({ ok: false, reason: 'The sync service sent no data.' });
    expect(calls).toBe(1);
  });
});

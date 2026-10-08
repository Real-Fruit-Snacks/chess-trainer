import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { siteConfig } from '@/site.config';
import { EXPORT_VERSION } from '@/store/backupSchema';
import { useAnalyses } from '@/store/analyses';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { installFakeRelay, type FakeRelay } from '@/test/fakeRelay';
import { otherDevice } from '@/test/syncDevices';
import {
  deleteRepertoire,
  emptySnapshot,
  fixtureSnapshot,
  saveAnalysis,
  solvePuzzle,
} from '@/test/syncFixtures';
import {
  CHANGE_DELAY_MS,
  currentPhrase,
  deleteSyncedCopy,
  forgetSyncBase,
  joinLink,
  joinSync,
  START_DELAY_MS,
  stopSync,
  syncNow,
  turnOnSync,
  useDeviceSync,
} from './deviceSync';
import { syncTotals } from './counts';
import { sameData, type SyncSnapshot } from './merge';
import { applySnapshot, snapshotJson, takeSnapshot } from './snapshot';

const T = 1_791_000_000_000;
const REP = 'custom-muofwy80-fruf';

/** `snapshot` named as the synced profile is: turning sync on gives a profile its lineage. */
function named(snapshot: SyncSnapshot): SyncSnapshot {
  const lineage = useProgress.getState().lineage;
  expect(lineage).toHaveLength(1);
  return { ...snapshot, progress: { ...snapshot.progress, lineage } };
}

/** Puts a profile into the stores, as using the app would. */
function load(snapshot: SyncSnapshot) {
  applySnapshot(snapshot, takeSnapshot());
}

/** Whether two profiles hold the same data, the settings aside (the fixtures have none). */
const sameProfileData = (a: SyncSnapshot, b: SyncSnapshot) =>
  sameData({ ...a, settings: {} }, { ...b, settings: {} });

let relay: FakeRelay;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  relay = installFakeRelay();
  load(fixtureSnapshot());
});

afterEach(async () => {
  await stopSync();
  useDeviceSyncStore.getState().clearStopped();
  useDeviceSyncStore.setState({ off: [] });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  load(emptySnapshot());
  useSettings.setState({ ...DEFAULT_SETTINGS });
});

async function turnOn(): Promise<string[]> {
  const result = await turnOnSync();
  if (!result.ok) throw new Error(result.reason);
  return result.words;
}

/**
 * Lets the run that turning sync on schedules go by, and waits for it, so a
 * test that times the runs a change starts does not race it.
 */
async function afterStartUp() {
  await vi.advanceTimersByTimeAsync(START_DELAY_MS);
  await syncNow();
}

describe('turning sync on', () => {
  it("puts this device's data in a new vault and gives the phrase", async () => {
    const words = await turnOn();
    expect(words).toHaveLength(12);
    expect(relay.store.size()).toBe(1);
    const vault = await (await otherDevice(words)).read();
    expect(vault.generation).toBe(1);
    expect(sameData(vault.snapshot, takeSnapshot())).toBe(true);
    expect(useDeviceSyncStore.getState()).toMatchObject({ etag: '"1"', generation: 1 });
    expect(useDeviceSync.getState().phase).toBe('done');
    expect(await currentPhrase()).toEqual(words);
    expect(joinLink(words)).toBe(`${siteConfig.siteUrl}settings#sync=${words.join('-')}`);
  });

  it('says so when the relay cannot be reached', async () => {
    relay.offline = true;
    const result = await turnOnSync();
    expect(result).toEqual({ ok: false, reason: 'The sync service could not be reached.' });
    expect(useDeviceSyncStore.getState().secret).toBeNull();
  });
});

describe('syncing', () => {
  it('sends nothing when nothing changed', async () => {
    await turnOn();
    relay.requests = [];
    await syncNow();
    expect(relay.requests).toEqual([{ method: 'GET', status: 204 }]);
  });

  it('does not keep sending what the vault would not keep (a damaged entry)', async () => {
    await turnOn();
    // Entries the backup schema refuses, as a damaged save might hold.
    const attempts = useProgress.getState().attempts;
    useProgress.setState({
      attempts: [{ id: 'broken' } as unknown as (typeof attempts)[number], ...attempts],
    });
    const items = useAnalyses.getState().items;
    useAnalyses.setState({
      items: { ...items, broken: { id: 'broken' } as unknown as (typeof items)[string] },
    });
    await syncNow();
    await syncNow();
    expect(relay.puts()).toBe(1);
  });

  it("sends this device's changes", async () => {
    const words = await turnOn();
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    expect(relay.puts()).toBe(2);
    const vault = await (await otherDevice(words)).read();
    expect(vault.generation).toBe(2);
    expect(vault.snapshot.progress.attempts[0]?.id).toBe('n1');
    // What went: the one puzzle, and nothing came in.
    expect(useDeviceSync.getState().last).toMatchObject({
      brought: null,
      sent: { changed: { puzzles: 1, lessons: 0, analyses: 0 }, removed: 0 },
    });
  });

  it('keeps reporting what a sync moved over the syncs straight after that move nothing', async () => {
    await turnOn();
    const report = useDeviceSync.getState().last;
    expect(report?.sent).not.toBeNull();
    await syncNow();
    expect(useDeviceSync.getState().last).toBe(report);
    // A minute on, "Synced just now" no longer covers it.
    const later = Date.now() + 61_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    await syncNow();
    expect(useDeviceSync.getState().last).toEqual({ at: later, brought: null, sent: null });
    vi.restoreAllMocks();
  });

  it("brings in another device's changes without writing them back", async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) => saveAnalysis(s, 'an-phone', 'From the phone', T));
    relay.requests = [];
    await syncNow();
    expect(takeSnapshot().analyses.items['an-phone']?.name).toBe('From the phone');
    expect(relay.puts()).toBe(0);
    expect(useDeviceSync.getState().last).toMatchObject({
      brought: { changed: { analyses: 1, puzzles: 0 }, removed: 0 },
      sent: null,
    });
    expect(useDeviceSyncStore.getState()).toMatchObject({ etag: '"2"', generation: 2 });
  });

  it("merges again when another device's write gets in first", async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    load(solvePuzzle(takeSnapshot(), 'here', T));
    let slipped = false;
    relay.beforeRequest = async (method) => {
      if (method !== 'PUT' || slipped) return;
      slipped = true;
      await other.change((s) => solvePuzzle(s, 'there', T + 1000));
    };
    await syncNow();
    const statuses = relay.requests.filter((r) => r.method === 'PUT').map((r) => r.status);
    // Turning on, the other device's write, ours refused, ours again.
    expect(statuses).toEqual([201, 200, 412, 200]);
    const vault = await other.read();
    expect(vault.snapshot.progress.attempts.map((a) => a.id).slice(0, 2)).toEqual([
      'there',
      'here',
    ]);
    expect(vault.snapshot.progress.lifetime.attempts).toBe(
      fixtureSnapshot().progress.lifetime.attempts + 2,
    );
    expect(sameData(vault.snapshot, takeSnapshot())).toBe(true);
  });

  it('syncs on its own a few seconds after a change', async () => {
    await turnOn();
    await afterStartUp();
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS - 1000);
    expect(relay.puts()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(relay.puts()).toBe(2));
  });

  it('waits for the connection, and syncs when it comes back', async () => {
    await turnOn();
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    relay.offline = true;
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('offline');
    relay.offline = false;
    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(useDeviceSync.getState().phase).toBe('done'));
    expect(relay.puts()).toBe(2);
    onLine.mockRestore();
  });

  it('says the sync service could not be reached when the device is online', async () => {
    await turnOn();
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    relay.offline = true; // the relay is down, or something on the way blocks it
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({
      phase: 'failed',
      error: 'The sync service could not be reached.',
    });
    // It tries again by itself.
    relay.offline = false;
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await vi.waitFor(() => expect(useDeviceSync.getState().phase).toBe('done'));
    expect(relay.puts()).toBe(2);
  });

  it('waits longer after each busy answer', async () => {
    // A relay that takes one write a minute: the first change after turning on is refused.
    relay.reconfigure({ minWriteIntervalMs: 60_000 });
    await turnOn();
    await afterStartUp(); // nothing to send
    const refused = () => relay.requests.filter((r) => r.status === 429).length;
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    expect(refused()).toBe(1);
    expect(useDeviceSync.getState().phase).toBe('idle');
    // Then 2 s, then 4 s.
    await vi.advanceTimersByTimeAsync(1_900);
    expect(refused()).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    await vi.waitFor(() => expect(refused()).toBe(2));
    await vi.advanceTimersByTimeAsync(3_700);
    expect(refused()).toBe(2);
    await vi.advanceTimersByTimeAsync(400);
    await vi.waitFor(() => expect(refused()).toBe(3));
  });

  it('stops when the data outgrows the relay', async () => {
    await turnOn();
    relay.reconfigure({ maxBytes: 200 });
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({
      phase: 'too-large',
      error: 'There is more to sync than the sync service keeps.',
    });
  });

  it('pauses when another device synced with a newer version of the app', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    const current = await other.read();
    const file = JSON.parse(snapshotJson(current.snapshot, 2)) as Record<string, unknown>;
    await other.writeJson(JSON.stringify({ ...file, version: EXPORT_VERSION + 1 }), current.etag);
    const before = takeSnapshot();
    await syncNow();
    expect(useDeviceSync.getState().phase).toBe('newer');
    expect(useDeviceSync.getState().error).toMatch(/Update the app/);
    expect(sameData(takeSnapshot(), before)).toBe(true);
  });

  it('refuses an older copy of the vault than it has seen', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    const first = await other.read();
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    // The relay puts the first version back (it keeps no history; a dishonest one might).
    const id = other.keys.id;
    const now = await relay.store.get(id);
    await relay.store.update(id, now?.version ?? 0, first.data, Date.now());
    await syncNow();
    expect(useDeviceSync.getState()).toMatchObject({ phase: 'failed' });
    expect(useDeviceSync.getState().error).toMatch(/older copy/);
    expect(takeSnapshot().progress.attempts[0]?.id).toBe('n1');
  });
});

describe('joining from another device', () => {
  async function vaultFromAnotherDevice(): Promise<string[]> {
    const words = await turnOn();
    // This device forgets the phrase, and becomes the second device.
    await stopSync();
    return words;
  }

  it('merges what this device has with the synced data', async () => {
    const words = await vaultFromAnotherDevice();
    load(solvePuzzle(emptySnapshot(), 'mine', T));
    relay.requests = [];
    const joined = await joinSync(words.join(' '), 'merge');
    const here = takeSnapshot();
    // What came in: everything the other device had (used apart, nothing was here already).
    const there = syncTotals(fixtureSnapshot());
    expect(joined).toMatchObject({
      ok: true,
      brought: {
        changed: { puzzles: there.puzzles, repertoires: there.repertoires, games: there.games },
        removed: 0,
      },
      totals: syncTotals(here),
    });
    expect(here.repertoire.custom.map((r) => r.id)).toEqual([REP]);
    expect(here.progress.attempts.map((a) => a.id)).toContain('mine');
    // Used apart until now: both devices' counts add up.
    expect(here.progress.lifetime.attempts).toBe(fixtureSnapshot().progress.lifetime.attempts + 1);
    // What this device added goes up straight away.
    await vi.waitFor(() => expect(relay.puts()).toBe(1));
    const vault = await (await otherDevice(words)).read();
    expect(vault.snapshot.progress.attempts.map((a) => a.id)).toContain('mine');
  });

  it("replaces this device's data, keeping its own backup reminder", async () => {
    const words = await vaultFromAnotherDevice();
    const mine = solvePuzzle(emptySnapshot(), 'mine', T);
    mine.progress.lastBackupAt = 123;
    load(mine);
    expect(await joinSync(words.join(' '), 'replace')).toMatchObject({
      ok: true,
      totals: syncTotals(fixtureSnapshot()),
    });
    const here = takeSnapshot();
    expect(here.progress.attempts.map((a) => a.id)).not.toContain('mine');
    expect(sameProfileData(here, named(fixtureSnapshot()))).toBe(true);
    expect(here.progress.lastBackupAt).toBe(123);
  });

  it('explains a phrase that is mistyped, or that nothing is synced under', async () => {
    const words = await vaultFromAnotherDevice();
    const typo = [...words.slice(0, 11), 'qqqq'].join(' ');
    expect(await joinSync(typo, 'merge')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not in the list/) as unknown,
    });
    expect(
      await joinSync(
        'legal winner thank year wave sausage worth useful legal winner thank yellow',
        'merge',
      ),
    ).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Nothing is synced under this phrase/) as unknown,
    });
    expect(useDeviceSyncStore.getState().secret).toBeNull();
  });
});

describe('ending sync', () => {
  it('stops here when the synced copy was deleted elsewhere, keeping the data', async () => {
    const words = await turnOn();
    await (await otherDevice(words)).remove();
    await syncNow();
    expect(useDeviceSyncStore.getState()).toMatchObject({
      secret: null,
      stoppedBecause: 'deleted',
    });
    expect(useDeviceSync.getState().phase).toBe('off');
    expect(sameProfileData(takeSnapshot(), named(fixtureSnapshot()))).toBe(true);
  });

  it('deletes the synced copy', async () => {
    await turnOn();
    expect(await deleteSyncedCopy()).toEqual({ ok: true });
    expect(relay.store.size()).toBe(0);
    expect(useDeviceSyncStore.getState().secret).toBeNull();
  });

  it('stops in this tab when another tab turned it off', async () => {
    await turnOn();
    useDeviceSyncStore.getState().turnOff();
    expect(useDeviceSync.getState().phase).toBe('off');
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS * 2);
    expect(relay.puts()).toBe(1);
  });
});

describe('forgetSyncBase', () => {
  it('after an import, joins the synced data instead of deleting what the import lacked', async () => {
    await turnOn();
    // An import replaced this device's data with a backup that lacks the repertoire.
    load(deleteRepertoire(takeSnapshot(), REP));
    forgetSyncBase();
    await vi.waitFor(() => expect(useDeviceSync.getState().phase).toBe('done'));
    await syncNow();
    expect(useRepertoire.getState().custom.map((r) => r.id)).toEqual([REP]);
    expect(useProgress.getState().attempts).toHaveLength(
      fixtureSnapshot().progress.attempts.length,
    );
  });
});

/**
 * 0.24: what syncs, part by part. The learner's settings sync with the rest
 * (the device's own stay on it), and each device can keep any part to itself:
 * the vault keeps its own version of that part, and switching it on again
 * merges what changed on both sides meanwhile, counting nothing twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { useProgress } from '@/store/progress';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { installFakeRelay, type FakeRelay } from '@/test/fakeRelay';
import { otherDevice } from '@/test/syncDevices';
import {
  addRepertoire,
  changeSettings,
  emptySnapshot,
  fixtureSnapshot,
  solvePuzzle,
} from '@/test/syncFixtures';
import {
  CHANGE_DELAY_MS,
  joinSync,
  setSyncPart,
  START_DELAY_MS,
  stopSync,
  syncNow,
  turnOnSync,
  useDeviceSync,
} from './deviceSync';
import { dropCopies } from './base';
import type { SyncSnapshot } from './merge';
import { applySnapshot, takeSnapshot } from './snapshot';
import { openSnapshot } from './vaultCrypto';

const T = 1_791_000_000_000;
const REP = 'custom-muofwy80-fruf';
const before = () => fixtureSnapshot().progress;

function load(snapshot: SyncSnapshot) {
  applySnapshot(snapshot, takeSnapshot());
}

let relay: FakeRelay;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  relay = installFakeRelay();
  load(fixtureSnapshot());
});

afterEach(async () => {
  await stopSync();
  // A run still on its way (one a switch started, say) ends before the next test.
  await syncNow();
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

/** Lets the run that turning sync on schedules go by, and waits for it. */
async function afterStartUp() {
  await vi.advanceTimersByTimeAsync(START_DELAY_MS);
  await syncNow();
}

/** Switches a part, and waits for the sync that switching it on starts. */
async function switchPart(part: Parameters<typeof setSyncPart>[0], on: boolean) {
  setSyncPart(part, on);
  await syncNow();
}

const ids = (s: SyncSnapshot) => s.progress.attempts.map((a) => a.id);

describe('settings between devices', () => {
  it("go to the vault with the data, and none of the device's own", async () => {
    useSettings.setState({ boardTheme: 'blue', engineThreads: false, installDismissedAt: 7 });
    const words = await turnOn();
    const other = await otherDevice(words);
    const vault = await other.read();
    expect(vault.snapshot.settings).toMatchObject({ boardTheme: 'blue' });
    const file = JSON.parse(await openSnapshot(other.keys, vault.data)) as {
      settings: Record<string, unknown>;
    };
    expect(file.settings.boardTheme).toBe('blue');
    expect(file.settings).not.toHaveProperty('engineThreads');
    expect(file.settings).not.toHaveProperty('engineFull');
    expect(file.settings).not.toHaveProperty('installDismissedAt');
  });

  it('come in from the other devices, counted, and leave the device’s own alone', async () => {
    useSettings.setState({ engineThreads: false });
    const words = await turnOn();
    await (
      await otherDevice(words)
    ).change((s) => changeSettings(s, { boardTheme: 'green', pieceSet: 'merida' }));
    await syncNow();
    expect(useSettings.getState()).toMatchObject({
      boardTheme: 'green',
      pieceSet: 'merida',
      engineThreads: false,
    });
    expect(useDeviceSync.getState().last).toMatchObject({ brought: { settings: 2 }, sent: null });
  });

  it("go out a few seconds after a change here; the device's own start no sync", async () => {
    const words = await turnOn();
    await afterStartUp();
    relay.requests = [];
    useSettings.getState().update({ engineThreads: false, engineFull: true });
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS + 1000);
    expect(relay.requests).toEqual([]);
    useSettings.getState().update({ boardTheme: 'green' });
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS);
    await syncNow();
    expect(relay.puts()).toBe(1);
    const vault = await (await otherDevice(words)).read();
    expect(vault.snapshot.settings.boardTheme).toBe('green');
    expect(useDeviceSync.getState().last).toMatchObject({ sent: { settings: 1 } });
  });

  it('changed on both devices: the one synced first decides, other changes all stay', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await other.change((s) => changeSettings(s, { boardTheme: 'green', sounds: false }));
    useSettings.getState().update({ boardTheme: 'blue', soundVolume: 0.5 });
    await syncNow();
    const expected = { boardTheme: 'green', sounds: false, soundVolume: 0.5 };
    expect(useSettings.getState()).toMatchObject(expected);
    expect((await other.read()).snapshot.settings).toMatchObject(expected);
  });

  it('changed here stand when the copy of the last version agreed is lost', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    useSettings.getState().update({ boardTheme: 'blue' });
    expect(useDeviceSyncStore.getState().changedSettings).toEqual({ boardTheme: 'blue' });
    await other.change((s) => changeSettings(s, { boardTheme: 'green', pieceSet: 'merida' }));
    // The copy goes (some private windows lose it): the merge has no version to compare with.
    await dropCopies();
    await syncNow();
    const expected = { boardTheme: 'blue', pieceSet: 'merida' };
    expect(useSettings.getState()).toMatchObject(expected);
    expect((await other.read()).snapshot.settings).toMatchObject(expected);
    // In the vault now: no longer news.
    expect(useDeviceSyncStore.getState().changedSettings).toEqual({});
  });

  it('brought in by a sync are no change made here', async () => {
    const words = await turnOn();
    await (await otherDevice(words)).change((s) => changeSettings(s, { boardTheme: 'green' }));
    await syncNow();
    expect(useSettings.getState().boardTheme).toBe('green');
    expect(useDeviceSyncStore.getState().changedSettings).toEqual({});
  });

  it('come to a device joining, which takes the synced ones', async () => {
    useSettings.setState({ boardTheme: 'green' });
    const words = await turnOn();
    await stopSync();
    useSettings.setState({ boardTheme: 'blue', soundVolume: 0.25 });
    const joined = await joinSync(words.join(' '), 'merge');
    expect(joined).toMatchObject({ ok: true, brought: { settings: 2 } });
    expect(useSettings.getState()).toMatchObject({ boardTheme: 'green', soundVolume: 1 });
  });
});

describe('a part this device keeps to itself', () => {
  it('stays as it is here, and the vault keeps its own; the other parts sync', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await switchPart('repertoire', false);
    load(addRepertoire(takeSnapshot(), 'custom-mine', 'Mine', T));
    await other.change((s) => solvePuzzle(addRepertoire(s, 'custom-theirs', 'Theirs', T), 't1', T));
    await syncNow();
    const here = takeSnapshot();
    const vault = (await other.read()).snapshot;
    expect(here.repertoire.custom.map((r) => r.id).sort()).toEqual(['custom-mine', REP]);
    expect(vault.repertoire.custom.map((r) => r.id).sort()).toEqual([REP, 'custom-theirs']);
    // Progress still syncs.
    expect(ids(here)).toContain('t1');
  });

  it('merges what changed on both sides meanwhile when switched on again, counting once', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await switchPart('progress', false);
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await other.change((s) => solvePuzzle(solvePuzzle(s, 't1', T + 1000), 't2', T + 2000));
    await syncNow();
    expect(takeSnapshot().progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
    expect((await other.read()).snapshot.progress.lifetime.attempts).toBe(
      before().lifetime.attempts + 2,
    );

    await switchPart('progress', true);
    for (const p of [takeSnapshot().progress, (await other.read()).snapshot.progress]) {
      expect(p.lifetime.attempts).toBe(before().lifetime.attempts + 3);
      expect(p.ratedAttempts).toBe(before().ratedAttempts + 3);
    }
    expect(ids(takeSnapshot()).slice(0, 3)).toEqual(['t2', 't1', 'n1']);
    expect(useDeviceSync.getState().last).toMatchObject({
      brought: { changed: { puzzles: 2 } },
      sent: { changed: { puzzles: 1 } },
    });

    // Off and on again with nothing new: nothing is counted again, nothing is sent.
    const puts = relay.puts();
    await switchPart('progress', false);
    await switchPart('progress', true);
    await syncNow();
    expect(relay.puts()).toBe(puts);
    expect(takeSnapshot().progress.lifetime.attempts).toBe(before().lifetime.attempts + 3);
  });

  it('switched on again while the vault did not change, sends what changed here once', async () => {
    const words = await turnOn();
    await switchPart('progress', false);
    load(solvePuzzle(takeSnapshot(), 'n1', T));
    await syncNow();
    expect(relay.puts()).toBe(1);
    await switchPart('progress', true);
    await syncNow();
    expect(relay.puts()).toBe(2);
    const vault = (await (await otherDevice(words)).read()).snapshot;
    expect(vault.progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
    expect(takeSnapshot().progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
  });

  it('switched on again with nothing new here, counts what other devices do next once', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await switchPart('progress', false);
    await other.change((s) => solvePuzzle(s, 't1', T));
    await syncNow();
    // Nothing to send when it is switched on: the vault holds everything already.
    const puts = relay.puts();
    await switchPart('progress', true);
    expect(relay.puts()).toBe(puts);
    expect(takeSnapshot().progress.lifetime.attempts).toBe(before().lifetime.attempts + 1);
    await other.change((s) => solvePuzzle(s, 't2', T + 1000));
    await syncNow();
    for (const p of [takeSnapshot().progress, (await other.read()).snapshot.progress]) {
      expect(p.lifetime.attempts).toBe(before().lifetime.attempts + 2);
    }
  });

  it('settings switched on again: a change made here stays, one made on both takes the relay’s', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await switchPart('settings', false);
    useSettings.getState().update({ boardTheme: 'blue', pieceSet: 'merida' });
    await other.change((s) => changeSettings(s, { pieceSet: 'celtic', sounds: false }));
    await syncNow();
    expect(useSettings.getState()).toMatchObject({ pieceSet: 'merida', sounds: true });

    await switchPart('settings', true);
    const expected = { boardTheme: 'blue', pieceSet: 'celtic', sounds: false };
    expect(useSettings.getState()).toMatchObject(expected);
    expect((await other.read()).snapshot.settings).toMatchObject(expected);
  });

  it('settings switched on again with the copy lost: what changed here still stands', async () => {
    const words = await turnOn();
    const other = await otherDevice(words);
    await switchPart('settings', false);
    useSettings.getState().update({ showLegalMoves: false });
    await other.change((s) => changeSettings(s, { showCoordinates: false }));
    await syncNow();
    expect(useDeviceSyncStore.getState().changedSettings).toEqual({ showLegalMoves: false });
    await dropCopies();
    await switchPart('settings', true);
    const expected = { showLegalMoves: false, showCoordinates: false };
    expect(useSettings.getState()).toMatchObject(expected);
    expect((await other.read()).snapshot.settings).toMatchObject(expected);
  });

  it('starts empty in a vault turned on without it, and joins it when switched on', async () => {
    setSyncPart('repertoire', false);
    const words = await turnOn();
    const other = await otherDevice(words);
    expect((await other.read()).snapshot.repertoire.custom).toEqual([]);
    await other.change((s) => addRepertoire(s, 'custom-theirs', 'Theirs', T));
    await switchPart('repertoire', true);
    const expected = [REP, 'custom-theirs'];
    expect(
      takeSnapshot()
        .repertoire.custom.map((r) => r.id)
        .sort(),
    ).toEqual(expected);
    expect((await other.read()).snapshot.repertoire.custom.map((r) => r.id).sort()).toEqual(
      expected,
    );
  });

  it('stays as it is on a device joining, which sends none of it, nor counts it', async () => {
    useSettings.setState({ boardTheme: 'green' });
    const words = await turnOn();
    await stopSync();
    setSyncPart('settings', false);
    setSyncPart('repertoire', false);
    useSettings.setState({ boardTheme: 'blue' });
    load(solvePuzzle(emptySnapshot(), 'mine', T));
    const joined = await joinSync(words.join(' '), 'merge');
    expect(joined).toMatchObject({ ok: true, totals: { repertoires: 0, moves: 0 } });
    expect(joined.ok && joined.brought?.settings).toBe(0);
    expect(useSettings.getState().boardTheme).toBe('blue');
    expect(takeSnapshot().repertoire.custom).toEqual([]);
    await syncNow();
    const vault = (await (await otherDevice(words)).read()).snapshot;
    expect(vault.settings.boardTheme).toBe('green');
    expect(vault.repertoire.custom.map((r) => r.id)).toEqual([REP]);
    expect(ids(vault)).toContain('mine');
  });

  it("is the device's own choice, kept when sync goes off and on again", async () => {
    setSyncPart('games', false);
    await turnOn();
    await stopSync();
    expect(useDeviceSyncStore.getState().off).toEqual(['games']);
    expect(useProgress.getState().lineage).toHaveLength(1);
  });
});

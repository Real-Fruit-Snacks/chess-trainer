/**
 * The page can close at any moment of a sync: a phone locks, a tab is thrown
 * away. Whatever moment it is, the next start must count everything once.
 * "Closing" here is `vi.resetModules()`: fresh module instances, so the
 * stores read back what localStorage holds and nothing stays in memory; the
 * Cache API (a fake shared between the two "pages") and the relay remain.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCaches } from '@/test/fakeCaches';
import { type FakeRelay, installFakeRelay } from '@/test/fakeRelay';

const T = 1_791_000_000_000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  localStorage.clear();
});

/** One page of the app: its own module instances. */
async function page() {
  return {
    sync: await import('./deviceSync'),
    snapshot: await import('./snapshot'),
    fixtures: await import('@/test/syncFixtures'),
    devices: await import('@/test/syncDevices'),
    store: await import('@/store/deviceSync'),
  };
}

type Moment = 'reading' | 'writing' | 'answer';

const MOMENTS: [Moment, string][] = [
  ['reading', 'while it keeps the copy of what it read, before anything here changes'],
  ['writing', 'after the merge, while it keeps the copy of what it is about to write'],
  ['answer', 'after its write reached the relay, before the answer came back'],
];

describe('the page closing in the middle of a sync', () => {
  for (const [moment, when] of MOMENTS) {
    it(`counts everything once at the next start: ${when}`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const caches = fakeCaches();
      vi.stubGlobal('caches', caches.api);
      const relay: FakeRelay = installFakeRelay();
      vi.resetModules();

      const first = await page();
      const { fixtureSnapshot, solvePuzzle } = first.fixtures;
      const take = () => first.snapshot.takeSnapshot();
      first.snapshot.applySnapshot(fixtureSnapshot(), take());
      const on = await first.sync.turnOnSync();
      if (!on.ok) throw new Error(on.reason);
      const other = await first.devices.otherDevice(on.words);
      await other.change((s) => solvePuzzle(s, 'there', T));
      first.snapshot.applySnapshot(solvePuzzle(take(), 'here', T + 1000), take());

      // The copies this run keeps: the vault as read, then what it writes.
      let puts = 0;
      let stuck = false;
      caches.onPut = () => {
        puts++;
        const at = moment === 'reading' ? 1 : moment === 'writing' ? 2 : 0;
        if (puts !== at) return undefined;
        stuck = true;
        return 'hang';
      };
      if (moment === 'answer') {
        relay.loseAnswer = (method) => {
          if (method !== 'PUT') return false;
          stuck = true;
          return true;
        };
      }
      void first.sync.syncNow();
      await vi.waitFor(() => expect(stuck).toBe(true));
      if (moment === 'answer') {
        await vi.waitFor(() => expect(first.sync.useDeviceSync.getState().phase).toBe('failed'));
      }
      caches.onPut = null;
      relay.loseAnswer = null;

      // The app starts again.
      vi.resetModules();
      const second = await page();
      await second.sync.syncNow();
      expect(second.sync.useDeviceSync.getState().phase).toBe('done');

      const before = fixtureSnapshot().progress;
      const vault = await other.read();
      for (const p of [vault.snapshot.progress, second.snapshot.takeSnapshot().progress]) {
        expect(p.attempts.slice(0, 2).map((a) => a.id)).toEqual(['here', 'there']);
        expect(p.lifetime.attempts).toBe(before.lifetime.attempts + 2);
        expect(p.ratedAttempts).toBe(before.ratedAttempts + 2);
      }
      expect(second.store.useDeviceSyncStore.getState().pending).toBeNull();
      await second.sync.stopSync();
    });
  }
});

describe('a part kept to this device', () => {
  it('keeps the version it last shared across a restart, and counts once when synced again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const caches = fakeCaches();
    vi.stubGlobal('caches', caches.api);
    installFakeRelay();
    vi.resetModules();

    const first = await page();
    const { fixtureSnapshot, solvePuzzle } = first.fixtures;
    const take = () => first.snapshot.takeSnapshot();
    first.snapshot.applySnapshot(fixtureSnapshot(), take());
    const on = await first.sync.turnOnSync();
    if (!on.ok) throw new Error(on.reason);
    const other = await first.devices.otherDevice(on.words);
    first.sync.setSyncPart('progress', false);
    await first.sync.syncNow();
    first.snapshot.applySnapshot(solvePuzzle(take(), 'here', T), take());
    await other.change((s) => solvePuzzle(s, 'there', T + 1000));
    await first.sync.syncNow();

    // The app starts again, and the learner syncs progress again.
    vi.resetModules();
    const second = await page();
    expect(second.store.useDeviceSyncStore.getState().off).toEqual(['progress']);
    second.sync.setSyncPart('progress', true);
    await second.sync.syncNow();

    const before = fixtureSnapshot().progress;
    const vault = await other.read();
    for (const p of [vault.snapshot.progress, second.snapshot.takeSnapshot().progress]) {
      expect(p.attempts.slice(0, 2).map((a) => a.id)).toEqual(['there', 'here']);
      expect(p.lifetime.attempts).toBe(before.lifetime.attempts + 2);
      expect(p.ratedAttempts).toBe(before.ratedAttempts + 2);
    }
    await second.sync.stopSync();
  });
});

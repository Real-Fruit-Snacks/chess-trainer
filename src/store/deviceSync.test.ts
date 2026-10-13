import { afterEach, describe, expect, it } from 'vitest';
import { deviceSyncStorageKey } from '@/lib/sync/enabled';
import { useDeviceSyncStore } from './deviceSync';

const SECRET = 'AAECAwQFBgcICQoLDA0ODw';

async function stored(state: Record<string, unknown>) {
  localStorage.setItem(deviceSyncStorageKey(), JSON.stringify({ state, version: 1 }));
  await useDeviceSyncStore.persist.rehydrate();
  return useDeviceSyncStore.getState();
}

afterEach(() => {
  useDeviceSyncStore.getState().turnOff();
  localStorage.clear();
});

describe('the device-sync store', () => {
  it('keeps a sound stored state as it is', async () => {
    const state = await stored({
      secret: SECRET,
      device: 'device-abc-123',
      etag: '"7"',
      generation: 7,
      base: 'copy-abcdef12',
      mark: 'mark-1',
      pending: { generation: 8, copy: 'copy-12345678' },
      lastSyncAt: 1,
      since: 0,
      stoppedBecause: null,
    });
    expect(state).toMatchObject({
      secret: SECRET,
      device: 'device-abc-123',
      etag: '"7"',
      generation: 7,
      base: 'copy-abcdef12',
      mark: 'mark-1',
      pending: { generation: 8, copy: 'copy-12345678' },
    });
  });

  it('repairs what does not read: a new device id, no pending write, no base', async () => {
    const state = await stored({
      secret: SECRET,
      device: 7,
      etag: '"3"',
      generation: 3,
      base: '../../etc',
      mark: 5,
      pending: { generation: 0, copy: 'copy-12345678' },
    });
    expect(state.secret).toBe(SECRET);
    expect(state.device).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(state).toMatchObject({ base: null, mark: null, pending: null, generation: 3 });
  });

  it('is off, and forgets the rest, without a sound secret', async () => {
    const state = await stored({
      secret: 'not-a-secret',
      device: 'device-abc-123',
      etag: '"3"',
      generation: 3,
      pending: { generation: 4, copy: 'copy-12345678' },
      stoppedBecause: 'deleted',
    });
    expect(state).toMatchObject({
      secret: null,
      device: null,
      etag: null,
      generation: 0,
      pending: null,
      stoppedBecause: 'deleted',
    });
  });

  it('keeps the parts kept here and the settings changed here, each in its own way', async () => {
    const state = await stored({
      secret: SECRET,
      device: 'device-abc-123',
      off: ['settings', 'nonsense', 'games', 'settings'],
      changedSettings: { boardTheme: 'blue' },
    });
    expect(state.off).toEqual(['settings', 'games']);
    expect(state.changedSettings).toEqual({ boardTheme: 'blue' });
    // Sync turned off forgets what changed here, and keeps what this device keeps to itself.
    useDeviceSyncStore.getState().turnOff();
    expect(useDeviceSyncStore.getState()).toMatchObject({
      off: ['settings', 'games'],
      changedSettings: {},
    });
    expect((await stored({ secret: SECRET, changedSettings: ['x'] })).changedSettings).toEqual({});
  });

  it('settles a pending write when a version is agreed', () => {
    const store = useDeviceSyncStore.getState();
    store.turnOn({
      secret: SECRET,
      device: 'device-abc-123',
      etag: '"1"',
      generation: 1,
      base: 'copy-11111111',
      mark: '',
    });
    useDeviceSyncStore.getState().sending({ generation: 2, copy: 'copy-22222222' });
    expect(useDeviceSyncStore.getState().pending).toEqual({ generation: 2, copy: 'copy-22222222' });
    useDeviceSyncStore
      .getState()
      .agreed({ etag: '"2"', generation: 2, base: 'copy-22222222', mark: '' }, 5);
    expect(useDeviceSyncStore.getState()).toMatchObject({
      etag: '"2"',
      generation: 2,
      base: 'copy-22222222',
      pending: null,
      lastSyncAt: 5,
    });
  });
});

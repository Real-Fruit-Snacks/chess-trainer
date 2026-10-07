import { describe, expect, it } from 'vitest';
import type { DeviceSyncStatus } from '@/lib/sync/deviceSync';
import { deviceSyncNeedsAttention, deviceSyncStatusLine } from './deviceSyncStatus';

const NOW = 1_791_000_000_000;
const status = (patch: Partial<DeviceSyncStatus>): DeviceSyncStatus => ({
  phase: 'done',
  error: null,
  last: null,
  ...patch,
});

describe('deviceSyncStatusLine', () => {
  it('says when the last sync finished', () => {
    expect(deviceSyncStatusLine(status({}), null, NOW)).toBe('Not synced yet.');
    expect(deviceSyncStatusLine(status({}), NOW - 10_000, NOW)).toBe('Synced just now.');
    expect(deviceSyncStatusLine(status({ phase: 'idle' }), NOW - 5 * 60_000, NOW)).toBe(
      'Synced 5 minutes ago.',
    );
  });

  it('describes a sync under way, offline or stuck', () => {
    expect(deviceSyncStatusLine(status({ phase: 'syncing' }), NOW, NOW)).toBe('Syncing…');
    expect(deviceSyncStatusLine(status({ phase: 'offline' }), NOW, NOW)).toMatch(/^Offline/);
    expect(
      deviceSyncStatusLine(
        status({ phase: 'failed', error: 'The sync service answered 500.' }),
        NOW,
        NOW,
      ),
    ).toBe('The last sync did not finish: The sync service answered 500.');
    expect(deviceSyncStatusLine(status({ phase: 'too-large' }), NOW, NOW)).toMatch(/make room/);
    expect(deviceSyncStatusLine(status({ phase: 'newer' }), NOW, NOW)).toMatch(/Update the app/);
  });

  it('flags the states the learner has to act on', () => {
    expect(deviceSyncNeedsAttention(status({ phase: 'failed' }))).toBe(true);
    expect(deviceSyncNeedsAttention(status({ phase: 'newer' }))).toBe(true);
    expect(deviceSyncNeedsAttention(status({ phase: 'too-large' }))).toBe(true);
    expect(deviceSyncNeedsAttention(status({ phase: 'offline' }))).toBe(false);
    expect(deviceSyncNeedsAttention(status({ phase: 'done' }))).toBe(false);
  });
});

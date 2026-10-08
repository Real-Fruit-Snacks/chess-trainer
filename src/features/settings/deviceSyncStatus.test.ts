import { describe, expect, it } from 'vitest';
import type { DeviceSyncStatus } from '@/lib/sync/deviceSync';
import type { SyncChanges } from '@/lib/sync/counts';
import {
  describeChanges,
  describeExchange,
  describeTotals,
  deviceSyncNeedsAttention,
  deviceSyncStatusLine,
  listOf,
} from './deviceSyncStatus';

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

const changes = (
  changed: Partial<SyncChanges['changed']>,
  removed = 0,
  other = false,
  settings = 0,
): SyncChanges => ({
  changed: { puzzles: 0, lessons: 0, repertoires: 0, moves: 0, analyses: 0, games: 0, ...changed },
  settings,
  removed,
  other,
});

describe('listOf', () => {
  it('joins one, two or more parts as a sentence does', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['a'])).toBe('a');
    expect(listOf(['a', 'b'])).toBe('a and b');
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('describeChanges', () => {
  it('lists each kind that changed, in order, with its count', () => {
    expect(describeChanges(changes({ analyses: 1, puzzles: 4, lessons: 1 }))).toBe(
      '4 puzzles, 1 lesson and 1 analysis',
    );
    expect(describeChanges(changes({ moves: 12, games: 2 }))).toBe(
      '12 repertoire moves and 2 imported games',
    );
    expect(describeChanges(changes({ puzzles: 1240 }))).toBe('1,240 puzzles');
  });

  it('counts deletions, and calls anything else progress', () => {
    expect(describeChanges(changes({ repertoires: 1 }, 2))).toBe('1 repertoire and 2 deletions');
    expect(describeChanges(changes({}, 1))).toBe('1 deletion');
    expect(describeChanges(changes({}, 0, true))).toBe('progress');
    // Progress beside counted changes goes without saying (a rating moves with puzzles).
    expect(describeChanges(changes({ puzzles: 2 }, 0, true))).toBe('2 puzzles');
  });

  it('counts the settings after the data, before the deletions', () => {
    expect(describeChanges(changes({}, 0, false, 1))).toBe('1 setting');
    expect(describeChanges(changes({ puzzles: 3 }, 1, false, 2))).toBe(
      '3 puzzles, 2 settings and 1 deletion',
    );
    // Progress that changed uncounted is said beside the settings: they say nothing of it.
    expect(describeChanges(changes({}, 0, true, 2))).toBe('progress and 2 settings');
    expect(describeChanges(changes({ puzzles: 1 }, 0, true, 2))).toBe('1 puzzle and 2 settings');
  });

  it('says nothing for no changes', () => {
    expect(describeChanges(null)).toBeNull();
    expect(describeChanges(changes({}))).toBeNull();
  });
});

describe('describeTotals', () => {
  it('lists what a profile holds, leaving out what it has none of', () => {
    expect(
      describeTotals({
        puzzles: 1240,
        lessons: 1,
        repertoires: 0,
        moves: 0,
        analyses: 12,
        games: 0,
      }),
    ).toBe('1,240 puzzles, 1 lesson completed and 12 saved analyses');
    expect(
      describeTotals({ puzzles: 0, lessons: 0, repertoires: 0, moves: 0, analyses: 0, games: 0 }),
    ).toBeNull();
  });
});

describe('describeExchange', () => {
  it('says what came in and what went out', () => {
    expect(
      describeExchange({
        at: NOW,
        brought: changes({ puzzles: 4, analyses: 1 }),
        sent: changes({ games: 2 }),
      }),
    ).toBe('4 puzzles and 1 analysis from your other devices; 2 imported games sent.');
    expect(describeExchange({ at: NOW, brought: null, sent: changes({ puzzles: 1 }) })).toBe(
      '1 puzzle sent.',
    );
    expect(describeExchange({ at: NOW, brought: changes({}, 0, true), sent: null })).toBe(
      'Progress from your other devices.',
    );
  });

  it('says nothing when a run moved nothing', () => {
    expect(describeExchange(null)).toBeNull();
    expect(describeExchange({ at: NOW, brought: null, sent: null })).toBeNull();
  });
});

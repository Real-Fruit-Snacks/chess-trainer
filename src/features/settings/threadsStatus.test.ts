import { describe, expect, it } from 'vitest';
import { describeThreadsStatus, threadsStatus } from './threadsStatus';

const ready = { isolated: true, sharedMemory: true, serviceWorker: true };

describe('threadsStatus', () => {
  it('is off when the setting is off, whatever the page can do', () => {
    expect(threadsStatus(false, ready, 8)).toEqual({ kind: 'off' });
  });

  it('reports the thread count once the page is isolated', () => {
    expect(threadsStatus(true, ready, 8)).toEqual({ kind: 'active', threads: 7 });
  });

  it('asks for a reload when the service worker can apply the headers', () => {
    expect(threadsStatus(true, { ...ready, isolated: false }, 8)).toEqual({ kind: 'reload' });
    expect(
      threadsStatus(true, { isolated: false, sharedMemory: false, serviceWorker: false }, 8),
    ).toEqual({ kind: 'no-service-worker' });
  });

  it('flags devices that cannot benefit, and says which way', () => {
    expect(threadsStatus(true, { ...ready, sharedMemory: false }, 8)).toEqual({
      kind: 'unsupported',
      reason: 'no-shared-memory',
    });
    expect(threadsStatus(true, ready, 1)).toEqual({ kind: 'unsupported', reason: 'few-cores' });
    // Two cores leave one for the engine: no better than single-threaded; a hidden count likewise.
    expect(threadsStatus(true, ready, 2)).toEqual({ kind: 'unsupported', reason: 'few-cores' });
    expect(threadsStatus(true, ready, undefined)).toEqual({
      kind: 'unsupported',
      reason: 'few-cores',
    });
    expect(describeThreadsStatus(threadsStatus(true, ready, 2))).toMatch(/fewer than three/i);
    expect(describeThreadsStatus(threadsStatus(true, ready, 2))).toMatch(/hidden/);
  });

  it('tells a browser without service workers from one whose worker has not taken over yet', () => {
    const none = { isolated: false, sharedMemory: false, serviceWorker: false };
    expect(threadsStatus(true, none, 8, true)).toEqual({ kind: 'no-service-worker' });
    expect(threadsStatus(true, none, 8, false)).toEqual({ kind: 'service-worker-unsupported' });
    expect(describeThreadsStatus({ kind: 'service-worker-unsupported' })).toMatch(
      /no service worker/,
    );
  });

  it('has wording for every state', () => {
    for (const status of [
      threadsStatus(false, ready, 8),
      threadsStatus(true, ready, 8),
      threadsStatus(true, { ...ready, isolated: false }, 8),
      threadsStatus(true, { isolated: false, sharedMemory: false, serviceWorker: false }, 8),
      threadsStatus(true, ready, 1),
    ]) {
      expect(describeThreadsStatus(status).length).toBeGreaterThan(20);
    }
    expect(describeThreadsStatus({ kind: 'active', threads: 3 })).toContain('3 threads');
  });
});

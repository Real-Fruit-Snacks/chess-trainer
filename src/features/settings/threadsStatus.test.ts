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

  it('flags devices that cannot benefit', () => {
    expect(threadsStatus(true, { ...ready, sharedMemory: false }, 8)).toEqual({
      kind: 'unsupported',
    });
    expect(threadsStatus(true, ready, 1)).toEqual({ kind: 'unsupported' });
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

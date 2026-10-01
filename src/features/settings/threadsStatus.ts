import { chooseEngineBuild } from '@/engine/build';
import type { IsolationSupport } from '@/sw/isolation';

export type ThreadsStatus =
  | { kind: 'off' }
  | { kind: 'active'; threads: number }
  | { kind: 'reload' }
  | { kind: 'no-service-worker' }
  | { kind: 'unsupported' };

/**
 * Works out what to tell the learner about the threaded engine. Pure, so the
 * wording can be unit-tested without a browser.
 */
export function threadsStatus(
  enabled: boolean,
  support: IsolationSupport,
  cores: number | undefined,
): ThreadsStatus {
  if (!enabled) return { kind: 'off' };
  if (support.isolated) {
    const choice = chooseEngineBuild(true, {
      isolated: true,
      sharedMemory: support.sharedMemory,
      cores,
    });
    if (choice.build === 'multi') return { kind: 'active', threads: choice.threads };
    return { kind: 'unsupported' };
  }
  return support.serviceWorker ? { kind: 'reload' } : { kind: 'no-service-worker' };
}

export function describeThreadsStatus(status: ThreadsStatus): string {
  switch (status.kind) {
    case 'off':
      return 'Off — the engine runs on one core, which is plenty for puzzles and casual games.';
    case 'active':
      return `On — the engine is using ${status.threads} threads on this device.`;
    case 'reload':
      return 'Reload the app to switch on cross-origin isolation and start the threaded engine.';
    case 'no-service-worker':
      return 'Waiting for the offline service worker to take over this page — reload once, then again if needed.';
    case 'unsupported':
      return 'This browser or device cannot run the threaded engine (no shared memory or only one core); the single-threaded build is used.';
  }
}

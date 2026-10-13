import { chooseEngineBuild } from '@/engine/build';
import type { IsolationSupport } from '@/sw/isolation';

export type ThreadsStatus =
  | { kind: 'off' }
  | { kind: 'active'; threads: number }
  /**
   * On, but this page is not isolated yet: the service worker isolates the
   * next load (on a first visit, once it has taken over — which changes
   * nothing about what to do, so the wording stays put when it does).
   */
  | { kind: 'reload' }
  /** The browser has no service workers at all (private mode in some browsers, old WebViews). */
  | { kind: 'service-worker-unsupported' }
  | { kind: 'unsupported'; reason: 'no-shared-memory' | 'few-cores' };

/**
 * Works out what to tell the learner about the threaded engine. Pure, so the
 * wording can be unit-tested without a browser. `serviceWorkerApi` says whether
 * the browser has service workers at all (`'serviceWorker' in navigator`).
 */
export function threadsStatus(
  enabled: boolean,
  support: IsolationSupport,
  cores: number | undefined,
  serviceWorkerApi = true,
): ThreadsStatus {
  if (!enabled) return { kind: 'off' };
  if (support.isolated) {
    const choice = chooseEngineBuild(true, {
      isolated: true,
      sharedMemory: support.sharedMemory,
      cores,
    });
    if (choice.build === 'multi') return { kind: 'active', threads: choice.threads };
    return {
      kind: 'unsupported',
      reason: choice.reason === 'no-shared-memory' ? 'no-shared-memory' : 'few-cores',
    };
  }
  return serviceWorkerApi ? { kind: 'reload' } : { kind: 'service-worker-unsupported' };
}

export function describeThreadsStatus(status: ThreadsStatus): string {
  switch (status.kind) {
    case 'off':
      return 'Off — the engine runs on one core, which is plenty for puzzles and casual games.';
    case 'active':
      return `On — the engine is using ${status.threads} threads on this device.`;
    case 'reload':
      return 'On from the next load: reload the app to start the threaded engine.';
    case 'service-worker-unsupported':
      return 'This browser has no service worker, so the headers the threaded engine needs cannot be added; the single-threaded build is used.';
    case 'unsupported':
      return status.reason === 'no-shared-memory'
        ? 'This browser does not expose shared memory, so the threaded engine cannot run; the single-threaded build is used.'
        : 'Fewer than three CPU cores are reported, or the count is hidden, so threads would not help; the single-threaded build is used.';
  }
}

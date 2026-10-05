import { toast } from '@/components/ui/toastStore';
import { chooseEngineBuild, type EngineBuild, type ThreadEnvironment } from '@/engine/build';
import { fetchBuild, isBuildDownloaded, removeFullEngine } from '@/engine/fullEngine';

/* ------------------------------------------------------------------ */
/* Which full build this device would download                          */
/* ------------------------------------------------------------------ */

export type FullEngineTarget =
  /** No Cache API or no service workers: the full engine could not be kept offline. */
  | { kind: 'unsupported' }
  /** Service workers exist but none controls the page yet (the first visit). */
  | { kind: 'needs-worker' }
  /** Threads are on but the page is not isolated yet: the threaded build comes after a reload. */
  | { kind: 'needs-reload' }
  | { kind: 'ready'; build: EngineBuild };

export interface DownloadPlatform {
  cacheApi: boolean;
  serviceWorkerApi: boolean;
  /** A service worker controls the page, so what is fetched is kept. */
  controlled: boolean;
}

export function detectDownloadPlatform(): DownloadPlatform {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  return {
    cacheApi: typeof caches !== 'undefined',
    serviceWorkerApi: sw !== undefined,
    controlled: !!sw?.controller,
  };
}

/**
 * The full build to download here: the one the engine would start with these
 * settings. While threads are on but the page is not isolated yet, nothing:
 * the next load runs the threaded build, and downloading the one-thread build
 * now would only mean a second 99 MB later.
 */
export function fullEngineTarget(
  wantThreads: boolean,
  env: ThreadEnvironment,
  platform: DownloadPlatform,
): FullEngineTarget {
  if (!platform.cacheApi || !platform.serviceWorkerApi) return { kind: 'unsupported' };
  if (!platform.controlled) return { kind: 'needs-worker' };
  const choice = chooseEngineBuild(wantThreads, env, true);
  if (choice.reason === 'not-isolated') return { kind: 'needs-reload' };
  return { kind: 'ready', build: choice.build };
}

/* ------------------------------------------------------------------ */
/* The download task, which outlives the Settings page                 */
/* ------------------------------------------------------------------ */

export interface EngineDownloadProgress {
  build: EngineBuild;
  /** Bytes of the engine binary received so far. */
  received: number;
  /** Its size (0 until the response arrives). */
  total: number;
}

interface DownloadTask {
  progress: EngineDownloadProgress;
  controller: AbortController;
}

/** The running download, if any: module-level so leaving Settings does not stop it. */
let task: DownloadTask | null = null;
const listeners = new Set<() => void>();
/** Progress arrives in small chunks: listeners hear about it at most this often. */
const NOTIFY_EVERY_MS = 200;
let lastNotified = 0;

function notify(force = false): void {
  const now = Date.now();
  if (!force && now - lastNotified < NOTIFY_EVERY_MS) return;
  lastNotified = now;
  for (const listener of listeners) listener();
}

/** Subscribes to changes of the running download; returns the unsubscribe. */
export function subscribeToEngineDownload(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current progress, or null when nothing is downloading. */
export function currentEngineDownload(): EngineDownloadProgress | null {
  return task ? { ...task.progress } : null;
}

/** Why a download failed, in words: the browser's own messages are terse ("Failed to fetch"). */
export function describeFailure(err: unknown): string {
  // A network failure is the one TypeError fetch throws.
  if (err instanceof TypeError) return 'the network could not be reached.';
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'there is not enough storage space on this device.';
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Downloads a full build unless a download is already running. The files are
 * stored as they arrive; the result is announced once, on whichever page is
 * open by then. `onDone` hears whether the files are stored.
 */
export function startEngineDownload(build: EngineBuild, onDone?: (stored: boolean) => void): void {
  if (task) return;
  const controller = new AbortController();
  task = { progress: { build, received: 0, total: 0 }, controller };
  notify(true);
  void (async () => {
    try {
      await fetchBuild(
        build,
        (received, total) => {
          if (task) task.progress = { build, received, total };
          notify();
        },
        controller.signal,
      );
      const stored = await isBuildDownloaded(build);
      // The other full build (threads switched since it was fetched) is of no use now.
      if (stored) await removeFullEngine(build);
      onDone?.(stored);
      if (stored) {
        toast(
          'The full engine is downloaded: every page that starts the engine from now on uses it.',
          { tone: 'success' },
        );
      } else {
        toast(
          'The full engine was fetched but could not be stored, perhaps for want of space; the lite engine keeps running.',
          { tone: 'warning' },
        );
      }
    } catch (err) {
      onDone?.(false);
      if (!controller.signal.aborted) {
        toast(`The download stopped: ${describeFailure(err)}`, { tone: 'warning' });
      }
    } finally {
      task = null;
      notify(true);
    }
  })();
}

export function stopEngineDownload(): void {
  task?.controller.abort();
}

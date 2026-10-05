import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FullEngineModule from '@/engine/fullEngine';

const engine = vi.hoisted(() => ({
  fetchBuild: vi.fn(),
  isBuildDownloaded: vi.fn(() => Promise.resolve(false)),
  removeFullEngine: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/engine/fullEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof FullEngineModule>()),
  ...engine,
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toastStore', () => ({ toast }));

import {
  currentEngineDownload,
  describeFailure,
  type DownloadPlatform,
  fullEngineTarget,
  startEngineDownload,
  stopEngineDownload,
  subscribeToEngineDownload,
} from './fullEngineDownload';

const CONTROLLED: DownloadPlatform = { cacheApi: true, serviceWorkerApi: true, controlled: true };
const ISOLATED = { isolated: true, sharedMemory: true, cores: 8 };

describe('fullEngineTarget', () => {
  it('needs the Cache API and service workers', () => {
    expect(fullEngineTarget(true, ISOLATED, { ...CONTROLLED, cacheApi: false })).toEqual({
      kind: 'unsupported',
    });
    expect(
      fullEngineTarget(true, ISOLATED, {
        ...CONTROLLED,
        serviceWorkerApi: false,
        controlled: false,
      }),
    ).toEqual({ kind: 'unsupported' });
  });

  it('waits for the service worker to control the page', () => {
    expect(fullEngineTarget(true, ISOLATED, { ...CONTROLLED, controlled: false })).toEqual({
      kind: 'needs-worker',
    });
  });

  it('waits for the reload that isolates the page before fetching a one-thread build', () => {
    expect(fullEngineTarget(true, { ...ISOLATED, isolated: false }, CONTROLLED)).toEqual({
      kind: 'needs-reload',
    });
  });

  it('picks the build the engine would start', () => {
    expect(fullEngineTarget(true, ISOLATED, CONTROLLED)).toEqual({
      kind: 'ready',
      build: 'full-multi',
    });
    expect(fullEngineTarget(false, { ...ISOLATED, isolated: false }, CONTROLLED)).toEqual({
      kind: 'ready',
      build: 'full-single',
    });
    // Threads cannot help here, so the one-thread build is the one to fetch.
    expect(fullEngineTarget(true, { ...ISOLATED, cores: 2 }, CONTROLLED)).toEqual({
      kind: 'ready',
      build: 'full-single',
    });
    expect(fullEngineTarget(true, { ...ISOLATED, sharedMemory: false }, CONTROLLED)).toEqual({
      kind: 'ready',
      build: 'full-single',
    });
  });
});

/** A download the test finishes by hand. */
function deferredFetch() {
  let resolve: () => void = () => undefined;
  let reject: (err: unknown) => void = () => undefined;
  let report: (received: number, total: number) => void = () => undefined;
  let signal: AbortSignal | undefined;
  engine.fetchBuild.mockImplementation(
    (_build: string, onProgress: typeof report, abort?: AbortSignal) => {
      report = onProgress;
      signal = abort;
      return new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
        abort?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
      });
    },
  );
  return {
    progress: (received: number, total: number) => report(received, total),
    finish: () => resolve(),
    fail: (err: unknown) => reject(err),
    signal: () => signal,
  };
}

/** Lets the download's promise chain run. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('the download task', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    engine.fetchBuild.mockReset();
    engine.isBuildDownloaded.mockReset();
    engine.isBuildDownloaded.mockResolvedValue(false);
    engine.removeFullEngine.mockClear();
    toast.mockClear();
  });
  afterEach(async () => {
    stopEngineDownload();
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('reports progress, keeps only the new build and announces the result', async () => {
    const download = deferredFetch();
    const heard = vi.fn();
    const unsubscribe = subscribeToEngineDownload(heard);
    const done = vi.fn();
    startEngineDownload('full-multi', done);
    expect(currentEngineDownload()).toEqual({ build: 'full-multi', received: 0, total: 0 });
    expect(heard).toHaveBeenCalledTimes(1);

    // A second request while one runs changes nothing.
    startEngineDownload('full-single');
    expect(engine.fetchBuild).toHaveBeenCalledTimes(1);

    download.progress(1_000_000, 99_000_000);
    expect(currentEngineDownload()).toEqual({
      build: 'full-multi',
      received: 1_000_000,
      total: 99_000_000,
    });
    // Progress is passed on at most every 200 ms.
    download.progress(2_000_000, 99_000_000);
    expect(heard).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    download.progress(3_000_000, 99_000_000);
    expect(heard).toHaveBeenCalledTimes(2);

    engine.isBuildDownloaded.mockResolvedValue(true);
    download.finish();
    await settle();
    expect(done).toHaveBeenCalledWith(true);
    expect(engine.removeFullEngine).toHaveBeenCalledWith('full-multi');
    expect(toast).toHaveBeenCalledWith(
      'The full engine is downloaded: every page that starts the engine from now on uses it.',
      { tone: 'success' },
    );
    expect(currentEngineDownload()).toBeNull();
    unsubscribe();
  });

  it('says so when the files are not in storage afterwards', async () => {
    const download = deferredFetch();
    const done = vi.fn();
    startEngineDownload('full-single', done);
    download.finish();
    await settle();
    expect(done).toHaveBeenCalledWith(false);
    expect(engine.removeFullEngine).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/could not be stored/), {
      tone: 'warning',
    });
    expect(currentEngineDownload()).toBeNull();
  });

  it('stops quietly when asked', async () => {
    const download = deferredFetch();
    const done = vi.fn();
    startEngineDownload('full-multi', done);
    stopEngineDownload();
    expect(download.signal()?.aborted).toBe(true);
    await settle();
    expect(done).toHaveBeenCalledWith(false);
    expect(toast).not.toHaveBeenCalled();
    expect(currentEngineDownload()).toBeNull();
  });

  it('reports a failed download', async () => {
    const download = deferredFetch();
    startEngineDownload('full-multi');
    download.fail(new Error('The engine could not be fetched (HTTP 503).'));
    await settle();
    expect(toast).toHaveBeenCalledWith(
      'The download stopped: The engine could not be fetched (HTTP 503).',
      { tone: 'warning' },
    );
    expect(currentEngineDownload()).toBeNull();
  });
});

describe('describeFailure', () => {
  it("puts the browser's terse errors in words", () => {
    expect(describeFailure(new TypeError('Failed to fetch'))).toBe(
      'the network could not be reached.',
    );
    expect(
      describeFailure(new DOMException('The quota has been exceeded.', 'QuotaExceededError')),
    ).toBe('there is not enough storage space on this device.');
    expect(describeFailure(new Error('The engine could not be fetched (HTTP 503).'))).toBe(
      'The engine could not be fetched (HTTP 503).',
    );
    expect(describeFailure('odd')).toBe('odd');
  });
});

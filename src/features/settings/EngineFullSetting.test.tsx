import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';
import type * as BuildModule from '@/engine/build';
import type * as FullEngineModule from '@/engine/fullEngine';
import { useSettings } from '@/store/settings';
import type * as DownloadModule from './fullEngineDownload';

const device = vi.hoisted(() => ({
  env: { isolated: true, sharedMemory: true, cores: 8, mobile: false },
  platform: { cacheApi: true, serviceWorkerApi: true, controlled: true },
}));
vi.mock('@/engine/build', async (importOriginal) => ({
  ...(await importOriginal<typeof BuildModule>()),
  detectThreadEnvironment: () => device.env,
}));
vi.mock('./fullEngineDownload', async (importOriginal) => ({
  ...(await importOriginal<typeof DownloadModule>()),
  detectDownloadPlatform: () => device.platform,
}));

const files = vi.hoisted(() => ({
  stored: false,
  report: (_received: number, _total: number): void => undefined,
  finish: (): void => undefined,
}));
const engine = vi.hoisted(() => ({
  isBuildDownloaded: vi.fn(() => Promise.resolve(files.stored)),
  removeFullEngine: vi.fn(() => Promise.resolve(true)),
  fetchBuild: vi.fn(
    (_build: string, onProgress: (r: number, t: number) => void, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        files.report = onProgress;
        files.finish = () => {
          files.stored = true;
          resolve();
        };
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
  ),
}));
vi.mock('@/engine/fullEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof FullEngineModule>()),
  ...engine,
}));

import { EngineFullSetting } from './EngineFullSetting';
import { stopEngineDownload } from './fullEngineDownload';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
/** Past the progress throttle (200 ms). */
const later = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 220));
  });
const status = () => screen.getByTestId('engine-full-status');
const toggle = () => screen.getByRole('switch', { name: 'Full engine (99 MB download)' });

describe('EngineFullSetting', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    useToasts.setState({ toasts: [] });
    device.env = { isolated: true, sharedMemory: true, cores: 8, mobile: false };
    device.platform = { cacheApi: true, serviceWorkerApi: true, controlled: true };
    files.stored = false;
    engine.fetchBuild.mockClear();
    engine.removeFullEngine.mockClear();
  });
  afterEach(async () => {
    stopEngineDownload();
    await flush();
  });

  it('is off by default, with the lite engine running', () => {
    render(<EngineFullSetting />);
    expect(toggle()).not.toBeChecked();
    expect(status()).toHaveTextContent(
      /^Off — the lite engine runs, with Stockfish's small network\. Switching this on downloads the large one once \(99 MB\)/,
    );
    expect(screen.queryByTestId('engine-full-download')).not.toBeInTheDocument();
  });

  it('downloads the threaded full engine when switched on, showing progress', async () => {
    render(<EngineFullSetting />);
    fireEvent.click(toggle());
    await flush();
    expect(useSettings.getState().engineFull).toBe(true);
    expect(engine.fetchBuild).toHaveBeenCalledTimes(1);
    expect(engine.fetchBuild.mock.calls[0]?.[0]).toBe('full-multi');

    await later();
    act(() => files.report(50_000_000, 99_065_439));
    const bar = screen.getByRole('progressbar', { name: 'Full engine download' });
    expect(bar).toHaveAttribute('aria-valuetext', '50 of 99 MB');
    expect(status()).toHaveTextContent(
      'Downloading the full engine: 50 of 99 MB. The lite engine runs until it is done.',
    );
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    await act(async () => {
      files.finish();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    await flush();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(status()).toHaveTextContent(
      'Downloaded — every page that starts the engine from now on uses it.',
    );
    expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/The full engine is downloaded/);
  });

  it('can be stopped, and started again from its button', async () => {
    render(<EngineFullSetting />);
    fireEvent.click(toggle());
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(useToasts.getState().toasts).toEqual([]);
    expect(status()).toHaveTextContent('Not downloaded yet — the lite engine runs until it is.');
    // Still switched on: the lite engine stands in until the download is done.
    expect(useSettings.getState().engineFull).toBe(true);
    fireEvent.click(screen.getByTestId('engine-full-download'));
    await flush();
    expect(engine.fetchBuild).toHaveBeenCalledTimes(2);
  });

  it('deletes the download when switched off', async () => {
    files.stored = true;
    useSettings.getState().update({ engineFull: true });
    render(<EngineFullSetting />);
    await flush();
    expect(status()).toHaveTextContent(/^Downloaded/);
    fireEvent.click(toggle());
    await flush();
    expect(useSettings.getState().engineFull).toBe(false);
    expect(engine.removeFullEngine).toHaveBeenCalledWith();
    expect(useToasts.getState().toasts.at(-1)?.message).toBe(
      'The full engine was removed from this device (99 MB freed): every page that starts the engine from now on uses the lite one.',
    );
    expect(engine.fetchBuild).not.toHaveBeenCalled();
  });

  it('fetches the one-thread build where threads cannot run', async () => {
    useSettings.getState().update({ engineThreads: false });
    device.env = { ...device.env, isolated: false };
    render(<EngineFullSetting />);
    fireEvent.click(toggle());
    await flush();
    expect(engine.fetchBuild.mock.calls[0]?.[0]).toBe('full-single');
  });

  it('explains when it cannot download yet, or at all', async () => {
    useSettings.getState().update({ engineFull: true });

    // Threads on, page not isolated yet: wait for the reload rather than fetch the wrong build.
    device.env = { ...device.env, isolated: false };
    const first = render(<EngineFullSetting />);
    await flush();
    expect(status()).toHaveTextContent(/^Reload the app first/);
    first.unmount();

    device.platform = { ...device.platform, controlled: false };
    const second = render(<EngineFullSetting />);
    await flush();
    expect(status()).toHaveTextContent(/^Available once the app is ready to work offline/);
    second.unmount();

    device.platform = { cacheApi: false, serviceWorkerApi: true, controlled: true };
    render(<EngineFullSetting />);
    await flush();
    expect(status()).toHaveTextContent(/cannot keep files offline/);
    expect(screen.queryByTestId('engine-full-download')).not.toBeInTheDocument();
    expect(engine.fetchBuild).not.toHaveBeenCalled();
  });

  it('warns that a phone may not have the memory for it', async () => {
    files.stored = true;
    device.env = { ...device.env, mobile: true };
    useSettings.getState().update({ engineFull: true });
    render(<EngineFullSetting />);
    await flush();
    expect(status()).toHaveTextContent(/On a phone it may not have the memory to start/);
  });
});

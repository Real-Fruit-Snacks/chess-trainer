import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILLER_PREFIX, PROBE_KEY } from '@/features/lab/labKeys';
import backupV7 from '@/store/fixtures/backup-v7.json';

// jsdom has no modal dialogs.
vi.hoisted(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const clearLabStorage = vi.hoisted(() => vi.fn(() => 1));
vi.mock('@/features/lab/storageTest', () => ({ clearLabStorage }));
const stopSync = vi.hoisted(() => vi.fn());
const startLichessSync = vi.hoisted(() => vi.fn(() => stopSync));
const recheckSignIn = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/lib/lichess/sync', () => ({ startLichessSync, recheckSignIn }));
const stopDeviceSync = vi.hoisted(() => vi.fn());
const startDeviceSync = vi.hoisted(() => vi.fn(() => stopDeviceSync));
vi.mock('@/lib/sync/deviceSync', () => ({ startDeviceSync }));

import { deviceSyncStorageKey } from '@/lib/sync/enabled';
import { useLichess } from '@/store/lichess';
import { PlatformHooks } from './PlatformHooks';

/** Device sync as stored with it on (what `deviceSyncOn` reads). */
const SYNC_ON = JSON.stringify({ state: { secret: 'AAAAAAAAAAAAAAAAAAAAAA' }, version: 1 });

type Consumer = (params: { files: { getFile: () => Promise<File> }[] }) => void;

describe('PlatformHooks', () => {
  let consumer: Consumer | null = null;

  beforeEach(() => {
    clearLabStorage.mockClear();
    localStorage.clear();
    consumer = null;
    (window as unknown as { launchQueue?: unknown }).launchQueue = {
      setConsumer: (fn: Consumer) => {
        consumer = fn;
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { launchQueue?: unknown }).launchQueue;
  });

  it('loads the lab code only when the lab left something behind', async () => {
    render(<PlatformHooks />);
    await act(() => new Promise<void>((r) => setTimeout(r, 0)));
    expect(clearLabStorage).not.toHaveBeenCalled();
  });

  it('removes a storage filler left by the lab at start-up', async () => {
    localStorage.setItem(`${FILLER_PREFIX}0`, 'x');
    render(<PlatformHooks />);
    await waitFor(() => expect(clearLabStorage).toHaveBeenCalledTimes(1));
  });

  it('removes a leftover probe too', async () => {
    localStorage.setItem(PROBE_KEY, 'p');
    render(<PlatformHooks />);
    await waitFor(() => expect(clearLabStorage).toHaveBeenCalledTimes(1));
  });

  it('offers a backup the app was opened with for confirmation, never importing it on its own', async () => {
    render(<PlatformHooks />);
    expect(consumer).not.toBeNull();
    const file = new File([JSON.stringify(backupV7)], 'backup.json', { type: 'application/json' });
    act(() => consumer?.({ files: [{ getFile: () => Promise.resolve(file) }] }));
    // The confirmation appears (lazily loaded); nothing was applied yet.
    expect(await screen.findByTestId('import-summary')).toBeInTheDocument();
    expect(screen.getByTestId('import-confirm')).toBeInTheDocument();
    expect(localStorage.getItem('chess-trainer:pre-import-backup')).toBeNull();
  });

  it('runs the Lichess sync while an account is connected, and stops it after', async () => {
    useLichess.getState().forget();
    startLichessSync.mockClear();
    stopSync.mockClear();
    render(<PlatformHooks />);
    await act(() => new Promise<void>((r) => setTimeout(r, 0)));
    expect(startLichessSync).not.toHaveBeenCalled();
    act(() => {
      useLichess
        .getState()
        .connect(
          { id: 'learner', username: 'Learner', token: 'lip_x', expiresAt: null },
          { puzzle: null, bullet: null, blitz: null, rapid: null, classical: null, at: 0 },
        );
    });
    await waitFor(() => expect(startLichessSync).toHaveBeenCalledTimes(1));
    act(() => useLichess.getState().setNeedsReconnect(true));
    expect(stopSync).toHaveBeenCalledTimes(1);
    // A refusal during the session is not looked at again until the app opens next time.
    await act(() => new Promise<void>((r) => setTimeout(r, 0)));
    expect(recheckSignIn).not.toHaveBeenCalled();
    act(() => useLichess.getState().forget());
  });

  it('runs device sync from the start while it is on, and stops it after', async () => {
    startDeviceSync.mockClear();
    stopDeviceSync.mockClear();
    localStorage.setItem(deviceSyncStorageKey(), SYNC_ON);
    const view = render(<PlatformHooks />);
    await waitFor(() => expect(startDeviceSync).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(stopDeviceSync).toHaveBeenCalledTimes(1);
  });

  it('starts device sync once another tab turns it on, and not before', async () => {
    startDeviceSync.mockClear();
    render(<PlatformHooks />);
    await act(() => new Promise<void>((r) => setTimeout(r, 0)));
    expect(startDeviceSync).not.toHaveBeenCalled();
    localStorage.setItem(deviceSyncStorageKey(), SYNC_ON);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: deviceSyncStorageKey() }));
    });
    await waitFor(() => expect(startDeviceSync).toHaveBeenCalledTimes(1));
  });

  it('looks again at a sign-in marked as refused as the app opens', async () => {
    useLichess
      .getState()
      .connect(
        { id: 'learner', username: 'Learner', token: 'lip_x', expiresAt: null },
        { puzzle: null, bullet: null, blitz: null, rapid: null, classical: null, at: 0 },
      );
    useLichess.getState().setNeedsReconnect(true);
    startLichessSync.mockClear();
    recheckSignIn.mockClear();
    render(<PlatformHooks />);
    await waitFor(() => expect(recheckSignIn).toHaveBeenCalledTimes(1));
    expect(startLichessSync).not.toHaveBeenCalled();
    // Still good after all: the mark goes, and the sync starts.
    act(() => useLichess.getState().setNeedsReconnect(false));
    await waitFor(() => expect(startLichessSync).toHaveBeenCalledTimes(1));
    act(() => useLichess.getState().forget());
  });
});

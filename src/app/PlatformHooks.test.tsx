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

import { PlatformHooks } from './PlatformHooks';

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
});

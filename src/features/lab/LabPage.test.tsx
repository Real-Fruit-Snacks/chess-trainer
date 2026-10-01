import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ICON_NAMES } from '@/components/ui';
import { useToasts } from '@/components/ui/toastStore';
import { useStorageHealth } from '@/lib/persistStorage';
import { SOUND_NAMES } from '@/lib/sound';
import type * as SoundModule from '@/lib/sound';
import { useSettings } from '@/store/settings';

vi.hoisted(() => {
  window.matchMedia = () =>
    ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList;
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const played = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: played };
});

// The board is a chessground instance; a stub keeps the test about the lab itself.
vi.mock('@/components/board/Board', () => ({
  Board: ({ ariaLabel }: { ariaLabel?: string }) => <div role="img" aria-label={ariaLabel} />,
}));
vi.mock('@/features/settings/EngineDiagnostics', () => ({
  EngineDiagnostics: () => <div data-testid="engine-diagnostics" />,
}));

import { ErrorBoundary } from '@/app/ErrorBoundary';
import LabPage from './LabPage';

function renderLab() {
  return render(
    <MemoryRouter initialEntries={['/settings/lab']}>
      <ErrorBoundary>
        <LabPage />
      </ErrorBoundary>
    </MemoryRouter>,
  );
}

describe('LabPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.getState().reset();
    useStorageHealth.getState().markOk();
    useToasts.setState({ toasts: [] });
    played.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows every icon, every sound and every haptic cue', () => {
    renderLab();
    for (const name of ICON_NAMES) {
      expect(screen.getByTestId(`icon-${name}`)).toHaveTextContent(name);
    }
    for (const name of SOUND_NAMES) {
      expect(screen.getByTestId(`sound-${name}`)).toBeInTheDocument();
      expect(screen.getByTestId(`haptic-${name}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('lab-platform')).toHaveTextContent('WebAssembly');
    expect(screen.getByText(`${ICON_NAMES.length} icons`, { exact: false })).toBeInTheDocument();
  });

  it('plays a sound and raises a toast from their buttons', () => {
    renderLab();
    fireEvent.click(screen.getByTestId('sound-capture'));
    expect(played).toHaveBeenCalledWith('capture');
    fireEvent.click(screen.getByTestId('toast-success'));
    expect(useToasts.getState().toasts.at(-1)?.message).toBe('A success toast.');
  });

  it('switches the sound theme, previews it, and shows that theme’s haptic patterns', () => {
    renderLab();
    const sounds = screen.getByTestId('lab-sounds');
    const themes = within(sounds).getByRole('group', { name: 'Sound theme' });
    expect(
      within(themes)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Standard', 'Soft', 'Retro']);
    expect(screen.getByTestId('haptic-capture')).toHaveTextContent('10·20·45ms');
    fireEvent.click(within(themes).getByRole('button', { name: 'Retro' }));
    expect(useSettings.getState().soundTheme).toBe('retro');
    expect(played).toHaveBeenCalledWith('move');
    expect(screen.getByTestId('haptic-capture')).toHaveTextContent('8·12·8·12·8·12·30ms');
    expect(screen.getByTestId('sound-gameLost')).toHaveTextContent('Game lost');
  });

  it('has the volume slider, which previews a move once the drag settles', () => {
    vi.useFakeTimers();
    try {
      renderLab();
      const slider = screen.getByTestId('volume-slider');
      expect(slider).toHaveValue('100');
      fireEvent.change(slider, { target: { value: '60' } });
      fireEvent.change(slider, { target: { value: '40' } });
      expect(useSettings.getState().soundVolume).toBeCloseTo(0.4, 5);
      expect(played).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(played).toHaveBeenCalledTimes(1);
      expect(played).toHaveBeenCalledWith('move');
      expect(screen.getByTestId('lab-sounds')).toHaveTextContent('40%');
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens and closes the sample dialog', () => {
    renderLab();
    fireEvent.click(screen.getByTestId('open-dialog'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('open');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(dialog).not.toHaveAttribute('open');
  });

  it('fills the storage to show the warning, then removes the filler', () => {
    const original = Storage.prototype.setItem;
    let fillerWrites = 0;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key.startsWith('chess-trainer:lab-filler-')) {
        fillerWrites += 1;
        if (fillerWrites > 2) throw new DOMException('full', 'QuotaExceededError');
        original.call(this, key, value);
        return;
      }
      // Once the filler is in place, the app's own writes no longer fit.
      if (fillerWrites > 2) throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    });
    renderLab();
    expect(screen.getByTestId('storage-ok')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('storage-fill'));
    expect(useStorageHealth.getState().full).toBe(true);
    expect(screen.getByText(/Storage is full/)).toBeInTheDocument();
    expect(screen.getByTestId('storage-fill')).toBeDisabled();
    expect(useToasts.getState().toasts.some((t) => t.message.includes('Storage is full'))).toBe(
      true,
    );

    spy.mockRestore();
    fireEvent.click(screen.getByTestId('storage-clear'));
    expect(useStorageHealth.getState().full).toBe(false);
    expect(screen.getByTestId('storage-ok')).toBeInTheDocument();
    expect(localStorage.getItem('chess-trainer:lab-filler-0')).toBeNull();
  });

  it('can crash the page on purpose to show the error screen', () => {
    renderLab();
    fireEvent.click(screen.getByTestId('crash'));
    expect(screen.getByTestId('crash-page')).toHaveTextContent('Test lab: deliberate crash');
  });
});

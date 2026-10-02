import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';

// jsdom has neither matchMedia (read when the install store is created) nor
// the dialog and scrolling APIs the page uses.
vi.hoisted(() => {
  window.matchMedia = () =>
    ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList;
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  Element.prototype.scrollIntoView = vi.fn();
});

const played = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: played };
});

import SettingsPage from './SettingsPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    useProgress.getState().resetAll();
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
  });

  it('groups every setting into its own card', () => {
    renderAt('/settings');
    for (const heading of [
      'Appearance',
      'Board',
      'Play',
      'Profiles',
      'Puzzle rating',
      'Engine & analysis',
      'App',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings');
    expect(document.title).toMatch(/^Settings · /);
  });

  it('changes a setting from its switch', () => {
    renderAt('/settings');
    const dots = screen.getByRole('switch', { name: 'Show legal move dots' });
    expect(dots).toBeChecked();
    fireEvent.click(dots);
    expect(useSettings.getState().showLegalMoves).toBe(false);
    expect(dots).not.toBeChecked();
  });

  it('offers three sound themes and a volume slider, each previewed with a move', () => {
    vi.useFakeTimers();
    try {
      renderAt('/settings');
      const themes = screen.getByRole('group', { name: 'Sound theme' });
      expect(
        within(themes)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Standard', 'Soft', 'Retro']);
      fireEvent.click(within(themes).getByRole('button', { name: 'Retro' }));
      expect(useSettings.getState().soundTheme).toBe('retro');
      expect(within(themes).getByRole('button', { name: 'Retro' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(played).toHaveBeenCalledTimes(1);

      const slider = screen.getByRole('slider', { name: 'Volume' });
      expect(slider).toHaveValue('100');
      fireEvent.change(slider, { target: { value: '25' } });
      expect(useSettings.getState().soundVolume).toBeCloseTo(0.25, 5);
      expect(slider).toHaveAttribute('aria-valuetext', '25%');
      vi.advanceTimersByTime(200);
      expect(played).toHaveBeenCalledTimes(2);
      expect(played).toHaveBeenLastCalledWith('move');

      // Both controls belong to the sounds switch.
      fireEvent.click(screen.getByRole('switch', { name: /^Sound effects/ }));
      expect(screen.queryByRole('slider', { name: 'Volume' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Sound theme' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers the board and display preferences and keeps them', () => {
    renderAt('/settings');
    // Colour scheme has a black option; notation shows a sample in the chosen style.
    const schemes = screen.getByRole('group', { name: 'Colour scheme' });
    expect(
      within(schemes)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['System', 'Light', 'Dark', 'Black']);
    fireEvent.click(within(schemes).getByRole('button', { name: 'Black' }));
    expect(useSettings.getState().colorScheme).toBe('black');
    expect(screen.getByText(/pure black background/)).toBeInTheDocument();

    const sample = screen.getByTestId('notation-sample');
    expect(sample.querySelectorAll('piece')).toHaveLength(4);
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Move notation' })).getByRole('button', {
        name: 'Letters',
      }),
    );
    expect(useSettings.getState().notation).toBe('letters');
    expect(sample.querySelectorAll('piece')).toHaveLength(0);
    expect(sample).toHaveTextContent('2. Nf3 Nc6 3. Bb5');

    // The piece-set picker shows every set and selects one.
    const pieces = screen.getByRole('group', { name: 'Piece set' });
    expect(within(pieces).getAllByRole('button')).toHaveLength(4);
    expect(within(pieces).getByRole('button', { name: 'Classic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(pieces).getByRole('button', { name: 'Pixel' }));
    expect(useSettings.getState().pieceSet).toBe('pixel');
    expect(screen.getByText(/8-bit set/)).toBeInTheDocument();

    // Nine board palettes.
    expect(
      within(screen.getByRole('group', { name: 'Board colours' })).getAllByRole('button'),
    ).toHaveLength(9);

    // The board switches and segmented controls.
    fireEvent.click(screen.getByRole('switch', { name: 'Highlight the last move and check' }));
    expect(useSettings.getState().boardHighlights).toBe(false);
    fireEvent.click(screen.getByRole('switch', { name: /^Magnify the dragged piece/ }));
    expect(useSettings.getState().magnifyDrag).toBe(false);
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Drag target' })).getByRole('button', {
        name: 'None',
      }),
    );
    expect(useSettings.getState().dragTarget).toBe('none');
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Move pieces by' })).getByRole('button', {
        name: 'Tap',
      }),
    );
    expect(useSettings.getState().moveMethod).toBe('tap');
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Captured material' })).getByRole('button', {
        name: 'Off',
      }),
    );
    expect(useSettings.getState().materialDisplay).toBe('off');
    expect(screen.getByText('Nothing beside the player bars.')).toBeInTheDocument();

    // Focus mode lives with the other play settings.
    fireEvent.click(screen.getByRole('switch', { name: /^Focus mode/ }));
    expect(useSettings.getState().playFocus).toBe(true);
  });

  it('scrolls to the card a hash link points at', () => {
    renderAt('/settings#profiles');
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.instances[0]).toBe(screen.getByTestId('profiles'));
  });

  it('asks before resetting and then clears progress and settings', () => {
    useProgress.getState().completeOnboarding(1800);
    useSettings.getState().update({ showCoordinates: false });
    renderAt('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));
    expect(screen.getByRole('heading', { name: 'Reset everything?' })).toBeInTheDocument();
    expect(useProgress.getState().puzzleRating).toBe(1800);

    fireEvent.click(screen.getByRole('button', { name: 'Yes, reset' }));
    expect(useProgress.getState().onboarded).toBe(false);
    expect(useSettings.getState().showCoordinates).toBe(true);
  });
});

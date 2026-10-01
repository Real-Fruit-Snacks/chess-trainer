import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

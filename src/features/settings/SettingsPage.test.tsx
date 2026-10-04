import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';
import type { ImportedGame } from '@/lib/gameImport';
import type * as SoundModule from '@/lib/sound';
import type * as IsolationModule from '@/sw/isolation';
import backupV6 from '@/store/fixtures/backup-v6.json';
import { useGames } from '@/store/games';
import { PRE_IMPORT_BACKUP_KEY, useProgress } from '@/store/progress';
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
const writeFlag = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock('@/sw/isolation', async (importOriginal) => {
  const actual = await importOriginal<typeof IsolationModule>();
  return { ...actual, writeIsolationFlag: writeFlag };
});

const importedGame = (n: string): ImportedGame => ({
  id: n,
  pgn: `1. e4 e5 ${n}`,
  white: 'a',
  black: 'b',
  result: '*',
  date: '',
  event: '',
  url: null,
  plies: 2,
  speed: null,
  rated: null,
  timestamp: 1,
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
    localStorage.clear();
    useSettings.getState().reset();
    useProgress.getState().resetAll();
    useToasts.setState({ toasts: [] });
    writeFlag.mockClear();
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
      const themes = screen.getByRole('radiogroup', { name: 'Sound theme' });
      expect(
        within(themes)
          .getAllByRole('radio')
          .map((b) => b.textContent),
      ).toEqual(['Standard', 'Soft', 'Retro']);
      fireEvent.click(within(themes).getByRole('radio', { name: 'Retro' }));
      expect(useSettings.getState().soundTheme).toBe('retro');
      expect(within(themes).getByRole('radio', { name: 'Retro' })).toHaveAttribute(
        'aria-checked',
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

      // The slider belongs to the sounds switch; the theme picker stays while
      // vibration is on, because it also picks the vibration patterns.
      Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
      fireEvent.click(screen.getByRole('switch', { name: /^Sound effects/ }));
      expect(screen.queryByRole('slider', { name: 'Volume' })).not.toBeInTheDocument();
      expect(screen.getByRole('radiogroup', { name: 'Sound theme' })).toBeInTheDocument();
      expect(screen.getByText(/Also picks the vibration patterns/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('switch', { name: /^Vibration/ }));
      expect(screen.queryByRole('radiogroup', { name: 'Sound theme' })).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, 'vibrate');
      useSettings.getState().update({ sounds: true, haptics: true });
      vi.useRealTimers();
    }
  });

  it('drops the sound theme with the sounds where the browser cannot vibrate', () => {
    expect('vibrate' in navigator).toBe(false);
    renderAt('/settings');
    expect(screen.getByRole('radiogroup', { name: 'Sound theme' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /^Sound effects/ }));
    expect(useSettings.getState().haptics).toBe(true);
    expect(screen.queryByRole('radiogroup', { name: 'Sound theme' })).not.toBeInTheDocument();
    useSettings.getState().update({ sounds: true });
  });

  it('offers the board and display preferences and keeps them', () => {
    renderAt('/settings');
    // Colour scheme has a black option; notation shows a sample in the chosen style.
    const schemes = screen.getByRole('radiogroup', { name: 'Colour scheme' });
    expect(
      within(schemes)
        .getAllByRole('radio')
        .map((b) => b.textContent),
    ).toEqual(['System', 'Light', 'Dark', 'Black']);
    fireEvent.click(within(schemes).getByRole('radio', { name: 'Black' }));
    expect(useSettings.getState().colorScheme).toBe('black');
    expect(screen.getByText(/pure black background/)).toBeInTheDocument();

    const sample = screen.getByTestId('notation-sample');
    expect(sample.querySelectorAll('piece')).toHaveLength(4);
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Move notation' })).getByRole('radio', {
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
      within(screen.getByRole('radiogroup', { name: 'Drag target' })).getByRole('radio', {
        name: 'None',
      }),
    );
    expect(useSettings.getState().dragTarget).toBe('none');
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Move pieces by' })).getByRole('radio', {
        name: 'Tap',
      }),
    );
    expect(useSettings.getState().moveMethod).toBe('tap');
    // In Tap mode the two drag-only controls are inert, with a hint saying why.
    expect(screen.getByTestId('drag-settings')).toBeDisabled();
    expect(screen.getByRole('switch', { name: /^Magnify the dragged piece/ })).toBeDisabled();
    expect(screen.getByText(/apply to dragging only/)).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Captured material' })).getByRole('radio', {
        name: 'Off',
      }),
    );
    expect(useSettings.getState().materialDisplay).toBe('off');
    expect(screen.getByText('Nothing beside the player bars.')).toBeInTheDocument();

    // Focus mode lives with the other play settings.
    fireEvent.click(screen.getByRole('switch', { name: /^Focus mode/ }));
    expect(useSettings.getState().playFocus).toBe(true);

    // Single-key shortcuts can be turned off (speech input, switch devices).
    const shortcuts = screen.getByRole('switch', { name: /^Single-key shortcuts/ });
    expect(shortcuts).toBeChecked();
    fireEvent.click(shortcuts);
    expect(useSettings.getState().keyboardShortcuts).toBe(false);
  });

  it('scrolls to the card a hash link points at', () => {
    renderAt('/settings#profiles');
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.instances[0]).toBe(screen.getByTestId('profiles'));
  });

  it('asks before resetting, says what is kept, then clears progress, games, settings and the flag', () => {
    useProgress.getState().completeOnboarding(1800);
    useSettings.getState().update({ showCoordinates: false, engineThreads: true });
    useGames.getState().setPlayer('me');
    useGames.getState().addGames([importedGame('a')], 'pgn');
    localStorage.setItem(PRE_IMPORT_BACKUP_KEY, '{}');
    renderAt('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));
    expect(screen.getByRole('heading', { name: 'Reset everything?' })).toBeInTheDocument();
    expect(screen.getByText(/imported games of this profile/)).toBeInTheDocument();
    expect(screen.getByText(/Kept:/)).toHaveTextContent('the profile list');
    expect(useProgress.getState().puzzleRating).toBe(1800);

    fireEvent.click(screen.getByRole('button', { name: 'Yes, reset' }));
    expect(useProgress.getState().onboarded).toBe(false);
    expect(useSettings.getState().showCoordinates).toBe(true);
    expect(useSettings.getState().engineThreads).toBe(false);
    expect(useGames.getState().games).toEqual({});
    expect(useGames.getState().player).toBe('');
    expect(writeFlag).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toBeNull();
  });

  it('resets the puzzle rating from a button with a confirmation, keeping the history', () => {
    useProgress.getState().completeOnboarding(1800);
    renderAt('/settings');
    const choice = screen.getByLabelText('Start again from');
    fireEvent.change(choice, { target: { value: 'casual' } });
    // Changing the choice alone changes nothing.
    expect(useProgress.getState().puzzleRating).toBe(1800);
    fireEvent.click(screen.getByTestId('rating-reset'));
    expect(screen.getByRole('heading', { name: 'Reset your puzzle rating?' })).toBeInTheDocument();
    expect(screen.getByText(/set to about 1200/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    expect(useProgress.getState().puzzleRating).toBe(1800);
    fireEvent.click(screen.getByTestId('rating-reset'));
    fireEvent.click(screen.getByTestId('confirm-accept'));
    expect(useProgress.getState().puzzleRating).toBe(1200);
    expect(useProgress.getState().ratingHistory.map((p) => p.rating)).toEqual([1800, 1200]);
  });

  it('imports a backup only after a confirmation that shows what it holds, with undo', async () => {
    useProgress.getState().completeOnboarding(1800);
    useProgress.getState().recordDrill('lab-drill', 7);
    renderAt('/settings');
    const input = screen.getByTestId<HTMLInputElement>('import-file');
    expect(input).toHaveAttribute('accept', '.json,application/json');

    const pick = async (content: string, name = 'backup.json') => {
      const file = new File([content], name, { type: 'application/json' });
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
        // file.text() resolves on a later tick.
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    };

    // A PGN is told apart from a backup; nothing opens.
    await pick('[Event "x"]\n\n1. e4 e5 *', 'game.pgn');
    expect(screen.queryByRole('heading', { name: /Replace your data/ })).not.toBeInTheDocument();
    expect(useToasts.getState().toasts.some((t) => t.message.includes('looks like a PGN'))).toBe(
      true,
    );

    // A damaged backup is refused by name of the field.
    await pick(JSON.stringify({ progress: { onboarded: true, attempts: {} } }));
    expect(screen.queryByRole('heading', { name: /Replace your data/ })).not.toBeInTheDocument();
    expect(useToasts.getState().toasts.some((t) => t.message.includes('progress.attempts'))).toBe(
      true,
    );
    expect(useProgress.getState().puzzleRating).toBe(1800);

    // A good one opens the confirmation with the summary; Cancel keeps everything.
    await pick(JSON.stringify(backupV6));
    expect(screen.getByRole('heading', { name: /Replace your data/ })).toBeInTheDocument();
    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 saved analysis');
    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 custom repertoire');
    expect(screen.getByTestId('import-export-first')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('import-cancel'));
    expect(useProgress.getState().puzzleRating).toBe(1800);
    expect(useProgress.getState().drills['lab-drill']?.best).toBe(7);

    // Confirm replaces, and the toast offers to undo.
    await pick(JSON.stringify(backupV6));
    fireEvent.click(screen.getByTestId('import-confirm'));
    expect(useProgress.getState().puzzleRating).toBe(1212);
    expect(useProgress.getState().drills['lab-drill']).toBeUndefined();
    const undo = useToasts.getState().toasts.find((t) => t.actionLabel === 'Undo import');
    expect(undo).toBeDefined();
    undo?.onAction?.();
    expect(useProgress.getState().puzzleRating).toBe(1800);
    expect(useProgress.getState().drills['lab-drill']?.best).toBe(7);
  });
});

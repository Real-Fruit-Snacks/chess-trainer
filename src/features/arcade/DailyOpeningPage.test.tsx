import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, localDateKey } from '@/lib/dates';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { dayToDate } from './dailyOpening';
import type { OpeningLine } from './openingLines';

// One possible answer (the only line of six to fourteen moves), and two guesses.
const BOOK: OpeningLine[] = [
  { eco: 'C70', name: 'Ruy Lopez: Morphy Defense', moves: 'e4 e5 Nf3 Nc6 Bb5 a6'.split(' ') },
  { eco: 'C50', name: 'Italian Game', moves: 'e4 e5 Nf3 Nc6 Bc4'.split(' ') },
  { eco: 'C45', name: 'Scotch Game', moves: 'e4 e5 Nf3 Nc6 d4'.split(' ') },
];

vi.mock('./openingLines', () => ({ loadOpeningLines: () => Promise.resolve(BOOK) }));

import DailyOpeningPage from './DailyOpeningPage';

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

async function renderPage() {
  render(
    <MemoryRouter>
      <DailyOpeningPage />
    </MemoryRouter>,
  );
  await screen.findByTestId('daily-opening-input');
}

function guess(name: string) {
  fireEvent.change(screen.getByTestId('daily-opening-input'), { target: { value: name } });
  fireEvent.click(within(screen.getByTestId('daily-opening-matches')).getAllByRole('button')[0]!);
}

const label = (key: string) => formatDate(dayToDate(key).getTime(), siteConfig.locale);

describe('DailyOpeningPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'share');
  });

  it('dates the opening and marks every move by text and glyph, not colour alone', async () => {
    await renderPage();
    expect(screen.getByTestId('daily-heading')).toHaveTextContent(
      `Opening of ${label(localDateKey())}`,
    );
    guess('italian');
    const row = screen.getByTestId('daily-opening-guesses').querySelector('.arcade__guess');
    const tiles = Array.from(row?.querySelectorAll('li.arcade__tile') ?? []);
    expect(tiles.map((t) => t.textContent)).toEqual([
      'e4: in the right place',
      'e5: in the right place',
      'Nf3: in the right place',
      'Nc6: in the right place',
      'Bc4: not in the line',
    ]);
    // A glyph in every tile: a check for a hit, a cross for a miss.
    expect(tiles[0]?.querySelector('svg.icon--check')).not.toBeNull();
    expect(tiles[4]?.querySelector('svg.icon--close')).not.toBeNull();
    // The legend says what the marks mean.
    expect(screen.getByRole('list', { name: 'What the marks mean' })).toHaveTextContent(
      /In the right place.*In the line, but elsewhere.*Not in the line.*Past the end of the line/,
    );
    // The moves the board knows, in the notation setting (figurines keep the letter for readers).
    expect(screen.getByTestId('daily-known')).toHaveTextContent(
      'Known so far: 1. e4 e5 2. Nf3 Nc6',
    );
  });

  it('asks before giving up, which ends the day as a miss', async () => {
    await renderPage();
    guess('scotch');
    fireEvent.click(screen.getByTestId('daily-give-up'));
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAccessibleName('Give up the Daily Opening?');
    expect(dialog).toHaveTextContent(`It counts as a miss for ${label(localDateKey())}`);
    fireEvent.click(within(dialog).getByTestId('confirm-cancel'));
    expect(useProgress.getState().dailyOpening?.result).toBeNull();
    fireEvent.click(screen.getByTestId('daily-give-up'));
    fireEvent.click(screen.getByTestId('confirm-accept'));
    expect(screen.getByTestId('daily-opening-result')).toHaveTextContent('Not this time');
    expect(useProgress.getState().dailyOpening?.result).toBe('failed');
  });

  it('shares the result with the device’s share sheet where there is one', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await renderPage();
    guess('ruy');
    const button = screen.getByTestId('daily-share');
    expect(button).toHaveTextContent('Share result');
    fireEvent.click(button);
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]).toEqual([{ text: `Daily Opening ${localDateKey()} 1/6\nGGGGGG` }]);
  });

  it('copies the result where it cannot share', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderPage();
    guess('ruy');
    const button = screen.getByTestId('daily-share');
    expect(button).toHaveTextContent('Copy result');
    fireEvent.click(button);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });

  it('keeps the day a game started on past midnight, and moves on once it is done', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 2, 23, 59, 0));
    await renderPage();
    guess('italian');
    expect(screen.getByTestId('daily-heading')).toHaveTextContent(label('2026-10-02'));
    // Midnight passes mid-game: same day, same answer, same guesses.
    act(() => {
      vi.setSystemTime(new Date(2026, 9, 3, 0, 2, 0));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('daily-heading')).toHaveTextContent(label('2026-10-02'));
    expect(
      screen.getByTestId('daily-opening-guesses').querySelectorAll('.arcade__guess'),
    ).toHaveLength(1);
    // The guess is still the 2 October game's.
    guess('scotch');
    expect(useProgress.getState().dailyOpening?.date).toBe('2026-10-02');
    expect(useProgress.getState().dailyOpening?.guesses).toHaveLength(2);
    // Finished: the result stays while the page is on screen …
    fireEvent.click(screen.getByTestId('daily-give-up'));
    fireEvent.click(screen.getByTestId('confirm-accept'));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('daily-opening-result')).toBeInTheDocument();
    // … and the next visit brings the new day's opening.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByTestId('daily-heading')).toHaveTextContent(label('2026-10-03'));
    expect(screen.queryByTestId('daily-opening-result')).toBeNull();
  });
});

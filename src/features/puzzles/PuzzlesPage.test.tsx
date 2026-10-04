import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import type * as PuzzleServiceModule from './puzzleService';
import { findPuzzleById, type Puzzle, PuzzleLoadError, selectPuzzle } from './puzzleService';
import PuzzlesPage from './PuzzlesPage';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));
vi.mock('@/engine/useEngine', () => ({
  useEngine: () => ({ engine: vi.fn(), status: 'idle', error: null, start: vi.fn() }),
}));

// Black plays ...Kh8 (setup); White mates with Rd8#.
const MATE: Puzzle = {
  id: 'm1',
  fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1',
  moves: 'g8h8 d1d8',
  rating: 1200,
  rd: 80,
  popularity: 100,
  plays: 1000,
  themes: 'backRankMate mate mateIn1 oneMove',
  url: 'https://lichess.org/x',
};

vi.mock('./puzzleService', async (importOriginal) => {
  const actual = await importOriginal<typeof PuzzleServiceModule>();
  return {
    ...actual,
    selectPuzzle: vi.fn(() => Promise.resolve(MATE)),
    dailyPuzzle: vi.fn(() => Promise.resolve(MATE)),
    findPuzzleById: vi.fn(() => Promise.resolve(MATE)),
    loadPuzzleIndex: vi.fn(() => Promise.resolve({ buckets: [], themes: {}, total: 0 })),
  };
});

function Location() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

/** What the app shell does after every navigation: focus moves to the page. */
function FocusMain() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.querySelector<HTMLElement>('main')?.focus();
  }, [pathname]);
  return null;
}

/** Plays a move on the focused board through its keyboard interface. */
function keyboardMove(board: HTMLElement, from: string, to: string) {
  for (const key of [from[0], from[1], 'Enter', to[0], to[1], 'Enter']) {
    fireEvent.keyDown(board, { key });
  }
}

/** The trainer's status line (the board overlay has a spinner with its own status role). */
function status(): HTMLElement {
  const line = document.querySelector<HTMLElement>('.puzzle-status');
  if (!line) throw new Error('The puzzle status line is not on screen');
  return line;
}

/**
 * Waits until the trainer asks for a move, then lets React run the effects of that
 * render (the page's key listener, the board's movable state) before the test acts.
 */
async function yourMove() {
  await vi.waitFor(() => expect(status()).toHaveTextContent('Your move.'));
  await act(() => Promise.resolve());
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <main tabIndex={-1}>
        <Routes>
          <Route path="/puzzles" element={<PuzzlesPage />} />
          <Route path="/puzzles/:mode" element={<PuzzlesPage />} />
        </Routes>
      </main>
      <Location />
      <FocusMain />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

describe('PuzzlesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProgress.getState().resetAll();
    useProgress.setState({ onboarded: true, puzzleRating: 1200 });
    useSettings.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('redirects an unknown mode to rated puzzles', async () => {
    renderAt('/puzzles/nonsense');
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/puzzles'));
    expect(screen.getByTestId('location').textContent).toBe('/puzzles');
  });

  it('titles the tab after the mode and keeps the heading when a rating is still needed', () => {
    useProgress.setState({ onboarded: false });
    renderAt('/puzzles/daily');
    expect(document.title).toMatch(/^Daily puzzle · /);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Puzzles');
    // Daily is open without a starting rating; the rated board is not.
    expect(screen.queryByText('Where should your puzzle rating start?')).toBeNull();
    renderAt('/puzzles');
    expect(document.title).toMatch(/^Rated puzzles · /);
    expect(screen.getAllByRole('heading', { level: 1 })[1]).toHaveTextContent('Puzzles');
    expect(screen.getByText('Where should your puzzle rating start?')).toBeInTheDocument();
  });

  it('names the review segment "Due" and the theme link "Practise by theme"', () => {
    renderAt('/puzzles/review');
    expect(screen.getByRole('radio', { name: 'Due' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practise by theme' })).toBeInTheDocument();
    expect(screen.getByText('Redo missed puzzles')).toBeInTheDocument();
  });

  it('takes letter shortcuts in either case, ignores Ctrl/Cmd and does not auto-advance after the solution', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useSettings.getState().update({ puzzleAutoNext: true });
    renderAt('/puzzles');
    await yourMove();
    const hint = screen.getByRole('button', { name: /^Hint/ });

    // Ctrl+S is the browser's, not the solution.
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(status()).toHaveTextContent('Your move.');
    // Caps Lock: "H" is still a hint.
    fireEvent.keyDown(window, { key: 'H' });
    expect(hint).toHaveTextContent(/Show move/);

    // The solution plays out and stays on screen: no Next puzzle 1.2 s later.
    const loadsBefore = vi.mocked(selectPuzzle).mock.calls.length;
    fireEvent.keyDown(window, { key: 'S' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(status()).toHaveTextContent('That is the solution.');
    expect(vi.mocked(selectPuzzle).mock.calls.length).toBe(loadsBefore);
    expect(screen.getByRole('button', { name: /Next puzzle/ })).toBeInTheDocument();
  });

  it('keeps the first daily result when the puzzle is played again', async () => {
    renderAt('/puzzles/daily');
    await yourMove();
    const { localDateKey } = await import('@/lib/dates');
    useProgress.getState().setDaily({ date: localDateKey(), id: 'm1', outcome: 'failed' });
    // Solving it now does not turn the recorded miss into a solve.
    const board = screen.getByRole('application', { name: /Puzzle m1/ });
    act(() => board.focus());
    keyboardMove(board, 'd1', 'd8');
    await vi.waitFor(() => expect(status()).toHaveTextContent('Puzzle solved!'));
    expect(useProgress.getState().daily).toMatchObject({ id: 'm1', outcome: 'failed' });
  });

  it('keeps the missed puzzle on the board while the due list changes', async () => {
    renderAt('/puzzles');
    await yourMove();
    const loads = vi.mocked(selectPuzzle).mock.calls.length;
    const board = screen.getByRole('application', { name: /Puzzle m1/ });
    act(() => board.focus());
    keyboardMove(board, 'd1', 'd2');
    await vi.waitFor(() => expect(status()).toHaveTextContent('Not the best move.'));
    // The miss scheduled a due card, which re-renders the page: the puzzle must stay.
    expect(useProgress.getState().puzzleReviews).toHaveProperty('m1');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(vi.mocked(selectPuzzle).mock.calls.length).toBe(loads);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('looks a linked puzzle up with the rating the link carries', async () => {
    renderAt('/puzzles?id=AbC12&rating=1734');
    await yourMove();
    expect(findPuzzleById).toHaveBeenCalledWith('AbC12', 1734);
    renderAt('/puzzles?id=XyZ89');
    await vi.waitFor(() => expect(findPuzzleById).toHaveBeenCalledWith('XyZ89', undefined));
  });

  it('trains every opening a repertoire card links to', async () => {
    renderAt('/puzzles/openings?opening=Italian_Game,Giuoco_Piano');
    await yourMove();
    expect(selectPuzzle).toHaveBeenCalledWith(
      expect.objectContaining({ openings: ['Italian_Game', 'Giuoco_Piano'] }),
    );
    expect(screen.getByText('Italian Game +1')).toBeInTheDocument();
  });

  it('keeps Woodpecker misses out of the due list and skips a puzzle that is gone', async () => {
    const ids = ['m1', 'gone1', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];
    useProgress.getState().startWoodpecker(ids, 1200);
    renderAt('/puzzles/woodpecker');
    fireEvent.click(screen.getByTestId('woodpecker-continue'));
    await yourMove();
    expect(findPuzzleById).toHaveBeenCalledWith('m1', 1200, { near: 250 });
    const board = screen.getByRole('application', { name: /Puzzle m1/ });
    act(() => board.focus());
    keyboardMove(board, 'd1', 'd2');
    await vi.waitFor(() => expect(status()).toHaveTextContent('Not the best move.'));
    expect(useProgress.getState().puzzleReviews).not.toHaveProperty('m1');
    expect(useProgress.getState().woodpecker?.current).toMatchObject({ index: 1, failed: 1 });

    // The next puzzle of the set is no longer bundled: dropped, not counted as a solve.
    vi.mocked(findPuzzleById).mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/skipped/));
    const set = useProgress.getState().woodpecker;
    expect(set?.puzzleIds).not.toContain('gone1');
    expect(set?.current).toMatchObject({ solved: 0, failed: 1 });
  });

  it('passes over a due puzzle that cannot be loaded offline', async () => {
    const card = (id: string) => ({
      id,
      rating: 1200,
      themes: 'fork',
      step: 0,
      due: Date.now() - 1000,
      lapses: 0,
      addedAt: Date.now() - 90_000_000,
    });
    useProgress.setState({ puzzleReviews: { far: card('far'), m1: card('m1') } });
    vi.mocked(findPuzzleById).mockImplementation((id) =>
      id === 'far' ? Promise.reject(new PuzzleLoadError(['b1100-07.json'])) : Promise.resolve(MATE),
    );
    renderAt('/puzzles/review');
    await yourMove();
    expect(findPuzzleById).toHaveBeenCalledWith('far', 1200);
    expect(screen.queryByRole('alert')).toBeNull();
    vi.mocked(findPuzzleById).mockImplementation(() => Promise.resolve(MATE));
  });

  it('links only to a safe source page, and Next hands the keyboard to the new board', async () => {
    useSettings.getState().update({ puzzleAutoNext: false });
    renderAt('/puzzles');
    await yourMove();
    expect(screen.getByRole('link', { name: 'Source game' })).toHaveAttribute(
      'href',
      'https://lichess.org/x',
    );
    vi.mocked(selectPuzzle).mockResolvedValueOnce({
      ...MATE,
      id: 'm2',
      url: 'javascript:alert(1)',
    });
    const board = screen.getByRole('application', { name: /Puzzle m1/ });
    act(() => board.focus());
    keyboardMove(board, 'd1', 'd8');
    await vi.waitFor(() => expect(status()).toHaveTextContent('Puzzle solved!'));
    fireEvent.click(screen.getByRole('button', { name: /Next puzzle/ }));
    await yourMove();
    expect(screen.getByRole('application', { name: /Puzzle m2/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Source game' })).toBeNull();
    // "Next" hands the keyboard to the new puzzle's board.
    expect(document.activeElement).toBe(screen.getByRole('application', { name: /Puzzle m2/ }));
  });

  it('asks which piece to promote to, even with auto-queen on', async () => {
    useSettings.getState().update({ autoQueen: true });
    // Black's king steps to f6; e8=N+ forks it and the queen (a queen would only draw).
    vi.mocked(selectPuzzle).mockResolvedValueOnce({
      ...MATE,
      id: 'fork1',
      fen: '7K/2q1P3/8/1P3k2/8/8/8/8 b - - 0 1',
      moves: 'f5f6 e7e8n',
      themes: 'fork underPromotion',
    });
    renderAt('/puzzles');
    await yourMove();
    const board = screen.getByRole('application', { name: /Puzzle fork1/ });
    act(() => board.focus());
    keyboardMove(board, 'e7', 'e8');
    const picker = await screen.findByRole('dialog', { name: /promote/i });
    expect(picker).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Knight' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('Puzzle solved!'));
  });

  it('shows the day streak as it stands today, not the stale stored count', async () => {
    useProgress.setState({ streak: { current: 7, best: 9, lastDate: '2020-01-01' } });
    renderAt('/puzzles');
    await yourMove();
    const streak = screen.getByText('Day streak (best 9)');
    expect(streak.previousSibling).toHaveTextContent('0');
  });

  it('ignores letter shortcuts when they are switched off', async () => {
    useSettings.getState().update({ keyboardShortcuts: false });
    renderAt('/puzzles');
    await yourMove();
    const hint = screen.getByRole('button', { name: /^Hint/ });
    expect(hint.querySelector('kbd')).toBeNull();
    fireEvent.keyDown(window, { key: 'h' });
    expect(hint).toHaveTextContent(/^Hint$/);
  });

  it('gives the keyboard back to the mode strip after a mode change', async () => {
    renderAt('/puzzles/themes');
    const daily = screen.getByRole('radio', { name: 'Daily' });
    act(() => screen.getByRole('radio', { name: 'By theme' }).focus());
    fireEvent.keyDown(screen.getByRole('radio', { name: 'By theme' }), { key: 'ArrowLeft' });
    await vi.waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/puzzles/daily'),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(daily));
    expect(daily).toHaveAttribute('aria-checked', 'true');
  });
});

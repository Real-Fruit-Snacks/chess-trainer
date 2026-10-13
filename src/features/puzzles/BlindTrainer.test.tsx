import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { BlindTrainer } from './BlindTrainer';
import type * as PuzzleServiceModule from './puzzleService';
import { type Puzzle, selectPuzzle } from './puzzleService';
import { useBlindPuzzle } from './useBlindPuzzle';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));
vi.mock('./puzzleService', async (importOriginal) => {
  const actual = await importOriginal<typeof PuzzleServiceModule>();
  return { ...actual, selectPuzzle: vi.fn() };
});

/** 20...Bf6 21.Qh7+ Kf8 22.Qxf7#. */
const MATE_IN_TWO: Puzzle = {
  id: 'ob6XZ',
  fen: 'r1bq2k1/pp3pb1/4p1n1/2p3NQ/4P3/2P3P1/PP3PBP/R5K1 b - - 1 20',
  moves: 'g7f6 h5h7 g8f8 h7f7',
  rating: 1104,
  rd: 75,
  popularity: 95,
  plays: 1000,
  themes: 'kingsideAttack mate mateIn2 middlegame short',
  url: 'https://lichess.org/training/ob6XZ',
};

/** 1...Kg8 2.b8=Q+: a promotion, so the piece is asked for. */
const PROMOTION: Puzzle = {
  ...MATE_IN_TWO,
  id: 'promo',
  fen: '7k/1P6/8/8/8/8/8/K7 b - - 0 1',
  moves: 'h8g8 b7b8q',
  themes: 'promotion oneMove',
};

beforeEach(() => {
  localStorage.clear();
  useProgress.getState().resetAll();
  useProgress.setState({ puzzleRating: 1500 });
  useSettings.getState().reset();
  vi.mocked(selectPuzzle).mockReset();
  vi.mocked(selectPuzzle).mockResolvedValue(MATE_IN_TWO);
});
afterEach(() => {
  vi.useRealTimers();
});

async function loaded(depth: 'short' | 'long' | 'veryLong' = 'short') {
  const hook = renderHook(({ d }) => useBlindPuzzle(d), { initialProps: { d: depth } });
  await act(async () => {
    await hook.result.current.next();
  });
  return hook;
}

describe('useBlindPuzzle', () => {
  it('picks a puzzle of the chosen length around the level for that length', async () => {
    useProgress.setState({
      blind: { ...useProgress.getState().blind, levels: { long: 1333 } },
    });
    const { result } = await loaded('long');
    expect(selectPuzzle).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 1333, themes: ['long'], excludeId: null }),
    );
    expect(result.current.phase).toBe('solving');
    expect(result.current.setup?.startFen).toBe(
      'r1bq2k1/pp3p2/4pbn1/2p3NQ/4P3/2P3P1/PP3PBP/R5K1 w - - 2 21',
    );
  });

  it('plays the reply in notation only, and a clean solve raises the level', async () => {
    vi.useFakeTimers();
    const { result } = await loaded();
    act(() => result.current.clickSquare('h5'));
    expect(result.current.selected).toBe('h5');
    act(() => result.current.clickSquare('h7'));
    expect(result.current.phase).toBe('replying');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.phase).toBe('solving');
    expect(result.current.played).toEqual(['h5h7', 'g8f8']);
    expect(result.current.announcement).toBe('Black plays king g8 to f8.');
    let taken = false;
    act(() => {
      taken = result.current.playNotation('qxf7');
    });
    expect(taken).toBe(true);
    expect(result.current.phase).toBe('solved');
    expect(result.current.result).toEqual({
      outcome: 'solved',
      before: 1200,
      after: 1240,
      peeked: false,
    });
    expect(useProgress.getState().blind).toMatchObject({ solved: 1, clean: 1, run: 1 });
    expect(useProgress.getState().blind.levels.short).toBe(1240);
  });

  it('counts a wrong move once; trying again afterwards is practice', async () => {
    vi.useFakeTimers();
    const { result } = await loaded();
    act(() => {
      result.current.playNotation('Qh6');
    });
    expect(result.current.phase).toBe('failed');
    expect(result.current.wrong).toBe('Qh6');
    expect(result.current.result).toMatchObject({ outcome: 'failed', before: 1200, after: 1140 });
    act(() => result.current.retry());
    expect(result.current.practice).toBe(true);
    act(() => {
      result.current.playNotation('Qh7+');
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => {
      result.current.playNotation('Qxf7#');
    });
    expect(result.current.phase).toBe('solved');
    expect(useProgress.getState().blind).toMatchObject({ solved: 0, failed: 1 });
    expect(useProgress.getState().blind.levels.short).toBe(1140);
  });

  it('turns down illegal moves without a miss, and a click on another own piece picks it', async () => {
    const { result } = await loaded();
    act(() => result.current.clickSquare('a1'));
    act(() => result.current.clickSquare('a8'));
    expect(result.current.phase).toBe('solving');
    expect(result.current.notice).toMatch(/not legal/);
    expect(result.current.selected).toBeNull();
    act(() => result.current.clickSquare('h5'));
    act(() => result.current.clickSquare('g5'));
    expect(result.current.selected).toBe('g5');
    act(() => result.current.clickSquare('g5'));
    expect(result.current.selected).toBeNull();
    let taken = true;
    act(() => {
      taken = result.current.playNotation('Qa8');
    });
    expect(taken).toBe(false);
    expect(useProgress.getState().blind.failed).toBe(0);
  });

  it('lets the learner peek once a move is made, and a peeked solve keeps the level', async () => {
    vi.useFakeTimers();
    const { result } = await loaded();
    act(() => result.current.togglePeek());
    expect(result.current.peeking).toBe(false);
    act(() => {
      result.current.playNotation('Qh7+');
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => result.current.togglePeek());
    expect(result.current.peeking).toBe(true);
    expect(result.current.peeked).toBe(true);
    act(() => {
      result.current.playNotation('Qxf7#');
    });
    expect(result.current.peeking).toBe(false);
    expect(result.current.result).toEqual({
      outcome: 'solved',
      before: 1200,
      after: 1200,
      peeked: true,
    });
  });

  it('asks for the piece of a promotion', async () => {
    vi.mocked(selectPuzzle).mockResolvedValue(PROMOTION);
    const { result } = await loaded();
    act(() => result.current.clickSquare('b7'));
    act(() => result.current.clickSquare('b8'));
    expect(result.current.needsPromotion).toEqual({ from: 'b7', to: 'b8' });
    act(() => result.current.resolvePromotion('q'));
    expect(result.current.phase).toBe('solved');
  });

  it('shows the line as a miss', async () => {
    const { result } = await loaded();
    act(() => result.current.showSolution());
    expect(result.current.phase).toBe('solved');
    expect(result.current.solutionShown).toBe(true);
    expect(result.current.played).toEqual(['h5h7', 'g8f8', 'h7f7']);
    expect(result.current.result?.outcome).toBe('failed');
    expect(useProgress.getState().seen.ob6XZ).toBe('failed');
  });

  it('reports a puzzle that cannot be found', async () => {
    vi.mocked(selectPuzzle).mockResolvedValue(null);
    const { result } = await loaded('veryLong');
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toMatch(/No puzzle of that length/);
  });
});

describe('BlindTrainer', () => {
  const renderTrainer = async () => {
    render(
      <MemoryRouter>
        <BlindTrainer />
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('keeps the starting position on the board while the line grows in notation', async () => {
    vi.useFakeTimers();
    await renderTrainer();
    const line = screen.getByTestId('blind-line');
    expect(line.textContent).toContain('20...Bf6');
    expect(screen.getByRole('status').textContent).toMatch(/Find the whole line/);
    expect(screen.getByText('White to move')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Peek/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'h5, white queen' }));
    fireEvent.click(screen.getByRole('button', { name: 'h7, empty' }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(line.textContent).toContain('21.Qh7+');
    expect(line.textContent).toContain('Kf8');
    // The queen has gone to h7 in the line, but the board still shows it on h5.
    expect(screen.getByRole('button', { name: 'h5, white queen' })).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toMatch(/Black plays king g8 to f8/);

    fireEvent.click(screen.getByRole('button', { name: /Peek/ }));
    expect(screen.getByRole('button', { name: 'h7, white queen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Hide/ }));
    expect(screen.getByRole('button', { name: 'h5, white queen' })).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Enter a move' });
    fireEvent.change(input, { target: { value: 'Qxf7#' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByRole('status').textContent).toMatch(/Solved/);
    // Peeked: the level stays. The board now shows where the line ends.
    expect(screen.getByTestId('blind-level').textContent).toBe('Level stays at 1200: you peeked.');
    expect(screen.getByRole('button', { name: 'f7, white queen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show the starting position' }));
    expect(screen.getByRole('button', { name: 'h5, white queen' })).toBeInTheDocument();
  });

  it('leaves the typed-move field to the keyboard entry setting on a phone', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      await renderTrainer();
      expect(screen.queryByRole('textbox', { name: 'Enter a move' })).toBeNull();
      act(() => useSettings.getState().update({ moveInput: true }));
      expect(screen.getByRole('textbox', { name: 'Enter a move' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('switches length from the panel and remembers it', async () => {
    await renderTrainer();
    const lengths = screen.getByRole('radiogroup', { name: 'Line length' });
    fireEvent.click(within(lengths).getByRole('radio', { name: '3 moves' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(useSettings.getState().blindDepth).toBe('long');
    expect(selectPuzzle).toHaveBeenLastCalledWith(expect.objectContaining({ themes: ['long'] }));
  });

  it('offers the next puzzle and the line after a miss', async () => {
    await renderTrainer();
    const input = screen.getByRole('textbox', { name: 'Enter a move' });
    fireEvent.change(input, { target: { value: 'Qh6' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByRole('status').textContent).toMatch(/Qh6 is not the move/);
    expect(screen.getByTestId('blind-level').textContent).toBe('Level 1200 → 1140 (-60).');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show the line/ }));
    expect(screen.getByTestId('blind-line').textContent).toContain('22.Qxf7#');
    fireEvent.click(screen.getByRole('button', { name: /Next puzzle/ }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(selectPuzzle).toHaveBeenLastCalledWith(expect.objectContaining({ excludeId: 'ob6XZ' }));
  });
});

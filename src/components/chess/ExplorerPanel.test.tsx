import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { useSettings } from '@/store/settings';
import { ExplorerPanel } from './ExplorerPanel';

describe('ExplorerPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettings.getState().reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('offers a real switch that writes the explorer setting', () => {
    render(<ExplorerPanel fen={START_FEN} />);
    const toggle = screen.getByRole('switch', { name: 'Look up positions' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/uses the network/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(useSettings.getState().explorer).toBe(true);
    // Once on, the database choice takes the switch's place.
    expect(screen.getByRole('radiogroup', { name: 'Explorer database' })).toBeInTheDocument();
  });

  it('names each move with its score and says that game links open a new tab', async () => {
    useSettings.getState().update({ explorer: true });
    const data = {
      white: 3,
      draws: 1,
      black: 0,
      moves: [{ uci: 'e2e4', san: 'e4', white: 3, draws: 1, black: 0, averageRating: 2400 }],
      topGames: [
        {
          id: 'game1',
          winner: 'white',
          white: { name: 'Anand', rating: 2780 },
          black: { name: 'Carlsen', rating: 2860 },
          year: 2013,
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))),
    );
    const onPlay = vi.fn();
    render(<ExplorerPanel fen="8/8/8/8/8/8/8/K1k5 w - - 0 1" onPlay={onPlay} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    const move = screen.getByRole('button', { name: /scores 88 % for the side to move/ });
    fireEvent.click(move);
    expect(onPlay).toHaveBeenCalledWith('e2e4');
    expect(screen.getByRole('link', { name: /Anand.*opens Lichess in a new tab/ })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  it('says plainly that the explorer needs a connection when offline', async () => {
    useSettings.getState().update({ explorer: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<ExplorerPanel fen="8/8/8/8/8/8/8/K6k w - - 0 1" />);
    expect(screen.getByRole('status')).toHaveTextContent('Looking up…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'You are offline — the explorer needs a network connection.',
    );
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    online.mockRestore();
  });
});

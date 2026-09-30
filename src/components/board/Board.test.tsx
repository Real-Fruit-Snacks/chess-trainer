import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Board } from './Board';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

beforeAll(() => {
  // jsdom has no ResizeObserver; chessground only uses it to redraw on resize.
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

describe('Board keyboard control', () => {
  it('moves a cursor with the arrow keys and plays a move with Enter', async () => {
    const onMove = vi.fn();
    render(
      <Board
        fen={START}
        movableColor="white"
        dests={new Map([['e2', ['e3', 'e4']]])}
        onMove={onMove}
        animate={false}
      />,
    );
    const board = screen.getByRole('application', { name: /Chess board/ });
    expect(board).toHaveAttribute('tabindex', '0');
    act(() => board.focus());
    // The cursor starts on e4 and the overlay appears while the board has focus.
    expect(screen.getByTestId('board-cursor')).toHaveStyle({ left: '50%', top: '50%' });

    // Down twice: e4 -> e3 -> e2 (a white pawn).
    fireEvent.keyDown(board, { key: 'ArrowDown' });
    fireEvent.keyDown(board, { key: 'ArrowDown' });
    expect(screen.getByText('e2, white pawn')).toBeInTheDocument();
    expect(screen.getByTestId('board-cursor')).toHaveStyle({ left: '50%', top: '75%' });

    fireEvent.keyDown(board, { key: 'Enter' });
    expect(screen.getByText(/e2, white pawn selected/)).toBeInTheDocument();

    // Jump straight to e4 by typing the square, then confirm the destination.
    fireEvent.keyDown(board, { key: 'e' });
    fireEvent.keyDown(board, { key: '4' });
    expect(screen.getByText('e4, empty')).toBeInTheDocument();
    fireEvent.keyDown(board, { key: 'Enter' });
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith('e2', 'e4', expect.anything()));
  });

  it('clears the selection with Escape and describes the position on request', () => {
    render(<Board fen={START} movableColor="white" dests={new Map([['g1', ['f3', 'h3']]])} />);
    const board = screen.getByRole('application', { name: /Chess board/ });
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'g' });
    fireEvent.keyDown(board, { key: '1' });
    fireEvent.keyDown(board, { key: 'Enter' });
    expect(screen.getByText(/g1, white knight selected/)).toBeInTheDocument();
    fireEvent.keyDown(board, { key: 'Escape' });
    expect(screen.getByText('Selection cleared.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Describe position' }));
    expect(screen.getByText(/White to move\. White: king e1, queen d1/)).toBeInTheDocument();
  });

  it('is a plain image when view-only', () => {
    render(<Board fen={START} viewOnly />);
    expect(screen.getByRole('img', { name: /Chess board/ })).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button', { name: 'Describe position' })).toBeNull();
  });
});

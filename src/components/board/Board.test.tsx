import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '@/store/settings';
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

describe('Board coordinates', () => {
  const labels = (container: HTMLElement, selector: string) =>
    Array.from(container.querySelectorAll(`${selector} span`)).map((el) => el.textContent);

  it('draws ranks down the left and files along the bottom, one per square', () => {
    const { container } = render(<Board fen={START} viewOnly coordinates />);
    expect(container.querySelector('.board')).toHaveClass('board--coords');
    expect(labels(container, '.board__ranks')).toEqual(['8', '7', '6', '5', '4', '3', '2', '1']);
    expect(labels(container, '.board__files')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('flips with the orientation', () => {
    const { container } = render(<Board fen={START} viewOnly coordinates orientation="black" />);
    expect(labels(container, '.board__ranks')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(labels(container, '.board__files')).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);
  });

  it('leaves no gutter when coordinates are off', () => {
    const { container } = render(<Board fen={START} viewOnly coordinates={false} />);
    expect(container.querySelector('.board')).not.toHaveClass('board--coords');
    expect(container.querySelector('.board__coords')).toBeNull();
  });
});

describe('Board feel settings', () => {
  beforeEach(() => {
    useSettings.getState().reset();
  });

  it('marks the last move and check unless highlights are off', async () => {
    // Chessground keeps square elements around and hides the unused ones.
    const marked = (root: HTMLElement) =>
      Array.from(root.querySelectorAll<HTMLElement>('cg-board square.last-move')).filter(
        (el) => el.style.display !== 'none',
      ).length;
    const { container, rerender } = render(
      <Board fen={START} viewOnly lastMove={['e2', 'e4']} animate={false} />,
    );
    expect(marked(container)).toBe(2);
    act(() => useSettings.getState().update({ boardHighlights: false }));
    rerender(<Board fen={START} viewOnly lastMove={['e2', 'e4']} animate={false} />);
    // The redraw lands on the next animation frame.
    await vi.waitFor(() => expect(marked(container)).toBe(0));
  });

  it('magnifies the dragged piece and shows a drag target by default, and not when turned off', () => {
    const { container, rerender } = render(<Board fen={START} movableColor="white" />);
    expect(container.querySelector('.board')).toHaveClass('board--magnify');
    const target = screen.getByTestId('board-dragtarget');
    expect(target).toHaveClass('board__dragtarget--circle');
    expect(target).toHaveAttribute('hidden');
    act(() => useSettings.getState().update({ magnifyDrag: false, dragTarget: 'square' }));
    rerender(<Board fen={START} movableColor="white" />);
    expect(container.querySelector('.board')).not.toHaveClass('board--magnify');
    expect(screen.getByTestId('board-dragtarget')).toHaveClass('board__dragtarget--square');
    act(() => useSettings.getState().update({ dragTarget: 'none' }));
    rerender(<Board fen={START} movableColor="white" />);
    expect(screen.queryByTestId('board-dragtarget')).toBeNull();
  });

  it('never magnifies or targets a view-only board', () => {
    const { container } = render(<Board fen={START} viewOnly />);
    expect(container.querySelector('.board')).not.toHaveClass('board--magnify');
    expect(screen.queryByTestId('board-dragtarget')).toBeNull();
  });

  it('keeps the keyboard working when moving by drag only', async () => {
    useSettings.getState().update({ moveMethod: 'drag' });
    const onMove = vi.fn();
    const { container } = render(
      <Board
        fen={START}
        movableColor="white"
        dests={new Map([['e2', ['e3', 'e4']]])}
        onMove={onMove}
        animate={false}
      />,
    );
    // Dragging stays on, so the magnifier does too.
    expect(container.querySelector('.board')).toHaveClass('board--magnify');
    const board = screen.getByRole('application', { name: /Chess board/ });
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'e' });
    fireEvent.keyDown(board, { key: '2' });
    fireEvent.keyDown(board, { key: 'Enter' });
    expect(screen.getByText(/e2, white pawn selected/)).toBeInTheDocument();
    fireEvent.keyDown(board, { key: 'e' });
    fireEvent.keyDown(board, { key: '4' });
    fireEvent.keyDown(board, { key: 'Enter' });
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith('e2', 'e4', expect.anything()));
  });

  it('turns the drag off when moving by tap only', () => {
    useSettings.getState().update({ moveMethod: 'tap' });
    const { container } = render(<Board fen={START} movableColor="white" />);
    expect(container.querySelector('.board')).not.toHaveClass('board--magnify');
    expect(screen.queryByTestId('board-dragtarget')).toBeNull();
  });
});

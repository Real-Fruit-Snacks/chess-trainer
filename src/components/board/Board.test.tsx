import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '@/store/settings';
import { Board, type Key } from './Board';

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
    expect(screen.getByText('e4, empty, legal destination')).toBeInTheDocument();
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

  it('is a plain image with a position description when view-only', () => {
    render(<Board fen={START} viewOnly />);
    const img = screen.getByRole('img', { name: /Chess board/ });
    expect(img).not.toHaveAttribute('tabindex');
    expect(img.getAttribute('aria-description')).toMatch(/^White to move\. White: king e1/);
    expect(screen.queryByRole('button', { name: 'Describe position' })).toBeNull();
  });

  it('describes the cursor square on focus and points to its instructions', () => {
    render(<Board fen={START} movableColor="white" dests={new Map()} />);
    const board = screen.getByRole('application', { name: /Chess board/ });
    const instructions = document.getElementById(board.getAttribute('aria-describedby') ?? '');
    expect(instructions?.textContent).toMatch(/arrow keys/);
    act(() => board.focus());
    expect(screen.getByText('e4, empty')).toBeInTheDocument();
  });

  it('swallows file letters (in either case) and Space so page shortcuts and scrolling never fire', () => {
    const pageHandler = vi.fn();
    render(
      <div onKeyDown={pageHandler}>
        <Board fen={START} movableColor="white" dests={new Map([['e2', ['e3', 'e4']]])} />
      </div>,
    );
    const board = screen.getByRole('application', { name: /Chess board/ });
    act(() => board.focus());
    const h = fireEvent.keyDown(board, { key: 'h' });
    expect(h).toBe(false); // default prevented
    fireEvent.keyDown(board, { key: '7' });
    expect(screen.getByText('h7, black pawn')).toBeInTheDocument();
    fireEvent.keyDown(board, { key: 'E' });
    fireEvent.keyDown(board, { key: '2' });
    expect(screen.getByText('e2, white pawn')).toBeInTheDocument();
    const space = fireEvent.keyDown(board, { key: ' ' });
    expect(space).toBe(false);
    expect(screen.getByText(/e2, white pawn selected/)).toBeInTheDocument();
    expect(pageHandler).not.toHaveBeenCalled();
    // Keys the board does not use still reach the page.
    fireEvent.keyDown(board, { key: 'n' });
    expect(pageHandler).toHaveBeenCalledTimes(1);
  });

  it('explains a refused destination, points out legal ones and does not announce the stale square after a move', async () => {
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
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'e' });
    fireEvent.keyDown(board, { key: '2' });
    fireEvent.keyDown(board, { key: 'Enter' });
    // Up twice: e3 is a legal destination, e5 is not.
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    expect(screen.getByText('e3, empty, legal destination')).toBeInTheDocument();
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    fireEvent.keyDown(board, { key: 'Enter' });
    expect(screen.getByText('Not a legal destination.')).toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.keyDown(board, { key: 'ArrowDown' });
    fireEvent.keyDown(board, { key: 'Enter' });
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith('e2', 'e4', expect.anything()));
    expect(screen.queryByText(/e4, empty/)).toBeNull();
  });

  it('says when it is not the player’s move or piece', () => {
    const { rerender } = render(
      <Board fen={START} movableColor="white" dests={new Map([['e2', ['e4']]])} />,
    );
    const board = screen.getByRole('application', { name: /Chess board/ });
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'e' });
    fireEvent.keyDown(board, { key: '7' });
    fireEvent.keyDown(board, { key: 'Enter' });
    expect(screen.getByText('e7, black pawn. Not one of your pieces.')).toBeInTheDocument();
    rerender(<Board fen={START} movableColor="black" dests={new Map()} />);
    fireEvent.keyDown(board, { key: 'Enter' });
    expect(screen.getByText('It is not your move.')).toBeInTheDocument();
  });

  it('castles when the king is dropped on its own rook', async () => {
    const fen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    const onMove = vi.fn();
    const { container } = render(
      <Board
        fen={fen}
        movableColor="white"
        dests={new Map([['e1', ['d1', 'f1', 'g1', 'c1']]])}
        onMove={onMove}
        animate={false}
      />,
    );
    const board = screen.getByRole('application', { name: /Chess board/ });
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'e' });
    fireEvent.keyDown(board, { key: '1' });
    fireEvent.keyDown(board, { key: 'Enter' });
    fireEvent.keyDown(board, { key: 'h' });
    fireEvent.keyDown(board, { key: '1' });
    expect(screen.getByText('h1, white rook, legal destination')).toBeInTheDocument();
    fireEvent.keyDown(board, { key: 'Enter' });
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith('e1', 'g1', expect.anything()));
    expect(container.querySelector('cg-board')).not.toBeNull();
  });
});

describe('Board self-healing', () => {
  it('puts the piece back and stays movable when the page keeps its position (cancelled promotion, vision drill)', async () => {
    const onMove = vi.fn();
    const dests = new Map<Key, Key[]>([['e2', ['e3', 'e4']]]);
    const { container } = render(
      <Board fen={START} movableColor="white" dests={dests} onMove={onMove} animate={false} />,
    );
    const board = screen.getByRole('application', { name: /Chess board/ });
    const pieceOn = (square: string) => {
      // Chessground positions pieces with a translate; the square is on the piece element's key.
      const cg = container.querySelector('cg-board');
      const pieces = Array.from(
        cg?.querySelectorAll<HTMLElement & { cgKey?: string }>('piece') ?? [],
      );
      return pieces.find((p) => p.cgKey === square && p.style.display !== 'none');
    };
    act(() => board.focus());
    const play = () => {
      fireEvent.keyDown(board, { key: 'e' });
      fireEvent.keyDown(board, { key: '2' });
      fireEvent.keyDown(board, { key: 'Enter' });
      fireEvent.keyDown(board, { key: 'e' });
      fireEvent.keyDown(board, { key: '4' });
      fireEvent.keyDown(board, { key: 'Enter' });
    };
    play();
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    // The props did not change, so the pawn is back on e2 after the microtask.
    await vi.waitFor(() => expect(pieceOn('e2')).toBeDefined());
    expect(pieceOn('e4')).toBeUndefined();
    // And the same move can be played again.
    play();
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledTimes(2));
    expect(onMove).toHaveBeenLastCalledWith('e2', 'e4', expect.anything());
  });

  it('leaves a move alone when the page answers with a new position', async () => {
    const after = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    function Harness() {
      const [fen, setFen] = useState(START);
      return (
        <Board
          fen={fen}
          movableColor="white"
          dests={fen === START ? new Map([['e2', ['e3', 'e4']]]) : new Map()}
          onMove={() => setFen(after)}
          lastMove={fen === START ? null : ['e2', 'e4']}
          animate={false}
        />
      );
    }
    const { container } = render(<Harness />);
    const board = screen.getByRole('application', { name: /Chess board/ });
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'e' });
    fireEvent.keyDown(board, { key: '2' });
    fireEvent.keyDown(board, { key: 'Enter' });
    fireEvent.keyDown(board, { key: 'e' });
    fireEvent.keyDown(board, { key: '4' });
    fireEvent.keyDown(board, { key: 'Enter' });
    await vi.waitFor(() =>
      expect(screen.getByText('White plays pawn e2 to e4.')).toBeInTheDocument(),
    );
    await new Promise((r) => setTimeout(r, 0));
    const pieces = Array.from(
      container.querySelectorAll<HTMLElement & { cgKey?: string }>('cg-board piece'),
    );
    expect(pieces.some((p) => p.cgKey === 'e4' && p.style.display !== 'none')).toBe(true);
  });

  it('announces a new position when the move list is left behind', () => {
    const { rerender } = render(<Board fen={START} lastMove={['e2', 'e4']} viewOnly />);
    rerender(<Board fen="8/8/8/8/8/8/8/K6k w - - 0 1" lastMove={null} viewOnly />);
    expect(screen.getByText('New position.')).toBeInTheDocument();
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

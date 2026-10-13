import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '@/store/settings';
import { Board, type Key } from './Board';

/** After 1. e4: Black to move, White premoving. */
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
/** After 1. e4 e5: White to move. */
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
/** After 1. e4 d5: White to move, and e4xd5 is on. */
const AFTER_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
/** After 1. e4 e5 2. d4 d5?: White to move; e4 is attacked, e5 is blocked. */
const BLOCKED = 'rnbqkbnr/ppp2ppp/8/3pp3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3';

/** White's legal moves that matter here, as the page would give them. */
const WHITE_DESTS = new Map<Key, Key[]>([
  ['g1', ['e2', 'f3', 'h3']],
  ['e4', ['e5']],
  ['d2', ['d3', 'd4']],
]);
const NO_DESTS = new Map<Key, Key[]>();

beforeAll(() => {
  // jsdom has no ResizeObserver; chessground only uses it to redraw on resize.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

beforeEach(() => {
  useSettings.getState().reset();
});

/** The squares chessground marks as the waiting premove (unused square elements stay hidden). */
function premoveSquares(root: HTMLElement): number {
  return Array.from(root.querySelectorAll<HTMLElement>('cg-board square.current-premove')).filter(
    (el) => el.style.display !== 'none',
  ).length;
}

/** Types a square on the focused board and presses Enter on it. */
function enter(board: HTMLElement, square: string) {
  fireEvent.keyDown(board, { key: square[0] });
  fireEvent.keyDown(board, { key: square[1] });
  fireEvent.keyDown(board, { key: 'Enter' });
}

function premoveBoard(onMove = vi.fn()) {
  const view = render(
    <Board
      fen={AFTER_E4}
      movableColor="white"
      dests={NO_DESTS}
      premovable
      onMove={onMove}
      animate={false}
    />,
  );
  const board = screen.getByRole('application', { name: /Chess board/ });
  act(() => board.focus());
  /** The position comes back with White to move (the opponent's reply). */
  const reply = (fen: string, dests = WHITE_DESTS, premovable = true) =>
    view.rerender(
      <Board
        fen={fen}
        movableColor="white"
        dests={dests}
        premovable={premovable}
        onMove={onMove}
        animate={false}
      />,
    );
  return { ...view, board, onMove, reply };
}

describe('Board premoves', () => {
  it('sets a premove while the other side thinks, and plays it the moment the turn comes', async () => {
    const { board, container, onMove, reply } = premoveBoard();
    enter(board, 'g1');
    expect(screen.getByText(/g1, white knight selected for a premove/)).toBeInTheDocument();
    enter(board, 'f3');
    await vi.waitFor(() =>
      expect(
        screen.getByText('Premove g1 to f3: played as soon as it is your move.'),
      ).toBeInTheDocument(),
    );
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(2));
    expect(onMove).not.toHaveBeenCalled();

    reply(AFTER_E5);
    await vi.waitFor(() =>
      expect(onMove).toHaveBeenCalledWith('g1', 'f3', expect.objectContaining({ premove: true })),
    );
    expect(onMove).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(0));
  });

  it('drops a premove quietly when the reply leaves it illegal', async () => {
    const { board, container, onMove, reply } = premoveBoard();
    enter(board, 'e4');
    enter(board, 'e5');
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(2));
    // e5 is taken by Black's pawn: e4-e5 is no move any more.
    reply(BLOCKED, new Map([['d4', ['e5']]]));
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('plays a capture premoved onto the square the reply moves to', async () => {
    const { board, onMove, reply } = premoveBoard();
    // A pawn may premove diagonally: legal once Black's pawn arrives on d5.
    enter(board, 'e4');
    enter(board, 'd5');
    await screen.findByText('Premove e4 to d5: played as soon as it is your move.');
    reply(AFTER_D5, new Map([['e4', ['d5', 'e5']]]));
    await vi.waitFor(() =>
      expect(onMove).toHaveBeenCalledWith('e4', 'd5', expect.objectContaining({ premove: true })),
    );
    // The capture is chessground's to report: Black's pawn.
    const meta = onMove.mock.calls[0]?.[2] as { captured?: { role: string } } | undefined;
    expect(meta?.captured?.role).toBe('pawn');
  });

  it('castles by premove', async () => {
    const before = 'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    const after = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const onMove = vi.fn();
    const { rerender } = render(
      <Board fen={before} movableColor="white" dests={NO_DESTS} premovable onMove={onMove} />,
    );
    const board = screen.getByRole('application', { name: /Chess board/ });
    act(() => board.focus());
    enter(board, 'e1');
    enter(board, 'g1');
    await screen.findByText('Premove e1 to g1: played as soon as it is your move.');
    rerender(
      <Board
        fen={after}
        movableColor="white"
        dests={new Map([['e1', ['e2', 'f1', 'g1']]])}
        premovable
        onMove={onMove}
      />,
    );
    await vi.waitFor(() =>
      expect(onMove).toHaveBeenCalledWith('e1', 'g1', expect.objectContaining({ premove: true })),
    );
  });

  it('cancels a premove with Escape, from the board or anywhere on the page', async () => {
    const { board, container, onMove, reply } = premoveBoard();
    enter(board, 'g1');
    enter(board, 'f3');
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(2));
    fireEvent.keyDown(board, { key: 'Escape' });
    expect(screen.getByText('Premove cancelled.')).toBeInTheDocument();
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(0));

    enter(board, 'd2');
    enter(board, 'd4');
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(2));
    act(() => board.blur());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(0));

    reply(AFTER_E5);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('drops a waiting premove when premoves stop (the game is over)', async () => {
    const { board, container, onMove, reply } = premoveBoard();
    enter(board, 'g1');
    enter(board, 'f3');
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(2));
    reply(AFTER_E5, NO_DESTS, false);
    await vi.waitFor(() => expect(premoveSquares(container)).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('explains what cannot be premoved, and keeps saying whose move it is without premoves', () => {
    const { board, rerender } = premoveBoard();
    enter(board, 'e7');
    expect(screen.getByText('e7, black pawn. Not one of your pieces.')).toBeInTheDocument();
    enter(board, 'e5');
    expect(
      screen.getByText('Your opponent is to move: select one of your pieces to premove.'),
    ).toBeInTheDocument();
    enter(board, 'g1');
    enter(board, 'g4');
    expect(screen.getByText('That piece cannot go there.')).toBeInTheDocument();

    rerender(<Board fen={AFTER_E4} movableColor="white" dests={NO_DESTS} animate={false} />);
    enter(board, 'g1');
    expect(screen.getByText('It is not your move.')).toBeInTheDocument();
  });
});

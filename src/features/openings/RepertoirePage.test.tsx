import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepertoire } from '@/store/repertoire';
import { useSettings } from '@/store/settings';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

/** The board is a chessground instance; a stub that hands its props to the test. */
const board = vi.hoisted(() => ({
  props: null as null | { onMove?: (from: string, to: string) => void },
}));
vi.mock('@/components/board/Board', () => ({
  Board: (props: { onMove?: (from: string, to: string) => void; ariaLabel?: string }) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

import RepertoirePage from './RepertoirePage';

// jsdom has no modal dialog support; the real element fires `close` on close().
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

function seedCustom(pgn: string) {
  useRepertoire.setState({
    custom: [{ id: 'custom-test', name: 'My lines', color: 'white', pgn, createdAt: 0 }],
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/openings/custom-test']}>
      <Routes>
        <Route path="/openings/:repertoireId" element={<RepertoirePage />} />
        <Route path="/openings" element={<p>All openings</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The open confirmation dialog (jsdom keeps closed dialogs in the tree). */
function openDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('dialog[open]');
  if (!dialog) throw new Error('No dialog is open');
  return dialog;
}

describe('RepertoirePage', () => {
  beforeEach(() => {
    useRepertoire.setState({ cards: {}, custom: [], sessions: [] });
    useSettings.getState().reset();
    board.props = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a stored repertoire that cannot be read offers its text and a delete, not a crash', () => {
    seedCustom('[SetUp "1"]\n[FEN "not a position"]\n\n1. e4 *');
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'My lines' })).toBeInTheDocument();
    expect(screen.getByTestId('repertoire-unreadable')).toHaveTextContent(
      'This repertoire could not be read',
    );
    expect(screen.getByRole('button', { name: 'Copy its text' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete this repertoire' }));
    const dialog = openDialog();
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Delete “My lines”?');
    fireEvent.click(within(dialog).getByTestId('confirm-accept'));
    expect(useRepertoire.getState().custom).toHaveLength(0);
    expect(screen.getByText('All openings')).toBeInTheDocument();
  });

  it('"Delete from here" asks first and keeps the line when cancelled', () => {
    seedCustom('1. e4 e5 2. Nf3 *');
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit lines' }));
    const moves = container.querySelectorAll<HTMLButtonElement>('.treemoves__move');
    expect(moves).toHaveLength(3);
    fireEvent.click(moves[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Delete from here' }));
    let dialog = openDialog();
    expect(dialog).toHaveTextContent('and every move after it (1 more move)');
    fireEvent.click(within(dialog).getByTestId('confirm-cancel'));
    expect(useRepertoire.getState().custom[0]?.pgn).toContain('Nf3');

    fireEvent.click(screen.getByRole('button', { name: 'Delete from here' }));
    dialog = openDialog();
    fireEvent.click(within(dialog).getByTestId('confirm-accept'));
    const pgn = useRepertoire.getState().custom[0]?.pgn ?? '';
    expect(pgn).toContain('e4');
    expect(pgn).not.toContain('e5');
  });

  it('"Forget all moves" asks first and keeps the lines', () => {
    seedCustom('1. e4 e5 2. Nf3 *');
    useRepertoire.setState({
      cards: {
        'custom-test|e2e4': {
          ease: 2.5,
          interval: 1,
          due: 0,
          reps: 1,
          lapses: 0,
          lastReviewed: 0,
        },
      },
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Forget all 2 moves' }));
    let dialog = openDialog();
    fireEvent.click(within(dialog).getByTestId('confirm-cancel'));
    expect(Object.keys(useRepertoire.getState().cards)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Forget all 2 moves' }));
    dialog = openDialog();
    expect(dialog).toHaveTextContent('The lines themselves are kept');
    fireEvent.click(within(dialog).getByTestId('confirm-accept'));
    expect(useRepertoire.getState().cards).toEqual({});
    expect(useRepertoire.getState().custom[0]?.pgn).toContain('Nf3');
  });

  it('N moves on in either case, but not with a modifier or from the board', () => {
    vi.useFakeTimers();
    seedCustom('1. e4 *');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
    act(() => board.props?.onMove?.('e2', 'e4'));
    const status = () => document.querySelector('.puzzle-status')?.textContent ?? '';
    expect(status()).toContain('Line complete');

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('application'), { key: 'n' });
    expect(status()).toContain('Line complete');

    // Caps Lock or Shift: still N.
    fireEvent.keyDown(window, { key: 'N' });
    expect(screen.getByText('Session complete')).toBeInTheDocument();
  });

  it('with single-key shortcuts off, Space still shows the move and N does nothing', () => {
    vi.useFakeTimers();
    useSettings.getState().update({ keyboardShortcuts: false });
    seedCustom('1. e4 *');
    useRepertoire.setState({
      cards: {
        'custom-test|e2e4': { ease: 2.3, interval: 0, due: 0, reps: 0, lapses: 1, lastReviewed: 1 },
      },
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review due moves' }));
    const status = () => document.querySelector('.puzzle-status')?.textContent ?? '';
    expect(status()).toBe('Your move. What does the repertoire say?');
    fireEvent.keyDown(window, { key: ' ' });
    expect(status()).toBe('Play the move shown.');
    act(() => board.props?.onMove?.('e2', 'e4'));
    expect(status()).toContain('Line complete');
    fireEvent.keyDown(window, { key: 'n' });
    expect(status()).toContain('Line complete');
    expect(screen.queryByText('Session complete')).not.toBeInTheDocument();
  });

  it('a forgotten move is recalled from memory, not shown again as a new move', () => {
    seedCustom('1. e4 *');
    useRepertoire.setState({
      cards: {
        'custom-test|e2e4': { ease: 2.3, interval: 0, due: 0, reps: 0, lapses: 1, lastReviewed: 1 },
      },
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review due moves' }));
    const status = () => document.querySelector('.puzzle-status')?.textContent ?? '';
    expect(status()).toBe('Your move. What does the repertoire say?');
    fireEvent.keyDown(window, { key: ' ' });
    expect(status()).toBe('Play the move shown.');
  });

  it('says the current line in words, with the moves still to find', () => {
    seedCustom('1. e4 e5 2. Nf3 Nc6 3. Bb5 *');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
    const line = document.querySelector('.openings__line');
    expect(line).not.toHaveAttribute('aria-label');
    expect(line).toHaveTextContent('Current line:');
    expect(line).toHaveTextContent('and 4 moves still to find');
  });
});

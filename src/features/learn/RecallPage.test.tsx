import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawShape } from '@/components/board/Board';
import { useProgress } from '@/store/progress';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

/** The board is a chessground instance; a stub that hands its props to the test. */
const board = vi.hoisted(() => ({
  props: null as null | {
    onMove?: (from: string, to: string) => void;
    shapes?: DrawShape[];
  },
}));
vi.mock('@/components/board/Board', () => ({
  Board: (props: { onMove?: (from: string, to: string) => void; ariaLabel?: string }) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

import RecallPage from './RecallPage';

const CARD = 'how-pieces-move:0';

function seedDueCard() {
  useProgress.setState({
    lessonRecall: {
      [CARD]: {
        id: CARD,
        rating: 0,
        themes: 'how-pieces-move',
        step: 1,
        due: Date.now() - 1000,
        lapses: 0,
        addedAt: 1,
      },
    },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RecallPage />
    </MemoryRouter>,
  );
}

describe('RecallPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    seedDueCard();
  });

  it('names the schedule step an interval, not a lesson step', () => {
    renderPage();
    expect(screen.getByTestId('recall-interval')).toHaveTextContent('Interval 2 of 5');
  });

  it('records "Show answer" as a miss: the card comes back tomorrow', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByTestId('recall-result')).toHaveTextContent(
      'Missed — it comes back tomorrow.',
    );
    const card = useProgress.getState().lessonRecall[CARD];
    expect(card?.step).toBe(0);
    expect(card?.lapses).toBe(1);
  });

  it('records a wrong move then the right one as a miss', () => {
    vi.useFakeTimers();
    try {
      renderPage();
      act(() => board.props?.onMove?.('d4', 'd8'));
      act(() => {
        vi.advanceTimersByTime(800);
      });
      act(() => board.props?.onMove?.('d4', 'h4'));
      expect(screen.getByTestId('recall-result')).toHaveTextContent('Missed');
      expect(useProgress.getState().lessonRecall[CARD]?.step).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the hint marks before the grade, but never the lesson’s own arrows', () => {
    renderPage();
    expect(board.props?.shapes).toEqual([]);
    // Caps Lock (or Shift) does not break the shortcut; Ctrl+H is the browser's.
    fireEvent.keyDown(window, { key: 'h', ctrlKey: true });
    expect(board.props?.shapes).toEqual([]);
    fireEvent.keyDown(window, { key: 'H' });
    expect(board.props?.shapes).toEqual([{ orig: 'd4', brush: 'yellow' }]);
    // Typing on the board never fires the shortcut.
    fireEvent.keyDown(screen.getByRole('application'), { key: 'h' });
    expect(board.props?.shapes).toEqual([{ orig: 'd4', brush: 'yellow' }]);
    fireEvent.click(screen.getByRole('button', { name: /Hint/ }));
    expect(board.props?.shapes).toEqual([{ orig: 'd4', dest: 'h4', brush: 'yellow' }]);

    act(() => board.props?.onMove?.('d4', 'h4'));
    // A recall with a hint keeps its interval…
    expect(screen.getByTestId('recall-result')).toHaveTextContent('Recalled with a hint');
    expect(useProgress.getState().lessonRecall[CARD]?.step).toBe(1);
    // …and once graded, the lesson's arrows are back.
    expect(board.props?.shapes?.length).toBe(4);
  });

  it('advances a clean recall to the next interval', () => {
    renderPage();
    act(() => board.props?.onMove?.('d4', 'h4'));
    expect(screen.getByTestId('recall-result')).toHaveTextContent('Recalled!');
    expect(useProgress.getState().lessonRecall[CARD]?.step).toBe(2);
  });
});

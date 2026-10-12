import { fireEvent, render, screen } from '@testing-library/react';
import { Chess } from 'chess.js';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { useProgress } from '@/store/progress';
import { reviewOf } from '@/test/fakeReview';
import { FixMistakesPanel, FixMistakesStart } from './FixMistakes';
import type { UseFixMistakes } from './useFixMistakes';

const SANS = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Nc3', 'Nxh5'];
const REVIEW = reviewOf(SANS, {
  3: { judgement: 'inaccuracy', best: 'g1f3' },
  6: { judgement: 'blunder', best: 'd8e7' },
  7: { judgement: 'blunder', best: 'h5f7' },
});
const STEPS = [REVIEW.moves[2]!, REVIEW.moves[6]!];

const LINE = (() => {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of SANS) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return { fens, sans: SANS };
})();

const inRouter = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

function fixState(overrides: Partial<UseFixMistakes>): UseFixMistakes {
  return {
    phase: 'asking',
    side: 'white',
    steps: STEPS,
    index: 0,
    step: STEPS[0] ?? null,
    answer: null,
    feedback: null,
    results: [],
    board: null,
    pendingPromotion: null,
    start: vi.fn(),
    leave: vi.fn(),
    play: vi.fn(),
    playNotation: vi.fn(() => true),
    resolvePromotion: vi.fn(),
    show: vi.fn(),
    next: vi.fn(),
    retryMissed: vi.fn(),
    ...overrides,
  };
}

function panel(fix: UseFixMistakes) {
  return inRouter(
    <FixMistakesPanel
      fix={fix}
      startFen={START_FEN}
      line={LINE}
      meta={{ title: 'You – Engine', rating: 1400 }}
      onLeave={fix.leave}
    />,
  );
}

afterEach(() => useProgress.setState({ ownPuzzles: {} }));

describe('FixMistakesStart', () => {
  it('offers the learner’s mistakes when their side is known', () => {
    const onStart = vi.fn();
    render(<FixMistakesStart review={REVIEW} learnerSide="white" onStart={onStart} />);
    const start = screen.getByRole('button', { name: 'Fix your mistakes (2)' });
    expect(start).not.toHaveFocus();
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith('white');
  });

  it('takes the focus back when the pass ends', () => {
    render(<FixMistakesStart review={REVIEW} learnerSide="white" onStart={vi.fn()} focus />);
    expect(screen.getByRole('button', { name: 'Fix your mistakes (2)' })).toHaveFocus();
  });

  it('says so when the learner made none', () => {
    const clean = reviewOf(SANS, { 6: { judgement: 'blunder', best: 'd8e7' } });
    render(<FixMistakesStart review={clean} learnerSide="white" onStart={vi.fn()} />);
    expect(screen.getByTestId('fix-none')).toHaveTextContent(
      'You made no inaccuracies, mistakes or blunders to fix in this game.',
    );
  });

  it('asks which side was the learner’s when the game does not say', () => {
    const onStart = vi.fn();
    render(<FixMistakesStart review={REVIEW} learnerSide={null} onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fix your mistakes' }));
    expect(screen.getByRole('group', { name: 'Which side did you play?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Black (1)' }));
    expect(onStart).toHaveBeenCalledWith('black');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('stays away from a game without mistakes', () => {
    const { container } = render(
      <FixMistakesStart review={reviewOf(SANS, {})} learnerSide={null} onStart={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FixMistakesPanel', () => {
  it('asks for a better move, with the progress and a way to see the answer', () => {
    const fix = fixState({
      feedback: { tone: 'warning', text: 'a3 is not good enough here. Try another move.' },
    });
    panel(fix);
    // The keyboard carries on from the card, the button that opened it being gone.
    expect(screen.getByRole('heading', { name: 'Fix your mistakes' })).toHaveFocus();
    expect(screen.getByTestId('fix-progress')).toHaveTextContent('1 of 2');
    expect(screen.getByTestId('fix-prompt')).toHaveTextContent(
      '2. You played Bc4, an inaccuracy. Find a better move.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('a3 is not good enough here.');
    fireEvent.click(screen.getByRole('button', { name: 'Show the move' }));
    expect(fix.show).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the game' }));
    expect(fix.leave).toHaveBeenCalled();
    expect(screen.queryByTestId('fix-why')).toBeNull();
  });

  it('explains the mistake once the move is on the board, and goes on', () => {
    const fix = fixState({
      phase: 'shown',
      index: 1,
      step: STEPS[1] ?? null,
      answer: { san: 'Qxf7#', uci: 'h5f7' },
      feedback: { tone: 'info', text: 'The move was Qxf7#.' },
      results: [{ ply: 3, outcome: 'first', found: 'Nf3' }],
    });
    panel(fix);
    expect(screen.getByTestId('fix-why')).toHaveTextContent('Why Nc3 was a blunder');
    fireEvent.click(screen.getByRole('button', { name: 'See how it went' }));
    expect(fix.next).toHaveBeenCalled();
  });

  it('sums up, saves the misses as puzzles and offers them again', () => {
    const fix = fixState({
      phase: 'summary',
      index: 1,
      step: STEPS[1] ?? null,
      results: [
        { ply: 3, outcome: 'retry', found: 'Nf3' },
        { ply: 7, outcome: 'shown', found: null },
      ],
    });
    panel(fix);
    expect(screen.getByTestId('fix-summary')).toHaveTextContent(
      'You found 1 of 2 after more than one try; you were shown the other one.',
    );
    expect(screen.getByText(/you found/)).toHaveTextContent(
      '2. Bc4 — you found Nf3 after another try',
    );
    expect(screen.getByText(/shown:/)).toHaveTextContent('4. Nc3 — shown: Qxf7#');
    fireEvent.click(screen.getByRole('button', { name: 'Save the one you missed as puzzles' }));
    expect(Object.values(useProgress.getState().ownPuzzles)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Saved as puzzles' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try the missed ones again' }));
    expect(fix.retryMissed).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameTree } from '@/chess/tree';
import type { ReviewedMove, ReviewSummary } from './gameReview';
import { SelfReviewPanel } from './SelfReviewPanel';
import type { UseSelfReview } from './useSelfReview';

function tree() {
  const t = new GameTree();
  for (const san of ['e4', 'f6', 'd4', 'g5']) t.addMove(san);
  return t;
}

function selfReview(patch: Partial<UseSelfReview>): UseSelfReview {
  return {
    phase: 'marking',
    marks: [],
    suggesting: null,
    notice: null,
    score: null,
    suggestions: new Map(),
    markedNodes: new Set(),
    start: vi.fn(),
    stop: vi.fn(),
    toggleMark: vi.fn(),
    suggestFor: vi.fn(),
    cancelSuggestion: vi.fn(),
    removeSuggestion: vi.fn(),
    check: vi.fn(),
    finish: vi.fn(),
    ...patch,
  };
}

const label = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}`;

function renderPanel(self: UseSelfReview, ply = 4, review: ReviewSummary | null = null) {
  const t = tree();
  const line = t.mainLine();
  const current = line[ply - 1] ?? t.root;
  const onSelectPly = vi.fn();
  render(
    <SelfReviewPanel
      self={self}
      current={current}
      isMain
      mainLine={line}
      review={review}
      reviewProgress={null}
      engineReady
      label={label}
      onSelectPly={onSelectPly}
      shortcutsOn
    />,
  );
  return { line, current, onSelectPly };
}

describe('SelfReviewPanel', () => {
  it('marks the move on the board and asks for the move instead', () => {
    const self = selfReview({});
    const { current } = renderPanel(self);
    fireEvent.click(screen.getByRole('button', { name: /Mark as a turning point/ }));
    expect(self.toggleMark).toHaveBeenCalledWith(current);
    expect(screen.queryByRole('button', { name: 'Your move instead' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check with the engine' }));
    expect(self.check).toHaveBeenCalled();
  });

  it('lists the marks, with the move instead and a way to drop either', () => {
    const self = selfReview({
      marks: [
        { ply: 2, san: 'f6' },
        { ply: 4, san: 'g5', suggestion: { uci: 'e7e6', san: 'e6' } },
      ],
      suggesting: 2,
    });
    const { onSelectPly } = renderPanel(self);
    expect(screen.getByRole('button', { name: /Marked/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Change your move' }));
    expect(self.suggestFor).toHaveBeenCalledWith(4);
    expect(screen.getByText(/Play the move you would choose instead of/)).toHaveTextContent(
      'Play the move you would choose instead of 1… f6 on the board.',
    );
    const list = screen.getByRole('list', { name: 'Your turning points' });
    expect(list).toHaveTextContent('instead: e6');
    expect(list).toHaveTextContent('no move instead yet');
    fireEvent.click(within(list).getByRole('button', { name: 'Unmark f6' }));
    expect(self.toggleMark).toHaveBeenCalled();
    fireEvent.click(within(list).getByRole('button', { name: 'Drop your move instead of g5' }));
    expect(self.removeSuggestion).toHaveBeenCalledWith(4);
    const row = within(list)
      .getAllByRole('button')
      .find((b) => b.textContent?.startsWith('1… f6'));
    if (!row) throw new Error('no row for 1… f6');
    fireEvent.click(row);
    expect(onSelectPly).toHaveBeenCalledWith(2);
  });

  it('shows how the marks compared with the engine', () => {
    const self = selfReview({
      phase: 'done',
      marks: [
        { ply: 1, san: 'e4' },
        { ply: 3, san: 'd4' },
        { ply: 4, san: 'g5', suggestion: { uci: 'e7e6', san: 'e6' } },
      ],
      score: {
        moments: [
          { ply: 2, san: 'f6', mover: 'black', judgement: 'mistake', best: 'e5', outcome: 'late' },
          { ply: 4, san: 'g5', mover: 'black', judgement: 'blunder', best: 'e5', outcome: 'found' },
          {
            ply: 6,
            san: 'Ke7',
            mover: 'black',
            judgement: 'blunder',
            best: null,
            outcome: 'missed',
          },
        ],
        marks: [
          { ply: 1, san: 'e4', outcome: 'false-alarm' },
          { ply: 3, san: 'd4', outcome: 'late' },
          { ply: 4, san: 'g5', outcome: 'found' },
        ],
        found: 2,
        late: 1,
        total: 3,
        falseAlarms: 1,
      },
      suggestions: new Map([[4, { verdict: 'ok' as const, loss: 0.07, best: 'e7e5' }]]),
    });
    renderPanel(self);
    const result = screen.getByTestId('self-review-result');
    expect(result).toHaveTextContent(
      'You found 2 of 3 turning points (1 a move late) · 1 false alarm.',
    );
    const moments = screen.getByRole('list', { name: 'The engine’s turning points' });
    expect(moments).toHaveTextContent('a mistake by black — better was e5');
    expect(moments).toHaveTextContent('you marked the move after it');
    expect(moments).toHaveTextContent('missed');
    expect(screen.getByRole('list', { name: 'Your other marks' })).toHaveTextContent(
      'the engine found nothing wrong with it',
    );
    expect(screen.getByRole('list', { name: 'Your moves instead' })).toHaveTextContent(
      'instead of g5: playable',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(self.finish).toHaveBeenCalled();
  });

  it('names the game move as the engine’s choice when it chose it too', () => {
    const reviewed = (ply: number, san: string, best: string | null): ReviewedMove => ({
      ply,
      san,
      mover: ply % 2 ? 'white' : 'black',
      winBefore: 0.5,
      winAfter: 0.5,
      loss: 0,
      judgement: best ? 'good' : 'best',
      best,
      bestUci: null,
      scoreBefore: null,
      fen: '',
      scoreAfter: null,
      bestPv: [],
      replyUci: null,
      replyPv: [],
    });
    const review: ReviewSummary = {
      moves: [reviewed(1, 'e4', null), reviewed(2, 'f6', 'e5'), reviewed(3, 'd4', null)],
      counts: {
        white: { inaccuracy: 0, mistake: 0, blunder: 0 },
        black: { inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      accuracy: { white: 100, black: 90 },
      wins: [],
      depth: 12,
    };
    const self = selfReview({
      phase: 'done',
      marks: [
        { ply: 2, san: 'f6', suggestion: { uci: 'd7d5', san: 'd5' } },
        { ply: 3, san: 'd4', suggestion: { uci: 'b1c3', san: 'Nc3' } },
      ],
      score: {
        moments: [],
        marks: [
          { ply: 2, san: 'f6', outcome: 'false-alarm' },
          { ply: 3, san: 'd4', outcome: 'false-alarm' },
        ],
        found: 0,
        late: 0,
        total: 0,
        falseAlarms: 2,
      },
      suggestions: new Map([
        [2, { verdict: 'ok' as const, loss: 0.07, best: 'e7e5' }],
        [3, { verdict: 'worse' as const, loss: 0.2, best: 'd2d4' }],
      ]),
    });
    renderPanel(self, 4, review);
    const list = screen.getByRole('list', { name: 'Your moves instead' });
    expect(list).toHaveTextContent('instead of f6: playable (engine: e5)');
    expect(list).toHaveTextContent(
      'instead of d4: weaker than the engine’s move (engine: d4, as played)',
    );
  });
});

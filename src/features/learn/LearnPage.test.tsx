import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PuzzleReviewCard } from '@/lib/puzzleReview';
import { useProgress } from '@/store/progress';
import LearnPage from './LearnPage';

const DAY = 86_400_000;

function card(id: string, due: number): PuzzleReviewCard {
  return { id, rating: 0, themes: 'how-pieces-move', step: 1, due, lapses: 0, addedAt: 1 };
}

function renderLearn() {
  return render(
    <MemoryRouter>
      <LearnPage />
    </MemoryRouter>,
  );
}

describe('LearnPage lesson recall', () => {
  beforeEach(() => useProgress.getState().resetAll());

  it('stays out of the way until a lesson has scheduled positions', () => {
    renderLearn();
    expect(screen.queryByTestId('learn-recall')).toBeNull();
  });

  it('shows how many positions are due and leads to the recall page', () => {
    useProgress.setState({
      lessonRecall: {
        'how-pieces-move:0': card('how-pieces-move:0', Date.now() - 1000),
        'how-pieces-move:1': card('how-pieces-move:1', Date.now() + DAY),
      },
    });
    renderLearn();
    const recall = screen.getByTestId('learn-recall');
    expect(
      within(recall).getByRole('heading', { level: 2, name: 'Lesson recall' }),
    ).toBeInTheDocument();
    expect(recall).toHaveTextContent('1 position due now');
    expect(within(recall).getByRole('link', { name: 'Recall now' })).toHaveAttribute(
      'href',
      '/learn/recall',
    );
  });

  it('says what is scheduled when nothing is due yet', () => {
    useProgress.setState({
      lessonRecall: {
        'how-pieces-move:0': card('how-pieces-move:0', Date.now() + DAY),
        'how-pieces-move:1': card('how-pieces-move:1', Date.now() + 3 * DAY),
      },
    });
    renderLearn();
    const recall = screen.getByTestId('learn-recall');
    expect(recall).toHaveTextContent('Nothing due right now · 2 positions scheduled');
    expect(within(recall).getByRole('link', { name: 'Open recall' })).toHaveAttribute(
      'href',
      '/learn/recall',
    );
  });
});

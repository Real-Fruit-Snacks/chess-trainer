import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProgress } from '@/store/progress';
import { ThinkingSkillsCard } from './ThinkingSkillsCard';

const renderCard = () =>
  render(
    <MemoryRouter>
      <ThinkingSkillsCard />
    </MemoryRouter>,
  );

describe('ThinkingSkillsCard', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetAll();
  });

  it('explains the skills until there is a record', () => {
    renderCard();
    expect(screen.getByTestId('thinking-skills')).toHaveTextContent(
      'name your opponent’s threat before you move',
    );
    expect(screen.getByRole('link', { name: 'Blind puzzles' })).toHaveAttribute(
      'href',
      '/puzzles/blind',
    );
  });

  it('shows each record once there is one', () => {
    const s = useProgress.getState();
    s.recordThreat({ id: 'a', found: true, defence: 'held' });
    s.recordThreat({ id: 'b', found: false, defence: 'failed' });
    s.recordThreat({ id: 'c', found: true, defence: null });
    s.recordBlind({ id: 'p', depth: 'long', outcome: 'solved', peeked: false });
    s.recordSelfReview({ found: 1, total: 2, falseAlarms: 0, suggestions: 0, goodSuggestions: 0 });
    s.recordSelfReview({ found: 3, total: 3, falseAlarms: 1, suggestions: 1, goodSuggestions: 1 });
    s.recordBlunderCheck('stopped');
    renderCard();
    const card = screen.getByTestId('thinking-skills');
    expect(card).toHaveTextContent('67%Threats named · 3 tried');
    expect(card).toHaveTextContent('50%Threats met · 2 tried');
    expect(card).toHaveTextContent('Blind level · 3 moves');
    expect(card).not.toHaveTextContent('Blind level · 2 moves');
    expect(card).toHaveTextContent('80%Turning points caught · 2 games');
    expect(card).toHaveTextContent('1Moves the blunder check held back');
    expect(screen.getByTestId('self-review-trend')).toHaveTextContent(
      'Your last self-analyses: 1/2 · 3/3',
    );
  });
});

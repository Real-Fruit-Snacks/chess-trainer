import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { localDateKey } from '@/lib/dates';
import { useProgress } from '@/store/progress';
import ArcadePage from './ArcadePage';
import { ARCADE_GAMES } from './games';

describe('ArcadePage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
  });

  it('names every Play link after its game', () => {
    render(
      <MemoryRouter>
        <ArcadePage />
      </MemoryRouter>,
    );
    for (const game of ARCADE_GAMES) {
      const link = screen.getByRole('link', { name: `Play ${game.name}` });
      expect(link).toHaveAttribute('href', `/arcade/${game.id}`);
      expect(link).toHaveTextContent('Play');
    }
    expect(screen.getByRole('link', { name: 'Play Simul' })).toBeInTheDocument();
  });

  it('shows how today stands in the Daily Opening, not a stale streak', () => {
    useProgress.getState().setDailyOpening({
      date: localDateKey(),
      guesses: ['Italian Game'],
      result: null,
      streak: 0,
      bestStreak: 0,
      history: {},
    });
    render(
      <MemoryRouter>
        <ArcadePage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('arcade-best-daily-opening')).toHaveTextContent(
      'Today: 1 of 6 guesses',
    );
  });
});

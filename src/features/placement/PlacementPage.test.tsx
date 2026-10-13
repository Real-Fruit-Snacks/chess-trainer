import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';

vi.mock('@/components/board/Board', () => ({
  Board: (props: { ariaLabel?: string }) => <div role="img" aria-label={props.ariaLabel} />,
}));

import PlacementPage from './PlacementPage';

function renderQuiz() {
  return render(
    <MemoryRouter initialEntries={['/placement']}>
      <Routes>
        <Route path="/placement" element={<PlacementPage />} />
        <Route path="/learn/course/:courseId" element={<p>Course page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const next = () => fireEvent.click(screen.getByTestId('placement-next'));

/** Answers every question ("I play regularly online", the positions skipped). */
function answerAll() {
  fireEvent.click(screen.getByRole('radio', { name: 'I play regularly online' }));
  next();
  fireEvent.click(screen.getByRole('checkbox', { name: /castling/ }));
  next();
  next(); // skip the three positions
  next();
  next();
  fireEvent.click(
    screen.getByRole('radio', { name: 'I can mate with king and queen against king' }),
  );
  next();
  fireEvent.click(
    screen.getByRole('radio', { name: 'I know a few openings by name and their first moves' }),
  );
  next();
}

describe('PlacementPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    useSettings.getState().reset();
  });

  it('counts its own questions in the introduction', () => {
    renderQuiz();
    expect(screen.getByTestId('placement-intro')).toHaveTextContent(
      'Four quick questions and three positions.',
    );
  });

  it('shows the answer options in the move notation setting', () => {
    useSettings.setState({ notation: 'figurine' });
    renderQuiz();
    fireEvent.click(screen.getByRole('radio', { name: 'I play regularly online' }));
    next();
    next();
    // The first position offers Re8#, Rxd5 and Nxd5: the piece letters become figurines.
    const options = screen.getByTestId('placement-tactic');
    expect(options.querySelectorAll('piece.san__piece').length).toBe(3);
  });

  it('names the level in words and seeds the rating when the course is opened', () => {
    renderQuiz();
    answerAll();
    expect(screen.getByTestId('placement-level')).toHaveTextContent('Intermediate');
    expect(useProgress.getState().placement?.courseId).toBe('club-player');
    expect(useProgress.getState().onboarded).toBe(false);
    const rating = useProgress.getState().placement?.rating;

    fireEvent.click(screen.getByTestId('placement-open-course'));
    expect(screen.getByText('Course page')).toBeInTheDocument();
    // Puzzles will not ask "how much chess have you played?" again.
    expect(useProgress.getState().onboarded).toBe(true);
    expect(useProgress.getState().puzzleRating).toBe(rating);
  });

  it('leaves an existing rating alone when the course is opened', () => {
    useProgress.getState().completeOnboarding(1900);
    renderQuiz();
    answerAll();
    fireEvent.click(screen.getByTestId('placement-open-course'));
    expect(useProgress.getState().puzzleRating).toBe(1900);
  });
});

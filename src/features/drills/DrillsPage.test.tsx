import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProgress } from '@/store/progress';
import DrillsPage from './DrillsPage';

describe('DrillsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetAll();
  });

  it('lists the thinking drills with their records', () => {
    useProgress.getState().recordThreat({ id: 'p1', found: true, defence: null });
    render(
      <MemoryRouter>
        <DrillsPage />
      </MemoryRouter>,
    );
    const threats = screen.getByRole('link', { name: /What’s the threat\?/ });
    expect(threats).toHaveAttribute('href', '/drills/threats');
    expect(threats).toHaveTextContent('Best 1');
    const blind = screen.getByRole('link', { name: /Blind puzzles/ });
    expect(blind).toHaveAttribute('href', '/puzzles/blind');
    expect(blind).not.toHaveTextContent('Best');
  });
});

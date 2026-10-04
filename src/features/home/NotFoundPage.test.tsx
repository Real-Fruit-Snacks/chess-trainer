import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import NotFoundPage from './NotFoundPage';

describe('NotFoundPage', () => {
  it('uses the shared not-found layout: an h1, a way home and a title', () => {
    render(
      <MemoryRouter initialEntries={['/nowhere']}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'That square is off the board' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'solve a puzzle instead' })).toHaveAttribute(
      'href',
      '/puzzles',
    );
    expect(document.title).toMatch(/^Page not found · /);
  });
});

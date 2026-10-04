import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Difficulty } from './Difficulty';

describe('Difficulty', () => {
  it('shows stars with a spoken level on the 3-point and the 4-point scale', () => {
    render(
      <>
        <Difficulty level={2} />
        <Difficulty level={4} max={4} />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Difficulty: Medium (2 of 3)' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Difficulty: Very hard (4 of 4)' })).toBeInTheDocument();
  });
});

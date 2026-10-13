import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import WhoStandsBetterPage from './WhoStandsBetterPage';

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

function renderPage() {
  render(
    <MemoryRouter>
      <WhoStandsBetterPage />
    </MemoryRouter>,
  );
}

describe('WhoStandsBetterPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('speaks the slider’s value and keeps the keyboard with the round', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('wsb-start'));
    const slider = screen.getByTestId('wsb-slider');
    // A new position: the keyboard is on the slider, which says what it means.
    expect(slider).toHaveFocus();
    expect(slider).toHaveAttribute('aria-valuetext', 'Equal');
    fireEvent.change(slider, { target: { value: '1.2' } });
    expect(slider).toHaveAttribute('aria-valuetext', 'White is better (1.2)');
    expect(screen.getByTestId('wsb-guess')).toHaveTextContent('White is better (1.2)');
    // The badge names the side to move of this very position.
    const toMove = screen.getByTestId('wsb-to-move').textContent ?? '';
    expect(toMove).toMatch(/^(White|Black) to move$/);
    // Lock in: the verdict, and the keyboard goes to "Next position" (Lock in has gone).
    fireEvent.click(screen.getByTestId('wsb-lock'));
    expect(screen.getByTestId('wsb-reveal')).toHaveTextContent(/points/);
    expect(screen.getByTestId('wsb-next')).toHaveFocus();
    fireEvent.click(screen.getByTestId('wsb-next'));
    expect(screen.getByTestId('wsb-progress')).toHaveTextContent('Position 2 of 10');
    expect(screen.getByTestId('wsb-slider')).toHaveFocus();
  });

  it('compares the round with the best from before it, not with itself', () => {
    useProgress.getState().recordArcade('who-stands-better', 10_000, 'an unbeatable round');
    renderPage();
    fireEvent.click(screen.getByTestId('wsb-start'));
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByTestId('wsb-lock'));
      fireEvent.click(screen.getByTestId('wsb-next'));
    }
    expect(screen.getByTestId('wsb-result')).toBeInTheDocument();
    expect(screen.getByTestId('wsb-best-line')).toHaveTextContent('Your best is 10000.');
    expect(screen.getByTestId('wsb-again')).toHaveFocus();
    expect(useProgress.getState().arcade['who-stands-better']?.plays).toBe(2);
  });

  it('calls a first round a first round', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('wsb-start'));
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByTestId('wsb-lock'));
      fireEvent.click(screen.getByTestId('wsb-next'));
    }
    expect(screen.getByTestId('wsb-best-line')).toHaveTextContent(/^Your first round: \d+ points/);
  });
});

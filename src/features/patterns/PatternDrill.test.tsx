import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { MATING_PATTERNS } from './matingPatterns';
import { PatternDrill } from './PatternDrill';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

describe('PatternDrill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useProgress.getState().resetAll();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves on with Enter once a pattern is over — not with a modifier, not from the board', () => {
    const patterns = MATING_PATTERNS.slice(0, 2);
    render(
      <MemoryRouter>
        <PatternDrill patterns={patterns} onExit={vi.fn()} />
      </MemoryRouter>,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByTestId('pattern-solution'));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('pattern-title')).toHaveTextContent(patterns[0]?.name ?? '');
    expect(screen.getByText('Pattern 1 of 2')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('application'), { key: 'Enter' });
    expect(screen.getByText('Pattern 1 of 2')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('Pattern 2 of 2')).toBeInTheDocument();
  });
});

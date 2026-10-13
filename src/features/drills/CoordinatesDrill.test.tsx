import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import CoordinatesDrill from './CoordinatesDrill';
import { parseTypedSquare } from './typedSquare';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

function renderDrill() {
  return render(
    <MemoryRouter>
      <CoordinatesDrill />
    </MemoryRouter>,
  );
}

const prompt = () => (screen.getByTestId('coordinates-prompt').textContent ?? '').trim();

describe('parseTypedSquare', () => {
  it('reads a square in either case, with stray spaces, and nothing else', () => {
    expect(parseTypedSquare('e4')).toBe('e4');
    expect(parseTypedSquare(' E4 ')).toBe('e4');
    expect(parseTypedSquare('h8')).toBe('h8');
    expect(parseTypedSquare('i1')).toBeNull();
    expect(parseTypedSquare('e9')).toBeNull();
    expect(parseTypedSquare('e')).toBeNull();
    expect(parseTypedSquare('Nf3')).toBeNull();
  });
});

describe('CoordinatesDrill', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('can be played from the keyboard: typed squares answer, the result is announced', () => {
    vi.useFakeTimers();
    renderDrill();
    const field = screen.getByLabelText('Or type the square');
    expect(field).toBeDisabled();
    // Enter on the Start button (a click with no pointer) puts the keyboard in the field.
    fireEvent.click(screen.getByRole('button', { name: /Start · 30 seconds/ }), { detail: 0 });
    expect(field).toBeEnabled();
    expect(document.activeElement).toBe(field);

    const target = prompt();
    expect(target).toMatch(/^[a-h][1-8]$/);
    fireEvent.change(field, { target: { value: target.toUpperCase() } });
    expect(screen.getByText('Correct').previousSibling).toHaveTextContent('1');
    expect(field).toHaveValue('');

    // A wrong square, answered with Enter.
    const next = prompt();
    const wrong = next === 'a1' ? 'h8' : 'a1';
    fireEvent.change(field, { target: { value: wrong[0] } });
    expect(field).toHaveValue(wrong[0]);
    fireEvent.change(field, { target: { value: wrong } });
    expect(screen.getByText('Mistakes').previousSibling).toHaveTextContent('1');

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.getByTestId('coordinates-result')).toHaveTextContent(
      'Time! 1 square, 1 mistake.',
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Again' }));
  });

  it('keeps the on-screen keyboard away when a run is started with a tap', () => {
    renderDrill();
    fireEvent.click(screen.getByRole('button', { name: /Start · 30 seconds/ }), { detail: 1 });
    expect(document.activeElement).not.toBe(screen.getByLabelText('Or type the square'));
  });
});

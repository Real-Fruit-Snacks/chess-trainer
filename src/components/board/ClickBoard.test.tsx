import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClickBoard } from './ClickBoard';
import { isDarkSquare } from './keyboard';

describe('ClickBoard', () => {
  it('paints a1 and h8 dark, h1 and a8 light', () => {
    expect(isDarkSquare('a1')).toBe(true);
    expect(isDarkSquare('h8')).toBe(true);
    expect(isDarkSquare('h1')).toBe(false);
    expect(isDarkSquare('a8')).toBe(false);
    expect(isDarkSquare('e4')).toBe(false);
    expect(isDarkSquare('d4')).toBe(true);
    render(<ClickBoard ariaLabel="Test board" />);
    expect(screen.getByRole('button', { name: 'a1, empty' })).toHaveClass(
      'clickboard__square--dark',
    );
    expect(screen.getByRole('button', { name: 'h1, empty' })).toHaveClass(
      'clickboard__square--light',
    );
    expect(screen.getByRole('button', { name: 'a8, empty' })).toHaveClass(
      'clickboard__square--light',
    );
  });

  it('is one group of plain buttons with a single tab stop, moved by the arrow keys', () => {
    const onSquare = vi.fn();
    render(<ClickBoard ariaLabel="Test board" onSquare={onSquare} />);
    const group = screen.getByRole('group', { name: 'Test board' });
    expect(screen.queryByRole('grid')).toBeNull();
    const buttons = group.querySelectorAll('button');
    expect(buttons).toHaveLength(64);
    const stops = Array.from(buttons).filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute('data-square', 'e4');

    stops[0]?.focus();
    fireEvent.keyDown(stops[0] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveAttribute('data-square', 'e5');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toHaveAttribute('data-square', 'd5');
    expect((document.activeElement as HTMLElement).tabIndex).toBe(0);
    expect(screen.getByRole('button', { name: 'e4, empty' }).tabIndex).toBe(-1);

    // A typed square jumps straight there; the letter never reaches the page.
    const pageHandler = vi.fn();
    document.body.addEventListener('keydown', pageHandler);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'h' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: '7' });
    expect(document.activeElement).toHaveAttribute('data-square', 'h7');
    expect(pageHandler).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', pageHandler);

    fireEvent.click(document.activeElement as HTMLElement);
    expect(onSquare).toHaveBeenCalledWith('h7');
  });

  it('flips the arrow keys with the orientation and marks the selected square as pressed', () => {
    render(
      <ClickBoard
        ariaLabel="Editor"
        orientation="black"
        marks={new Map([['d5', 'selected']])}
        pieces={new Map([['d5', { color: 'white', role: 'queen' }]])}
      />,
    );
    const selected = screen.getByRole('button', { name: 'd5, white queen' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected.tabIndex).toBe(0);
    selected.focus();
    fireEvent.keyDown(selected, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveAttribute('data-square', 'd4');
    expect(screen.getByRole('button', { name: 'a1, empty' })).not.toHaveAttribute('aria-pressed');
  });
});

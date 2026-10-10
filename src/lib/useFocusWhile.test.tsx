import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusWhile } from './useFocusWhile';

/** A board to move on, and the way on that shows while `active`. */
function Harness({ active, other = false }: { active: boolean; other?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useFocusWhile(ref, active);
  return (
    <>
      <div role="application" aria-label="Board" tabIndex={0} />
      {active ? <button ref={ref}>Continue</button> : null}
      {other ? <button>Elsewhere</button> : null}
    </>
  );
}

describe('useFocusWhile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives the element the focus without scrolling, then gives it back', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { rerender } = render(<Harness active={false} />);
    const board = screen.getByRole('application');
    board.focus();

    rerender(<Harness active />);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

    rerender(<Harness active={false} />);
    expect(board).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('leaves the focus alone when something else has taken it', () => {
    const { rerender } = render(<Harness active={false} other />);
    screen.getByRole('application').focus();
    rerender(<Harness active other />);
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    rerender(<Harness active={false} other />);
    expect(elsewhere).toHaveFocus();
  });

  it('gives nothing back when nothing had the focus', () => {
    const { rerender } = render(<Harness active={false} />);
    rerender(<Harness active />);
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
    rerender(<Harness active={false} />);
    expect(document.activeElement).toBe(document.body);
  });
});

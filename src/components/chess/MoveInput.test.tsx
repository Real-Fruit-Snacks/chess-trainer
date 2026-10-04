import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoveInput } from './MoveInput';

describe('MoveInput', () => {
  it('submits the typed move, clears on success and explains a refusal next to the input', () => {
    const onMove = vi.fn((n: string) => n === 'nf3');
    render(<MoveInput onMove={onMove} />);
    const input = screen.getByLabelText('Enter a move');
    expect(input.getAttribute('aria-describedby')).toMatch(/hint/);
    fireEvent.change(input, { target: { value: 'nf3' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onMove).toHaveBeenCalledWith('nf3');
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: 'Qh9' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('"Qh9" is not a legal move here.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('asks for the piece when a promotion is typed without one', () => {
    render(<MoveInput onMove={() => false} />);
    const input = screen.getByLabelText('Enter a move');
    for (const text of ['e8', 'e7e8', 'dxe1+']) {
      fireEvent.change(input, { target: { value: text } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);
      expect(screen.getByRole('alert')).toHaveTextContent(`promote to: ${text}=Q, =R, =B or =N.`);
    }
  });

  it('gives focus back when re-enabled with keepFocus', () => {
    const { rerender } = render(<MoveInput onMove={() => true} keepFocus />);
    const input = screen.getByLabelText('Enter a move');
    act(() => input.focus());
    expect(document.activeElement).toBe(input);
    rerender(<MoveInput onMove={() => true} keepFocus disabled />);
    // The browser drops focus from a disabled field (jsdom needs a push).
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    act(() => elsewhere.focus());
    expect(document.activeElement).toBe(elsewhere);
    rerender(<MoveInput onMove={() => true} keepFocus />);
    expect(document.activeElement).toBe(input);
    elsewhere.remove();
  });

  it('leaves focus alone without keepFocus or when the field was not in use', () => {
    const { rerender } = render(<MoveInput onMove={() => true} disabled />);
    const input = screen.getByLabelText('Enter a move');
    rerender(<MoveInput onMove={() => true} />);
    expect(document.activeElement).not.toBe(input);
    rerender(<MoveInput onMove={() => true} keepFocus disabled />);
    rerender(<MoveInput onMove={() => true} keepFocus />);
    expect(document.activeElement).not.toBe(input);
  });
});

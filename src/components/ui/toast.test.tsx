import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toasts } from './toast';
import { toast, useToasts } from './toastStore';

describe('Toasts', () => {
  beforeEach(() => {
    useToasts.setState({ toasts: [] });
  });

  it('keeps the live region in the document while empty, so the first toast is announced', () => {
    render(<Toasts />);
    const region = screen.getByTestId('toasts');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('shows the tone as a class and an icon, and danger as an alert', () => {
    render(<Toasts />);
    act(() => {
      toast('Saved', { tone: 'success', duration: 0 });
      toast('Could not save', { tone: 'danger', duration: 0 });
      toast('Plain', { duration: 0 });
    });
    const saved = screen.getByText('Saved').closest('.toast');
    expect(saved).toHaveClass('toast--success');
    expect(saved?.querySelector('.toast__icon .icon--check')).not.toBeNull();
    expect(saved).not.toHaveAttribute('role');
    const failed = screen.getByText('Could not save').closest('.toast');
    expect(failed).toHaveClass('toast--danger');
    expect(failed).toHaveAttribute('role', 'alert');
    const plain = screen.getByText('Plain').closest('.toast');
    expect(plain).toHaveClass('toast');
    expect(plain?.className).toBe('toast');
    expect(plain?.querySelector('.toast__icon')).toBeNull();
    // Each toast's dismiss control is an icon button with a name.
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(3);
  });

  it('refreshes a repeated message instead of stacking a copy', () => {
    vi.useFakeTimers();
    try {
      render(<Toasts />);
      act(() => {
        toast('Copied', { tone: 'success', duration: 1000 });
      });
      act(() => {
        vi.advanceTimersByTime(800);
      });
      act(() => {
        toast('Copied', { tone: 'success', duration: 1000 });
      });
      expect(useToasts.getState().toasts).toHaveLength(1);
      // The timer restarted with the repeat: still there after the first one's deadline.
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(useToasts.getState().toasts).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(useToasts.getState().toasts).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dismisses on the close button and runs the action', () => {
    const onAction = vi.fn();
    render(<Toasts />);
    act(() => {
      toast('Update ready', { actionLabel: 'Reload now', onAction, duration: 0 });
      toast('Other', { duration: 0 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reload now' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['Other']);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('moves into an open modal dialog so it stays reachable', async () => {
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    render(<Toasts />);
    expect(screen.getByTestId('toasts').closest('dialog')).toBeNull();
    dialog.setAttribute('open', '');
    await vi.waitFor(() => expect(screen.getByTestId('toasts').closest('dialog')).toBe(dialog));
    dialog.removeAttribute('open');
    await vi.waitFor(() => expect(screen.getByTestId('toasts').closest('dialog')).toBeNull());
    dialog.remove();
  });
});

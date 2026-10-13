import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromotionPicker } from './PromotionPicker';

describe('PromotionPicker', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is a modal dialog that takes focus, keeps keys from the page and gives focus back', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Board';
    document.body.appendChild(opener);
    opener.focus();
    const pageHandler = vi.fn();
    window.addEventListener('keydown', pageHandler);
    const onSelect = vi.fn();
    const { unmount } = render(<PromotionPicker color="white" onSelect={onSelect} />);
    const dialog = screen.getByRole('dialog', { name: 'Choose a piece to promote to' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const queen = screen.getByRole('button', { name: 'Queen' });
    expect(document.activeElement).toBe(queen);

    // N picks the knight (and in a simul must not switch boards).
    fireEvent.keyDown(queen, { key: 'n' });
    expect(onSelect).toHaveBeenCalledWith('n');
    fireEvent.keyDown(queen, { key: 'Escape' });
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(pageHandler).not.toHaveBeenCalled();

    // Tab wraps inside the dialog.
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(document.activeElement).toBe(queen);
    fireEvent.keyDown(queen, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancel);

    unmount();
    expect(document.activeElement).toBe(opener);
    window.removeEventListener('keydown', pageHandler);
  });

  it('chooses with a click and labels the keys', () => {
    const onSelect = vi.fn();
    render(<PromotionPicker color="black" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Rook' })).toHaveAttribute('aria-keyshortcuts', 'R');
    fireEvent.click(screen.getByRole('button', { name: 'Bishop' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});

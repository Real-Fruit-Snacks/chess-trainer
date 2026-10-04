/**
 * Whether a key press is the Simul's N (the next board waiting for a move):
 * never with Ctrl, Alt or Cmd held, never from a text field, never while a
 * dialog is open, and never while a promotion waits for its piece — N picks
 * the knight there, and switching boards would drop the move. Caps Lock and
 * Shift do not matter. N from the chess board itself does count: it types no
 * square, and a keyboard player moves on from the board.
 */
export function isNextBoardKey(event: KeyboardEvent, promotionPending: boolean): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key.toLowerCase() !== 'n') return false;
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  ) {
    return false;
  }
  if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return false;
  return !promotionPending;
}

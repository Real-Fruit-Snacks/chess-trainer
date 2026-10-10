/**
 * Scrolls `el` into view inside `container` and nowhere else. `scrollIntoView`
 * also scrolls every other scrollable ancestor, including the page itself —
 * on a phone, where the move list sits under the board, that dragged the board
 * off the screen after every move.
 */
export function scrollIntoContainer(container: HTMLElement, el: HTMLElement): void {
  const box = container.getBoundingClientRect();
  const top = box.top + container.clientTop;
  const bottom = top + container.clientHeight;
  const rect = el.getBoundingClientRect();
  if (rect.top < top) {
    container.scrollTop += rect.top - top;
  } else if (rect.bottom > bottom) {
    container.scrollTop += rect.bottom - bottom;
  }
}

/**
 * Scrolls the page back up to `el` when its top is out of sight — above the
 * screen, or under the sticky header — such as a board the page was scrolled
 * past on a phone, to read the words under it. At once, not smoothly: a tap
 * during a smooth scroll lands where the button was.
 */
export function scrollBackTo(el: HTMLElement | null): void {
  if (!el) return;
  const header = document.querySelector('.shell__header')?.getBoundingClientRect().bottom ?? 0;
  if (el.getBoundingClientRect().top < Math.max(0, header) - 1) {
    el.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  }
}

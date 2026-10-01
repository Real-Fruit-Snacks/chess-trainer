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

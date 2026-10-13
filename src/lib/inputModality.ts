/**
 * Which kind of input the person last used, kept on the root element as
 * `data-input="pointer"` or `data-input="keyboard"` for the stylesheet.
 *
 * The focus ring is there to find the focus with a keyboard. After a click or a
 * tap, the focus a page moves by itself (to the button that is the way on, into
 * a dialog, back to the board) would still draw one in Chromium, which rings
 * whatever a script focuses while nothing else has the focus: a ring round
 * "Continue" after every lesson move made with the mouse. global.css leaves the
 * ring out while the last input was a pointer, and the first key press brings
 * it back before the focus moves (the listeners run in the capture phase).
 */

type Modality = 'pointer' | 'keyboard';

/** Keys that never move the focus on their own, held for a shortcut or a click. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'AltGraph']);

let tracked = false;

export function trackInputModality(root: HTMLElement = document.documentElement): () => void {
  const set = (modality: Modality) => {
    if (root.dataset.input !== modality) root.dataset.input = modality;
  };
  const onPointer = () => set('pointer');
  const onKey = (event: KeyboardEvent) => {
    // A shortcut such as Ctrl+C after a click is not a move to the keyboard.
    if (MODIFIERS.has(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
    set('keyboard');
  };
  window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
  window.addEventListener('keydown', onKey, { capture: true, passive: true });
  return () => {
    window.removeEventListener('pointerdown', onPointer, { capture: true });
    window.removeEventListener('keydown', onKey, { capture: true });
    delete root.dataset.input;
  };
}

/** Starts tracking once for the page (idempotent). */
export function watchInputModality(): void {
  if (tracked || typeof window === 'undefined') return;
  tracked = true;
  trackInputModality();
}

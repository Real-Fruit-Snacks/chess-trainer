import { type RefObject, useEffect } from 'react';

/**
 * Gives the focus to `ref`'s element while `active` holds — the button that is
 * the way on, such as "Take back" or "Continue" — without scrolling to it.
 * (`autoFocus` scrolls: on a phone, where such a button sits under the board
 * and the coach's words, the page jumped down to it and took both out of
 * sight.) When `active` ends, the focus goes back to where it was before (the
 * board a move was just played on), unless something else has taken it.
 */
export function useFocusWhile(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const before = document.activeElement;
    el.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      // Moved on by the learner, or by the page (a new step focuses its question): leave it.
      if (now && now !== document.body && now !== el) return;
      if (before instanceof HTMLElement && before !== document.body && before.isConnected) {
        before.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
}

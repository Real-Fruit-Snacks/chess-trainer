import { type RefObject, useEffect, useRef } from 'react';
import { scrollBackTo } from '@/lib/scroll';

/**
 * When the setup gives way to the game, the focus goes to the board (or the move field under it),
 * and the page comes back up to it at once — on a phone it was scrolled down to Start.
 */
export function useFocusBoardAfterSetup(
  setupShown: boolean,
  boardRef: RefObject<HTMLElement | null>,
): void {
  const wasShown = useRef(setupShown);
  useEffect(() => {
    const was = wasShown.current;
    wasShown.current = setupShown;
    if (!was || setupShown) return;
    boardRef.current
      ?.querySelector<HTMLElement>('.moveinput input, [role="application"]')
      ?.focus({ preventScroll: true });
    scrollBackTo(boardRef.current);
  }, [setupShown, boardRef]);
}

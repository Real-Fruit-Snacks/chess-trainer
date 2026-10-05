import { useSyncExternalStore } from 'react';

/*
 * The trainer layout (global.css) puts the side panel under the board below
 * 900 px, except on phones held sideways, where board and panel sit side by
 * side because the height is the scarce dimension.
 */
const NARROW = '(max-width: 899.98px)';
const SIDEWAYS = '(orientation: landscape) and (max-height: 520px)';

function queries(): MediaQueryList[] {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return [];
  return [window.matchMedia(NARROW), window.matchMedia(SIDEWAYS)];
}

function subscribe(onChange: () => void): () => void {
  const lists = queries();
  for (const list of lists) {
    if (typeof list.addEventListener === 'function') list.addEventListener('change', onChange);
    else list.addListener(onChange);
  }
  return () => {
    for (const list of lists) {
      if (typeof list.removeEventListener === 'function') {
        list.removeEventListener('change', onChange);
      } else {
        list.removeListener(onChange);
      }
    }
  };
}

function stacked(): boolean {
  const [narrow, sideways] = queries();
  return !!narrow?.matches && !sideways?.matches;
}

/** Whether the side panel sits under the board (so its controls may be below the fold). */
export function useStackedLayout(): boolean {
  return useSyncExternalStore(subscribe, stacked, () => false);
}

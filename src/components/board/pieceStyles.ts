import type { PieceSet } from '@/store/settings';

/**
 * The stylesheet of every set but Classic (which is bundled with the app), fetched the first time
 * the set is shown: when it is chosen, or when a picker shows every set. Each is the set's twelve
 * pieces as inline SVG (scripts/generate-pieces.mjs), so one fetch brings the whole set, and the
 * service worker keeps it for offline use.
 */
export const PIECE_STYLES: Readonly<Record<Exclude<PieceSet, 'classic'>, () => Promise<unknown>>> =
  {
    merida: () => import('./pieces/merida.css'),
    chessnut: () => import('./pieces/chessnut.css'),
    mpchess: () => import('./pieces/mpchess.css'),
    celtic: () => import('./pieces/celtic.css'),
    california: () => import('./pieces/california.css'),
    maestro: () => import('./pieces/maestro.css'),
    staunty: () => import('./pieces/staunty.css'),
    cardinal: () => import('./pieces/cardinal.css'),
  };

const loading = new Map<PieceSet, Promise<void>>();

/**
 * Loads a set's stylesheet once. A failed load (offline before the set was ever fetched) is
 * forgotten, so the next attempt tries again; meanwhile the board shows the Classic pieces.
 */
export function loadPieceSet(set: PieceSet): Promise<void> {
  if (set === 'classic' || !(set in PIECE_STYLES)) return Promise.resolve();
  let promise = loading.get(set);
  if (!promise) {
    promise = PIECE_STYLES[set]().then(
      () => undefined,
      () => {
        loading.delete(set);
      },
    );
    loading.set(set, promise);
  }
  return promise;
}

/** Waits for the browser to be idle (or a moment, where it cannot say). */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 200 });
    } else {
      setTimeout(resolve, 50);
    }
  });
}

/**
 * Loads every set, for a picker that shows them all side by side: one at a time, each when the
 * browser is idle, so drawing the sets' pieces never holds up scrolling or a tap for long.
 */
export async function loadAllPieceSets(): Promise<void> {
  for (const set of Object.keys(PIECE_STYLES) as PieceSet[]) {
    await idle();
    await loadPieceSet(set);
  }
}

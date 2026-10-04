/**
 * The first tap or key press. Browsers block audio and vibration until the
 * page has been tapped or a key pressed, and log a warning for every attempt
 * before that. The app follows the same rule itself: no cue and no buzz until
 * the first gesture, so a puzzle's setup move at load plays nothing.
 *
 * Kept apart from the sound engine so the start-up code can watch for the
 * gesture without loading the synthesiser.
 */
let gestureSeen = false;
let gestureWatched = false;

export function hasUserGesture(): boolean {
  return gestureSeen;
}

export function markUserGesture(): void {
  gestureSeen = true;
}

/** Forgets the gesture (tests). */
export function resetUserGesture(): void {
  gestureSeen = false;
}

/** Starts listening for the first gesture (idempotent). */
export function watchUserGesture(): void {
  if (gestureWatched || typeof window === 'undefined') return;
  gestureWatched = true;
  const seen = () => markUserGesture();
  for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(type, seen, { once: true, passive: true, capture: true });
  }
}

import { markUserGesture, watchUserGesture } from './userGesture';

/**
 * Starts listening for the first gesture and, once it comes, loads the sound
 * engine and starts its audio context so the first cue plays without a delay.
 * The synthesiser itself stays out of the start-up code: it is only fetched
 * after a tap or a key press, and only when sounds are on.
 */
export function warmUpAudioLater(soundsOn: () => boolean): void {
  if (typeof window === 'undefined') return;
  watchUserGesture();
  const warm = () => {
    markUserGesture();
    if (!soundsOn()) return;
    void import('./sound').then((sound) => sound.primeAudio()).catch(() => undefined);
  };
  window.addEventListener('pointerdown', warm, { once: true, passive: true });
  window.addEventListener('keydown', warm, { once: true, passive: true });
}

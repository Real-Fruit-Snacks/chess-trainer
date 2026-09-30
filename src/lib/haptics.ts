import { useSettings } from '@/store/settings';
import type { SoundName } from './sound';

/**
 * Haptic feedback through the Vibration API: short buzzes on moves, solves and
 * mistakes on phones that support it. Off on devices without a vibration motor
 * (the call is simply ignored) and switchable in settings.
 */
export const HAPTIC_PATTERNS: Record<SoundName, number | number[]> = {
  move: 8,
  capture: 18,
  castle: [8, 30, 8],
  check: [14, 40, 14],
  promote: [12, 30, 12, 30, 20],
  solved: [16, 40, 16, 40, 40],
  failed: 70,
  gameEnd: [30, 50, 30, 50, 80],
  lowTime: 12,
  notify: 20,
};

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Vibrates for a named cue if haptics are enabled. Never throws. */
export function vibrate(name: SoundName): void {
  if (!useSettings.getState().haptics || !hapticsSupported()) return;
  try {
    navigator.vibrate(HAPTIC_PATTERNS[name]);
  } catch {
    // Some browsers throw when vibration is blocked; feedback is best-effort.
  }
}

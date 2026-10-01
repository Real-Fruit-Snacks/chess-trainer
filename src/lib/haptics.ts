import { type SoundTheme, useSettings } from '@/store/settings';
import type { SoundName } from './sound';

/**
 * Haptic feedback through the Vibration API: short buzzes on moves, solves and
 * mistakes on phones that support it. Off on devices without a vibration motor
 * (the call is simply ignored) and switchable in settings. Each sound theme
 * has its own patterns, so what is felt matches what is heard.
 */
export type HapticPattern = number | number[];

/** The standard patterns, shared by the soft theme: one pulse per beat of the cue. */
export const HAPTIC_PATTERNS: Record<SoundName, HapticPattern> = {
  move: 8,
  capture: [10, 20, 45],
  castle: [8, 30, 8],
  check: [14, 40, 14],
  promote: [12, 30, 12, 30, 20],
  solved: [16, 40, 16, 40, 40],
  failed: 70,
  gameEnd: [30, 50, 30, 50, 80],
  gameLost: [60, 60, 140],
  lowTime: 12,
  notify: 20,
};

/** Retro patterns: shorter and buzzier, rapid bursts like an arcade cabinet's rumble. */
export const RETRO_HAPTIC_PATTERNS: Record<SoundName, HapticPattern> = {
  move: 5,
  capture: [8, 12, 8, 12, 8, 12, 30],
  castle: [5, 20, 5],
  check: [8, 15, 8, 15, 8],
  promote: [6, 14, 6, 14, 6, 14, 6, 14, 12],
  solved: [6, 16, 6, 16, 6, 16, 24],
  failed: [12, 18, 12, 18, 12, 18, 40],
  gameEnd: [10, 20, 10, 20, 10, 20, 40],
  gameLost: [25, 25, 25, 25, 25, 25, 90],
  lowTime: [6, 14, 6],
  notify: [8, 20, 8],
};

/** The vibration pattern for a cue in a theme (the soft theme feels like the standard one). */
export function hapticPattern(name: SoundName, theme: SoundTheme): HapticPattern {
  return theme === 'retro' ? RETRO_HAPTIC_PATTERNS[name] : HAPTIC_PATTERNS[name];
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Vibrates for a named cue in the current theme if haptics are enabled. Never throws. */
export function vibrate(name: SoundName): void {
  const { haptics, soundTheme } = useSettings.getState();
  if (!haptics || !hapticsSupported()) return;
  try {
    navigator.vibrate(hapticPattern(name, soundTheme));
  } catch {
    // Some browsers throw when vibration is blocked; feedback is best-effort.
  }
}

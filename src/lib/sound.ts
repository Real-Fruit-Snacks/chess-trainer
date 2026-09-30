import type { Chess, Move } from 'chess.js';
import { useSettings } from '@/store/settings';
import { vibrate } from './haptics';

/**
 * Tiny synthesized sound effects via the Web Audio API — no audio files, no
 * licensing questions, and nothing to precache. Every sound is a few short
 * oscillator envelopes, kept quiet and brief so they never become annoying.
 */
export type SoundName =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promote'
  | 'solved'
  | 'failed'
  | 'gameEnd'
  | 'lowTime'
  | 'notify';

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
}

export interface Tone {
  frequency: number;
  /** Seconds after the trigger. */
  at?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Frequency to glide to by the end of the tone. */
  glideTo?: number;
}

/**
 * The "soft" theme plays the same cues at half the volume with pure sine
 * tones and a slower attack, which rounds off the clicks and buzzes.
 */
export function softenTone(tone: Tone): Tone {
  return {
    ...tone,
    type: 'sine',
    frequency: tone.frequency * 0.75,
    glideTo: tone.glideTo && tone.glideTo * 0.75,
  };
}

function play(tones: Tone[], master = 0.16): void {
  const ctx = getContext();
  if (!ctx) return;
  const soft = useSettings.getState().soundTheme === 'soft';
  const volume = soft ? master * 0.5 : master;
  const attack = soft ? 0.02 : 0.006;
  const now = ctx.currentTime;
  for (const raw of tones) {
    const tone = soft ? softenTone(raw) : raw;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + (tone.at ?? 0);
    const end = start + tone.duration;
    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.frequency, start);
    if (tone.glideTo) osc.frequency.exponentialRampToValueAtTime(tone.glideTo, end);
    const peak = volume * (tone.gain ?? 1);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

const SOUNDS: Record<SoundName, () => void> = {
  move: () =>
    play([
      { frequency: 520, duration: 0.05, type: 'triangle', glideTo: 260, gain: 0.9 },
      { frequency: 1600, duration: 0.02, type: 'sine', gain: 0.35 },
    ]),
  capture: () =>
    play([
      { frequency: 300, duration: 0.09, type: 'square', glideTo: 110, gain: 0.7 },
      { frequency: 900, duration: 0.03, type: 'triangle', gain: 0.5 },
    ]),
  castle: () =>
    play([
      { frequency: 520, duration: 0.05, type: 'triangle', glideTo: 260 },
      { frequency: 520, duration: 0.05, type: 'triangle', glideTo: 260, at: 0.09 },
    ]),
  check: () =>
    play([
      { frequency: 880, duration: 0.08, type: 'sine' },
      { frequency: 1175, duration: 0.1, type: 'sine', at: 0.09 },
    ]),
  promote: () =>
    play([
      { frequency: 523, duration: 0.08, at: 0 },
      { frequency: 659, duration: 0.08, at: 0.08 },
      { frequency: 784, duration: 0.12, at: 0.16 },
    ]),
  solved: () =>
    play([
      { frequency: 523, duration: 0.09, at: 0 },
      { frequency: 659, duration: 0.09, at: 0.09 },
      { frequency: 784, duration: 0.09, at: 0.18 },
      { frequency: 1047, duration: 0.18, at: 0.27 },
    ]),
  failed: () =>
    play([
      { frequency: 330, duration: 0.14, type: 'triangle', glideTo: 250 },
      { frequency: 220, duration: 0.2, type: 'triangle', glideTo: 170, at: 0.13 },
    ]),
  gameEnd: () =>
    play([
      { frequency: 392, duration: 0.25, at: 0, gain: 0.8 },
      { frequency: 494, duration: 0.25, at: 0, gain: 0.8 },
      { frequency: 587, duration: 0.35, at: 0.05, gain: 0.8 },
    ]),
  lowTime: () => play([{ frequency: 1000, duration: 0.06, type: 'sine', gain: 0.6 }]),
  notify: () =>
    play([
      { frequency: 740, duration: 0.07 },
      { frequency: 988, duration: 0.09, at: 0.08 },
    ]),
};

/**
 * Plays a named sound if sounds are enabled in settings, and gives the matching
 * haptic cue if haptics are. Never throws.
 */
export function playSound(name: SoundName): void {
  vibrate(name);
  if (!useSettings.getState().sounds) return;
  try {
    SOUNDS[name]();
  } catch {
    // Audio is best-effort; ignore autoplay/permission failures.
  }
}

/** Picks the right sound for a move that has just been played on `chess`. */
export function soundForMove(move: Move, chess: Chess): SoundName {
  if (chess.inCheck()) return 'check';
  if (move.promotion) return 'promote';
  if (move.captured) return 'capture';
  if (move.flags.includes('k') || move.flags.includes('q')) return 'castle';
  return 'move';
}

export function playMoveSound(move: Move, chess: Chess): void {
  playSound(soundForMove(move, chess));
}

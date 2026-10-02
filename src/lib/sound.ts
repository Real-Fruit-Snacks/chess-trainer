import type { Chess, Move } from 'chess.js';
import { type SoundTheme, useSettings } from '@/store/settings';
import { vibrate } from './haptics';

/**
 * Tiny synthesized sound effects via the Web Audio API — no audio files, no
 * licensing questions, and nothing to precache. Every sound is a few short
 * oscillator envelopes and bursts of filtered noise, kept brief so they never
 * become annoying. Three themes share the engine: the standard set, the same
 * set softened, and an 8-bit set.
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
  | 'gameLost'
  | 'lowTime'
  | 'notify';

/** Every cue, in the order the test lab lists them. */
export const SOUND_NAMES: readonly SoundName[] = [
  'move',
  'capture',
  'check',
  'castle',
  'promote',
  'solved',
  'failed',
  'gameEnd',
  'gameLost',
  'lowTime',
  'notify',
];

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    context = new Ctor();
    // A compressor needs about 40 ms to settle after it is created; keep one
    // ready so the first hit is never the one played through a cold chain.
    spare = makePunchChain(context);
  }
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

/** A burst of filtered white noise: the crack and debris of an impact. */
export interface Noise {
  noise: true;
  at?: number;
  duration: number;
  gain?: number;
  filter?: { type: BiquadFilterType; frequency: number; q?: number };
}

export type Layer = Tone | Noise;

export function isNoise(layer: Layer): layer is Noise {
  return 'noise' in layer;
}

/** One cue: its layers and the two numbers that set how it sits in the mix. */
export interface Cue {
  layers: Layer[];
  /** How hard the layers are driven into the punch chain, 0–1: more means denser. */
  master: number;
  /** The output level after the chain, 0–1 — what actually sets how loud a cue is. */
  level: number;
}

/**
 * The "soft" theme plays the standard cues at half the drive with pure sine
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

/**
 * The volume slider is perceptual: the gain is the square of the setting, so
 * half way sounds about half as loud (−12 dB) rather than barely quieter.
 */
export function volumeGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}

let noiseBuffer: AudioBuffer | null = null;

/** One second of white noise, made once per context and sliced by each burst. */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer?.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** A gentle tanh curve: louder layers fold into each other instead of clipping hard. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6);
  }
  return curve;
}

interface PunchChain {
  input: AudioNode;
  trim: GainNode;
}

let spare: PunchChain | null = null;

/** Compressor, then soft clipper, then a trim: the layers of a cue meet at the input. */
function makePunchChain(ctx: AudioContext): PunchChain {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve();
  shaper.oversample = '2x';
  const trim = ctx.createGain();
  compressor.connect(shaper).connect(trim).connect(ctx.destination);
  return { input: compressor, trim };
}

/**
 * Where the layers of one sound meet: a trim at the given level, reached
 * either directly or through a punch chain. Each punched cue takes the chain
 * that has been warming up and leaves a fresh one for the next.
 */
function outputFor(ctx: AudioContext, punch: boolean, level: number): AudioNode {
  if (!punch) {
    const trim = ctx.createGain();
    trim.gain.value = level;
    trim.connect(ctx.destination);
    return trim;
  }
  const chain = spare ?? makePunchChain(ctx);
  spare = makePunchChain(ctx);
  chain.trim.gain.value = level;
  return chain.input;
}

/** Plays one cue in a theme at a volume (0–1). The soft theme skips the punch chain. */
function play(cue: Cue, theme: SoundTheme, volume: number): void {
  const gain = volumeGain(volume);
  if (gain <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  const soft = theme === 'soft';
  const drive = soft ? cue.master * 0.5 : cue.master;
  // Chip sounds switch on instantly; the standard set has a hair of attack,
  // the soft set a slow one.
  const attack = soft ? 0.02 : theme === 'retro' ? 0.002 : 0.006;
  const now = ctx.currentTime;
  const out = outputFor(ctx, !soft, cue.level * gain);
  for (const layer of cue.layers) {
    const start = now + (layer.at ?? 0);
    const end = start + layer.duration;
    const envelope = ctx.createGain();
    const peak = drive * (layer.gain ?? 1);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + (isNoise(layer) ? 0.002 : attack));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    if (isNoise(layer)) {
      const source = ctx.createBufferSource();
      source.buffer = getNoiseBuffer(ctx);
      let head: AudioNode = source;
      if (layer.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = layer.filter.type;
        // The soft theme keeps noise dull: everything an octave lower.
        filter.frequency.value = soft ? layer.filter.frequency / 2 : layer.filter.frequency;
        filter.Q.value = layer.filter.q ?? 1;
        head = source.connect(filter);
      }
      head.connect(envelope).connect(out);
      source.start(start, 0, layer.duration + 0.02);
      continue;
    }
    const tone = soft ? softenTone(layer) : layer;
    const osc = ctx.createOscillator();
    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.frequency, start);
    if (tone.glideTo) osc.frequency.exponentialRampToValueAtTime(tone.glideTo, end);
    osc.connect(envelope).connect(out);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/**
 * The standard set. One family for the board — wooden "thocks" for moves,
 * the hit for a capture — and one for events, with the same ingredients:
 * a tonal body, a sub layer for weight, filtered noise for the transient and
 * the punch chain to make it land. Levels are matched so the capture stays
 * the biggest sound in the set. The soft theme plays these cues too, rounded
 * off as they play. Exported so the lab and the tests can render them offline.
 */
export const STANDARD_CUES: Record<SoundName, Cue> = {
  // A piece set down on the board: a short wooden thock with a tap on top.
  move: {
    layers: [
      { frequency: 420, duration: 0.07, type: 'sine', glideTo: 170, gain: 1 },
      {
        noise: true,
        duration: 0.02,
        gain: 0.5,
        filter: { type: 'bandpass', frequency: 1800, q: 1.2 },
      },
      { frequency: 2400, duration: 0.012, type: 'triangle', gain: 0.15 },
    ],
    master: 0.42,
    level: 0.55,
  },
  // The king, then the heavier rook.
  castle: {
    layers: [
      { frequency: 420, duration: 0.07, type: 'sine', glideTo: 170, gain: 1 },
      {
        noise: true,
        duration: 0.02,
        gain: 0.5,
        filter: { type: 'bandpass', frequency: 1800, q: 1.2 },
      },
      { frequency: 360, duration: 0.09, type: 'sine', glideTo: 140, gain: 0.7, at: 0.11 },
      {
        noise: true,
        duration: 0.025,
        gain: 0.45,
        at: 0.11,
        filter: { type: 'bandpass', frequency: 1400, q: 1 },
      },
    ],
    master: 0.42,
    level: 0.55,
  },
  // A capture lands like a hit marker: a kick-drum thump with a fast pitch
  // drop, a sub layer for weight, a crack of noise, a crunch, debris and the
  // bright tick on top — all squeezed into one impact.
  capture: {
    layers: [
      { frequency: 210, duration: 0.22, type: 'sine', glideTo: 40, gain: 1 },
      { frequency: 68, duration: 0.28, type: 'sine', glideTo: 44, gain: 0.9, at: 0.004 },
      {
        noise: true,
        duration: 0.05,
        gain: 1,
        filter: { type: 'bandpass', frequency: 2400, q: 0.6 },
      },
      {
        noise: true,
        duration: 0.08,
        gain: 0.7,
        filter: { type: 'bandpass', frequency: 750, q: 0.8 },
      },
      { noise: true, duration: 0.16, gain: 0.6, filter: { type: 'lowpass', frequency: 380 } },
      { frequency: 1850, duration: 0.035, type: 'square', gain: 0.25 },
      { frequency: 2700, duration: 0.02, type: 'triangle', gain: 0.2, at: 0.002 },
    ],
    master: 0.8,
    level: 1,
  },
  // An alarm: two sharp notes with a crack on each and a shimmer above.
  check: {
    layers: [
      { frequency: 880, duration: 0.08, type: 'square', gain: 0.5 },
      { frequency: 1760, duration: 0.08, type: 'sine', gain: 0.2 },
      {
        noise: true,
        duration: 0.015,
        gain: 0.4,
        filter: { type: 'bandpass', frequency: 3000, q: 1 },
      },
      { frequency: 1175, duration: 0.12, type: 'square', gain: 0.5, at: 0.1 },
      { frequency: 2350, duration: 0.12, type: 'sine', gain: 0.2, at: 0.1 },
      {
        noise: true,
        duration: 0.015,
        gain: 0.4,
        at: 0.1,
        filter: { type: 'bandpass', frequency: 3500, q: 1 },
      },
    ],
    master: 0.5,
    level: 0.7,
  },
  // A short fanfare up the chord, with sparkle.
  promote: {
    layers: [
      { frequency: 523, duration: 0.14, type: 'triangle', gain: 0.8 },
      { frequency: 1046, duration: 0.14, type: 'sine', gain: 0.3 },
      { frequency: 659, duration: 0.14, type: 'triangle', gain: 0.8, at: 0.07 },
      { frequency: 1318, duration: 0.14, type: 'sine', gain: 0.3, at: 0.07 },
      { frequency: 784, duration: 0.16, type: 'triangle', gain: 0.8, at: 0.14 },
      { frequency: 1568, duration: 0.16, type: 'sine', gain: 0.3, at: 0.14 },
      { frequency: 1047, duration: 0.3, type: 'triangle', gain: 0.9, at: 0.21 },
      { frequency: 2093, duration: 0.3, type: 'sine', gain: 0.35, at: 0.21 },
      {
        noise: true,
        duration: 0.18,
        gain: 0.22,
        at: 0.2,
        filter: { type: 'highpass', frequency: 6000 },
      },
    ],
    master: 0.5,
    level: 0.65,
  },
  // A chime: the major chord struck in quick succession, ringing out.
  solved: {
    layers: [
      {
        noise: true,
        duration: 0.02,
        gain: 0.35,
        filter: { type: 'bandpass', frequency: 5000, q: 1 },
      },
      { frequency: 1047, duration: 0.32, type: 'sine', gain: 0.8 },
      { frequency: 1319, duration: 0.32, type: 'sine', gain: 0.7, at: 0.04 },
      { frequency: 1568, duration: 0.36, type: 'sine', gain: 0.7, at: 0.08 },
      { frequency: 2093, duration: 0.42, type: 'sine', gain: 0.5, at: 0.12 },
      { frequency: 523, duration: 0.3, type: 'triangle', gain: 0.35, at: 0.12 },
    ],
    master: 0.5,
    level: 0.6,
  },
  // A heavy thud, then the two-note slide down.
  failed: {
    layers: [
      { frequency: 150, duration: 0.18, type: 'sine', glideTo: 50, gain: 1 },
      { noise: true, duration: 0.12, gain: 0.8, filter: { type: 'lowpass', frequency: 250 } },
      { frequency: 330, duration: 0.16, type: 'triangle', glideTo: 250, gain: 0.6, at: 0.02 },
      { frequency: 220, duration: 0.26, type: 'triangle', glideTo: 160, gain: 0.6, at: 0.17 },
    ],
    master: 0.55,
    level: 0.75,
  },
  // The big one: an impact under a major chord that swells and rings.
  gameEnd: {
    layers: [
      { frequency: 160, duration: 0.2, type: 'sine', glideTo: 45, gain: 1 },
      {
        noise: true,
        duration: 0.04,
        gain: 0.8,
        filter: { type: 'bandpass', frequency: 2000, q: 0.7 },
      },
      { noise: true, duration: 0.14, gain: 0.5, filter: { type: 'lowpass', frequency: 300 } },
      { frequency: 392, duration: 0.5, type: 'triangle', gain: 0.6, at: 0.05 },
      { frequency: 494, duration: 0.5, type: 'triangle', gain: 0.6, at: 0.05 },
      { frequency: 587, duration: 0.6, type: 'triangle', gain: 0.6, at: 0.1 },
      { frequency: 784, duration: 0.6, type: 'sine', gain: 0.4, at: 0.1 },
    ],
    master: 0.65,
    level: 0.9,
  },
  // The same impact under a minor chord that sinks a semitone as it fades.
  gameLost: {
    layers: [
      { frequency: 150, duration: 0.22, type: 'sine', glideTo: 40, gain: 1 },
      {
        noise: true,
        duration: 0.04,
        gain: 0.7,
        filter: { type: 'bandpass', frequency: 1600, q: 0.7 },
      },
      { noise: true, duration: 0.16, gain: 0.5, filter: { type: 'lowpass', frequency: 260 } },
      { frequency: 220, duration: 0.6, type: 'triangle', glideTo: 208, gain: 0.6, at: 0.05 },
      { frequency: 262, duration: 0.6, type: 'triangle', glideTo: 247, gain: 0.6, at: 0.05 },
      { frequency: 330, duration: 0.7, type: 'triangle', glideTo: 311, gain: 0.6, at: 0.1 },
      { frequency: 440, duration: 0.7, type: 'sine', glideTo: 415, gain: 0.35, at: 0.1 },
    ],
    master: 0.65,
    level: 0.9,
  },
  // A tick with a bit of weight, so it is felt as well as heard.
  lowTime: {
    layers: [
      { frequency: 1000, duration: 0.04, type: 'sine', gain: 0.7 },
      {
        noise: true,
        duration: 0.01,
        gain: 0.5,
        filter: { type: 'bandpass', frequency: 4000, q: 1 },
      },
      { frequency: 200, duration: 0.03, type: 'sine', glideTo: 120, gain: 0.5 },
    ],
    master: 0.4,
    level: 0.65,
  },
  // A two-note ping with air on top.
  notify: {
    layers: [
      { frequency: 740, duration: 0.08, type: 'triangle', gain: 0.8 },
      { frequency: 1480, duration: 0.08, type: 'sine', gain: 0.25 },
      { frequency: 988, duration: 0.12, type: 'triangle', gain: 0.8, at: 0.08 },
      { frequency: 1976, duration: 0.12, type: 'sine', gain: 0.25, at: 0.08 },
      { noise: true, duration: 0.06, gain: 0.15, filter: { type: 'highpass', frequency: 7000 } },
    ],
    master: 0.42,
    level: 0.6,
  },
};

/**
 * The retro set: an 8-bit console's sound chip. Square waves for the melody
 * with triangles an octave below for body, the noise channel for the
 * explosion, instant attacks and stepped little tunes — levels matched to the
 * standard set so switching themes does not change how loud the app is.
 */
export const RETRO_CUES: Record<SoundName, Cue> = {
  // A menu blip.
  move: {
    layers: [
      { frequency: 1046, duration: 0.045, type: 'square', gain: 0.55 },
      { frequency: 523, duration: 0.045, type: 'triangle', gain: 0.45 },
    ],
    master: 0.42,
    level: 0.55,
  },
  // Two blips, the second a step up: the king, then the rook.
  castle: {
    layers: [
      { frequency: 784, duration: 0.045, type: 'square', gain: 0.55 },
      { frequency: 392, duration: 0.045, type: 'triangle', gain: 0.45 },
      { frequency: 1046, duration: 0.05, type: 'square', gain: 0.55, at: 0.07 },
      { frequency: 523, duration: 0.05, type: 'triangle', gain: 0.45, at: 0.07 },
    ],
    master: 0.42,
    level: 0.55,
  },
  // An explosion: a pitch drop on the square channel, a sub sweep, and the
  // noise channel for the crack and the rumble.
  capture: {
    layers: [
      { frequency: 320, duration: 0.2, type: 'square', glideTo: 40, gain: 0.8 },
      { frequency: 110, duration: 0.3, type: 'triangle', glideTo: 30, gain: 0.9, at: 0.004 },
      {
        noise: true,
        duration: 0.06,
        gain: 1,
        filter: { type: 'bandpass', frequency: 1800, q: 0.5 },
      },
      { noise: true, duration: 0.28, gain: 0.8, filter: { type: 'lowpass', frequency: 900 } },
      { frequency: 2000, duration: 0.03, type: 'square', gain: 0.3 },
    ],
    master: 0.8,
    level: 1,
  },
  // A siren pair: two falling slides.
  check: {
    layers: [
      { frequency: 1320, duration: 0.09, type: 'square', glideTo: 880, gain: 0.55 },
      { frequency: 660, duration: 0.09, type: 'triangle', glideTo: 440, gain: 0.35 },
      { frequency: 1320, duration: 0.11, type: 'square', glideTo: 880, gain: 0.55, at: 0.11 },
      { frequency: 660, duration: 0.11, type: 'triangle', glideTo: 440, gain: 0.35, at: 0.11 },
    ],
    master: 0.5,
    level: 0.7,
  },
  // A power-up: the major arpeggio run up two octaves, the top note held.
  promote: {
    layers: [
      { frequency: 523, duration: 0.045, type: 'square', gain: 0.6 },
      { frequency: 659, duration: 0.045, type: 'square', gain: 0.6, at: 0.045 },
      { frequency: 784, duration: 0.045, type: 'square', gain: 0.6, at: 0.09 },
      { frequency: 1046, duration: 0.045, type: 'square', gain: 0.6, at: 0.135 },
      { frequency: 1318, duration: 0.045, type: 'square', gain: 0.6, at: 0.18 },
      { frequency: 1568, duration: 0.045, type: 'square', gain: 0.6, at: 0.225 },
      { frequency: 2093, duration: 0.24, type: 'square', gain: 0.6, at: 0.27 },
      { frequency: 1046, duration: 0.24, type: 'triangle', gain: 0.45, at: 0.27 },
    ],
    master: 0.5,
    level: 0.65,
  },
  // A coin — two rising notes — then a little rising flourish.
  solved: {
    layers: [
      { frequency: 1046, duration: 0.06, type: 'square', gain: 0.6 },
      { frequency: 1568, duration: 0.22, type: 'square', gain: 0.6, at: 0.06 },
      { frequency: 1318, duration: 0.05, type: 'square', gain: 0.55, at: 0.3 },
      { frequency: 1568, duration: 0.05, type: 'square', gain: 0.55, at: 0.35 },
      { frequency: 2093, duration: 0.05, type: 'square', gain: 0.55, at: 0.4 },
      { frequency: 2637, duration: 0.25, type: 'square', gain: 0.55, at: 0.45 },
      { frequency: 1318, duration: 0.25, type: 'triangle', gain: 0.4, at: 0.45 },
    ],
    master: 0.5,
    level: 0.6,
  },
  // Losing a life: four steps down, then the buzz.
  failed: {
    layers: [
      { frequency: 659, duration: 0.07, type: 'square', gain: 0.55 },
      { frequency: 330, duration: 0.07, type: 'triangle', gain: 0.4 },
      { frequency: 587, duration: 0.07, type: 'square', gain: 0.55, at: 0.07 },
      { frequency: 294, duration: 0.07, type: 'triangle', gain: 0.4, at: 0.07 },
      { frequency: 523, duration: 0.07, type: 'square', gain: 0.55, at: 0.14 },
      { frequency: 262, duration: 0.07, type: 'triangle', gain: 0.4, at: 0.14 },
      { frequency: 440, duration: 0.07, type: 'square', gain: 0.55, at: 0.21 },
      { frequency: 220, duration: 0.07, type: 'triangle', gain: 0.4, at: 0.21 },
      { frequency: 110, duration: 0.26, type: 'square', glideTo: 55, gain: 0.6, at: 0.28 },
    ],
    master: 0.55,
    level: 0.75,
  },
  // Game over, won: a four-note cadence up the major chord, the last note held
  // over the chord and a bass.
  gameEnd: {
    layers: [
      { frequency: 784, duration: 0.09, type: 'square', gain: 0.55 },
      { frequency: 1046, duration: 0.09, type: 'square', gain: 0.55, at: 0.09 },
      { frequency: 1318, duration: 0.09, type: 'square', gain: 0.55, at: 0.18 },
      { frequency: 1568, duration: 0.42, type: 'square', gain: 0.55, at: 0.27 },
      { frequency: 1046, duration: 0.42, type: 'triangle', gain: 0.45, at: 0.27 },
      { frequency: 1318, duration: 0.42, type: 'triangle', gain: 0.45, at: 0.27 },
      { frequency: 262, duration: 0.42, type: 'triangle', gain: 0.5, at: 0.27 },
    ],
    master: 0.6,
    level: 0.9,
  },
  // Game over, lost: the four notes fall instead, into the minor chord, and
  // the bass sags.
  gameLost: {
    layers: [
      { frequency: 622, duration: 0.1, type: 'square', gain: 0.55 },
      { frequency: 587, duration: 0.1, type: 'square', gain: 0.55, at: 0.1 },
      { frequency: 523, duration: 0.1, type: 'square', gain: 0.55, at: 0.2 },
      { frequency: 392, duration: 0.45, type: 'square', gain: 0.55, at: 0.3 },
      { frequency: 523, duration: 0.45, type: 'triangle', gain: 0.45, at: 0.3 },
      { frequency: 622, duration: 0.45, type: 'triangle', gain: 0.45, at: 0.3 },
      { frequency: 131, duration: 0.45, type: 'triangle', glideTo: 117, gain: 0.5, at: 0.3 },
    ],
    master: 0.6,
    level: 0.9,
  },
  // A hurry-up tick: two blips, the second higher.
  lowTime: {
    layers: [
      { frequency: 1400, duration: 0.025, type: 'square', gain: 0.6 },
      { frequency: 1900, duration: 0.025, type: 'square', gain: 0.6, at: 0.04 },
    ],
    master: 0.4,
    level: 0.65,
  },
  // A two-note question, rising.
  notify: {
    layers: [
      { frequency: 880, duration: 0.07, type: 'square', gain: 0.55 },
      { frequency: 440, duration: 0.07, type: 'triangle', gain: 0.35 },
      { frequency: 1175, duration: 0.12, type: 'square', gain: 0.55, at: 0.09 },
      { frequency: 587, duration: 0.12, type: 'triangle', gain: 0.35, at: 0.09 },
    ],
    master: 0.42,
    level: 0.6,
  },
};

/** The cue table a theme plays from; the soft theme is the standard set, softened as it plays. */
export function cuesFor(theme: SoundTheme): Record<SoundName, Cue> {
  return theme === 'retro' ? RETRO_CUES : STANDARD_CUES;
}

/** Plays a cue in the current theme and at the current volume, whatever the sound switch says. */
export function playCue(name: SoundName): void {
  const { soundTheme, soundVolume } = useSettings.getState();
  play(cuesFor(soundTheme)[name], soundTheme, soundVolume);
}

/** Every cue as a function, for the tests and the lab. */
export const SOUNDS: Record<SoundName, () => void> = Object.fromEntries(
  SOUND_NAMES.map((name) => [name, () => playCue(name)]),
) as Record<SoundName, () => void>;

/**
 * Creates the audio context on the first tap or key press, before any cue is
 * needed: browsers only start audio after a gesture anyway, and it gives the
 * punch chain time to settle, so even the first hit lands at full weight.
 */
export function warmUpAudio(): void {
  if (typeof window === 'undefined') return;
  const warm = () => {
    if (useSettings.getState().sounds) getContext();
  };
  window.addEventListener('pointerdown', warm, { once: true, passive: true });
  window.addEventListener('keydown', warm, { once: true, passive: true });
}

/**
 * Plays a named sound if sounds are enabled in settings, and gives the matching
 * haptic cue if haptics are. Never throws.
 */
export function playSound(name: SoundName): void {
  vibrate(name);
  if (!useSettings.getState().sounds) return;
  try {
    playCue(name);
  } catch {
    // Audio is best-effort; ignore autoplay/permission failures.
  }
}

/**
 * The cue for the end of a game: the loss variant when the player lost, the
 * win-or-draw cue otherwise. Between two people at one device nobody "lost".
 */
export function gameEndSound(verdict: 'win' | 'loss' | 'draw', hotSeat = false): SoundName {
  return verdict === 'loss' && !hotSeat ? 'gameLost' : 'gameEnd';
}

/** Picks the right sound for a move that has just been played on `chess` (only check matters). */
export function soundForMove(move: Move, chess: Pick<Chess, 'inCheck'>): SoundName {
  if (chess.inCheck()) return 'check';
  if (move.promotion) return 'promote';
  if (move.captured) return 'capture';
  if (move.flags.includes('k') || move.flags.includes('q')) return 'castle';
  return 'move';
}

export function playMoveSound(move: Move, chess: Chess): void {
  playSound(soundForMove(move, chess));
}

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '@/store/settings';
import { HAPTIC_PATTERNS, hapticPattern, RETRO_HAPTIC_PATTERNS, vibrate } from './haptics';
import {
  gameEndSound,
  hasUserGesture,
  isNoise,
  markUserGesture,
  playSound,
  resetUserGesture,
  RETRO_CUES,
  SOUND_NAMES,
  type SoundName,
  softenTone,
  SOUNDS,
  STANDARD_CUES,
  type Tone,
  volumeGain,
} from './sound';

/**
 * A fake Web Audio graph that records what the synth builds — node types,
 * levels and the output chain — so each cue can be checked without a speaker.
 */
interface Param {
  value: number;
  peak: number;
  setValueAtTime: (v: number) => void;
  exponentialRampToValueAtTime: (v: number) => void;
}
function param(): Param {
  const p: Param = {
    value: 0,
    peak: 0,
    setValueAtTime(v) {
      p.value = v;
    },
    exponentialRampToValueAtTime(v) {
      p.peak = Math.max(p.peak, v);
    },
  };
  return p;
}

interface FakeNode {
  kind: string;
  connect: (target: FakeNode) => FakeNode;
  targets: FakeNode[];
  [key: string]: unknown;
}

const graph = vi.hoisted(() => ({ nodes: [] as FakeNode[] }));

function node(kind: string, extra: Record<string, unknown> = {}): FakeNode {
  const n: FakeNode = {
    kind,
    targets: [],
    connect(target: FakeNode) {
      n.targets.push(target);
      return target;
    },
    ...extra,
  };
  graph.nodes.push(n);
  return n;
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48_000;
  state = 'running';
  destination = node('destination');
  resume = () => Promise.resolve();
  createOscillator() {
    return node('oscillator', { type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn() });
  }
  createGain() {
    return node('gain', { gain: param() });
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { sampleRate: 48_000, getChannelData: () => data };
  }
  createBufferSource() {
    return node('noise', { buffer: null, start: vi.fn() });
  }
  createBiquadFilter() {
    return node('filter', { type: 'lowpass', frequency: { value: 0 }, Q: { value: 1 } });
  }
  createDynamicsCompressor() {
    return node('compressor', {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 1 },
      attack: { value: 0 },
      release: { value: 0 },
    });
  }
  createWaveShaper() {
    return node('shaper', { curve: null, oversample: 'none' });
  }
}

vi.stubGlobal('AudioContext', FakeAudioContext);

const kinds = (kind: string) => graph.nodes.filter((n) => n.kind === kind);
/** The gains the cue's layers feed (every layer has one). */
const layerGains = () =>
  kinds('gain').filter((g) => g.targets.length > 0 && (g.gain as Param).peak > 0);
const peakLayerGain = () => Math.max(...layerGains().map((g) => (g.gain as Param).peak));
/** Follows a layer's gain to the trim at the end of its output chain and reads the level. */
function levelOf(gain: FakeNode): number {
  let n: FakeNode | undefined = gain;
  while (n && n.kind !== 'destination') {
    if (n.kind === 'gain' && n !== gain) return (n.gain as Param).value;
    n = n.targets[0];
  }
  return Number.NaN;
}
const chainKinds = (gain: FakeNode) => {
  const out: string[] = [];
  let n: FakeNode | undefined = gain.targets[0];
  while (n) {
    out.push(n.kind);
    n = n.targets[0];
  }
  return out;
};
/** How loud a cue comes out: the trim level times its hottest layer. */
function loudness(name: SoundName): number {
  graph.nodes.length = 0;
  SOUNDS[name]();
  return levelOf(layerGains()[0]!) * peakLayerGain();
}
const tones = (layers: readonly (Tone | { noise: true })[]) =>
  layers.filter((l): l is Tone => !isNoise(l as Tone));

describe('sound cues', () => {
  beforeAll(() => {
    // Creating the context also creates the limiter and the first punch chain;
    // do it once so every test below sees only the nodes of the cue it plays.
    useSettings.getState().update({ sounds: true, haptics: false });
    markUserGesture();
    SOUNDS.move();
  });

  beforeEach(() => {
    graph.nodes.length = 0;
    useSettings.getState().reset();
    useSettings.getState().update({ sounds: true, haptics: false });
  });

  it('lists every cue once, with a design in every theme and a haptic pattern for each', () => {
    const names = [...SOUND_NAMES].sort();
    expect(new Set(SOUND_NAMES).size).toBe(SOUND_NAMES.length);
    expect(Object.keys(SOUNDS).sort()).toEqual(names);
    expect(Object.keys(STANDARD_CUES).sort()).toEqual(names);
    expect(Object.keys(RETRO_CUES).sort()).toEqual(names);
    expect(Object.keys(HAPTIC_PATTERNS).sort()).toEqual(names);
    expect(Object.keys(RETRO_HAPTIC_PATTERNS).sort()).toEqual(names);
  });

  it('every cue of the standard and retro sets goes through the punch chain, leaving a fresh chain warming', () => {
    for (const theme of ['standard', 'retro'] as const) {
      useSettings.getState().update({ soundTheme: theme });
      for (const name of SOUND_NAMES) {
        graph.nodes.length = 0;
        SOUNDS[name]();
        expect(layerGains().length).toBeGreaterThan(0);
        for (const gain of layerGains()) {
          // Punch chain, trim, then the shared limiter in front of the speakers.
          expect(chainKinds(gain)).toEqual([
            'compressor',
            'shaper',
            'gain',
            'compressor',
            'destination',
          ]);
        }
        expect(kinds('compressor')).toHaveLength(1);
      }
    }
  });

  it('a move is a wooden thock: a dropping tone, a tap of noise and a click', () => {
    SOUNDS.move();
    const [thock] = kinds('oscillator');
    expect((thock?.frequency as Param).value).toBe(420);
    expect((thock?.frequency as Param).peak).toBe(170);
    expect(kinds('noise')).toHaveLength(1);
    expect(kinds('filter')[0]?.type).toBe('bandpass');
    expect(peakLayerGain()).toBeLessThan(0.5);
  });

  it('a capture is an impact: thump, sub, three noise layers and the tick, at the top of the set', () => {
    SOUNDS.capture();
    const oscillators = kinds('oscillator');
    expect(oscillators.length).toBeGreaterThanOrEqual(4);
    const thump = oscillators[0]!;
    expect((thump.frequency as Param).value).toBeGreaterThan(150);
    expect((thump.frequency as Param).peak).toBeLessThan(60);
    const filters = kinds('filter');
    expect(filters.map((f) => f.type)).toEqual(['bandpass', 'bandpass', 'lowpass']);
    expect(filters.map((f) => (f.frequency as { value: number }).value)).toEqual([2400, 750, 380]);
    expect(peakLayerGain()).toBeGreaterThanOrEqual(0.8);
    expect(levelOf(layerGains()[0]!)).toBe(1);
  });

  it('is level-matched in both sets: the capture is the loudest cue, a move well below it', () => {
    for (const theme of ['standard', 'retro'] as const) {
      useSettings.getState().update({ soundTheme: theme });
      const levels = Object.fromEntries(SOUND_NAMES.map((n) => [n, loudness(n)])) as Record<
        SoundName,
        number
      >;
      const order = [...SOUND_NAMES].sort((a, b) => levels[b] - levels[a]);
      expect(order[0], theme).toBe('capture');
      expect(levels.capture).toBeGreaterThan(levels.gameEnd);
      expect(levels.gameLost).toBeCloseTo(levels.gameEnd, 5);
      expect(levels.move).toBeLessThan(levels.capture / 2);
      expect(levels.castle).toBeCloseTo(levels.move, 5);
    }
  });

  it('the retro set is chip sound: square and triangle waves only, noise only in the explosion', () => {
    useSettings.getState().update({ soundTheme: 'retro' });
    for (const name of SOUND_NAMES) {
      graph.nodes.length = 0;
      SOUNDS[name]();
      const waves = new Set(kinds('oscillator').map((o) => o.type));
      expect(
        [...waves].every((w) => w === 'square' || w === 'triangle'),
        name,
      ).toBe(true);
      expect(kinds('noise').length, name).toBe(name === 'capture' ? 2 : 0);
    }
    graph.nodes.length = 0;
    SOUNDS.move();
    expect(kinds('oscillator').map((o) => [o.type, (o.frequency as Param).value])).toEqual([
      ['square', 1046],
      ['triangle', 523],
    ]);
    // The explosion: a pitch drop and a sub sweep under the noise.
    graph.nodes.length = 0;
    SOUNDS.capture();
    const [drop, sub] = kinds('oscillator');
    expect((drop?.frequency as Param).value).toBe(320);
    expect((drop?.frequency as Param).peak).toBe(40);
    expect((sub?.frequency as Param).peak).toBe(30);
  });

  it('game over tells a win from a loss: major and rising against minor and sinking', () => {
    // Standard: the chord under the impact is major (G B D) or minor (A C E),
    // and the minor one glides down a semitone as it fades.
    const won = tones(STANDARD_CUES.gameEnd.layers).filter((t) => t.type !== 'sine');
    const lost = tones(STANDARD_CUES.gameLost.layers).filter((t) => t.type !== 'sine');
    expect(won.map((t) => t.frequency)).toEqual([392, 494, 587]);
    expect(won.every((t) => !t.glideTo)).toBe(true);
    expect(lost.map((t) => t.frequency)).toEqual([220, 262, 330]);
    expect(lost.every((t) => t.glideTo && t.glideTo < t.frequency)).toBe(true);
    // The thirds: 494/392 is a major third, 262/220 a minor one.
    expect(494 / 392).toBeCloseTo(1.26, 2);
    expect(262 / 220).toBeCloseTo(1.19, 2);

    // Retro: four square notes up the major chord, or four down into the minor one.
    const upBeats = tones(RETRO_CUES.gameEnd.layers).filter((t) => t.type === 'square');
    const downBeats = tones(RETRO_CUES.gameLost.layers).filter((t) => t.type === 'square');
    expect(upBeats).toHaveLength(4);
    expect(downBeats).toHaveLength(4);
    const rising = upBeats.every((t, i) => i === 0 || t.frequency > upBeats[i - 1]!.frequency);
    const falling = downBeats.every((t, i) => i === 0 || t.frequency < downBeats[i - 1]!.frequency);
    expect(rising).toBe(true);
    expect(falling).toBe(true);
    const wonChord = tones(RETRO_CUES.gameEnd.layers)
      .filter((t) => t.type === 'triangle')
      .map((t) => t.frequency);
    const lostChord = tones(RETRO_CUES.gameLost.layers)
      .filter((t) => t.type === 'triangle')
      .map((t) => t.frequency);
    expect(wonChord.slice(0, 2)).toEqual([1046, 1318]); // C E: major
    expect(lostChord.slice(0, 2)).toEqual([523, 622]); // C E♭: minor
    expect(gameEndSound('win')).toBe('gameEnd');
    expect(gameEndSound('draw')).toBe('gameEnd');
    expect(gameEndSound('loss')).toBe('gameLost');
    expect(gameEndSound('loss', true)).toBe('gameEnd');
  });

  it('the volume slider scales the trim on a perceptual curve and silences at zero', () => {
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.5)).toBe(0.25);
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(2)).toBe(1);
    expect(volumeGain(-1)).toBe(0);

    useSettings.getState().update({ soundVolume: 0.5 });
    SOUNDS.capture();
    expect(levelOf(layerGains()[0]!)).toBeCloseTo(0.25, 5);
    // The layers themselves are driven as hard as ever; only the trim changes.
    expect(peakLayerGain()).toBeGreaterThanOrEqual(0.8);

    graph.nodes.length = 0;
    useSettings.getState().update({ soundVolume: 0.5, soundTheme: 'soft' });
    SOUNDS.move();
    expect(levelOf(layerGains()[0]!)).toBeCloseTo(0.55 * 0.25, 5);

    graph.nodes.length = 0;
    useSettings.getState().update({ soundVolume: 0, soundTheme: 'standard' });
    playSound('capture');
    expect(graph.nodes).toHaveLength(0);
  });

  it('the soft theme halves every cue, dulls the noise and skips the punch chain', () => {
    useSettings.getState().update({ soundTheme: 'soft' });
    SOUNDS.capture();
    expect(kinds('compressor')).toHaveLength(0);
    expect(peakLayerGain()).toBeCloseTo(0.4, 5);
    expect(kinds('oscillator').every((o) => o.type === 'sine')).toBe(true);
    expect(kinds('filter').map((f) => (f.frequency as { value: number }).value)).toEqual([
      1200, 375, 190,
    ]);
    for (const gain of layerGains()) {
      expect(chainKinds(gain)).toEqual(['gain', 'compressor', 'destination']);
    }
  });

  it('softens a tone to a lower sine', () => {
    expect(softenTone({ frequency: 400, duration: 0.1, type: 'square', glideTo: 200 })).toEqual({
      frequency: 300,
      duration: 0.1,
      type: 'sine',
      glideTo: 150,
    });
    expect(isNoise({ noise: true, duration: 0.1 })).toBe(true);
    expect(isNoise({ frequency: 1, duration: 0.1 })).toBe(false);
  });

  it('stays silent when sounds are off', () => {
    useSettings.getState().update({ sounds: false });
    playSound('capture');
    expect(graph.nodes).toHaveLength(0);
  });

  it('plays nothing and vibrates nothing before the first tap or key press', () => {
    const vibrateSpy = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true });
    try {
      useSettings.getState().update({ sounds: true, haptics: true });
      resetUserGesture();
      expect(hasUserGesture()).toBe(false);
      playSound('move');
      vibrate('move');
      expect(graph.nodes).toHaveLength(0);
      expect(vibrateSpy).not.toHaveBeenCalled();
      // The first gesture anywhere on the page opens the gate.
      window.dispatchEvent(new Event('pointerdown'));
      expect(hasUserGesture()).toBe(true);
      playSound('move');
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(vibrateSpy).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(navigator, 'vibrate');
      useSettings.getState().update({ haptics: false });
    }
  });

  it('every cue meets at one limiter in front of the speakers', () => {
    SOUNDS.check();
    SOUNDS.gameEnd();
    const limiters = new Set<FakeNode>();
    for (const gain of layerGains()) {
      let n: FakeNode | undefined = gain;
      while (n && n.kind !== 'destination') {
        if (n.kind === 'compressor' && n.targets[0]?.kind === 'destination') limiters.add(n);
        n = n.targets[0];
      }
    }
    expect(limiters.size).toBe(1);
  });
});

describe('haptics', () => {
  const vibrateSpy = vi.fn(() => true);

  beforeEach(() => {
    vibrateSpy.mockClear();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true });
    useSettings.getState().reset();
    useSettings.getState().update({ sounds: false, haptics: true });
    markUserGesture();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('follows the sound theme: the retro patterns are shorter and buzzier', () => {
    expect(hapticPattern('capture', 'standard')).toEqual([10, 20, 45]);
    expect(hapticPattern('capture', 'soft')).toEqual([10, 20, 45]);
    expect(hapticPattern('capture', 'retro')).toEqual([8, 12, 8, 12, 8, 12, 30]);
    const total = (p: number | number[]) =>
      Array.isArray(p) ? p.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : p;
    for (const name of SOUND_NAMES) {
      const standard = HAPTIC_PATTERNS[name];
      const retro = RETRO_HAPTIC_PATTERNS[name];
      // No single retro buzz is longer than the standard one, and the retro
      // pattern has at least as many pulses.
      const longest = (p: number | number[]) =>
        Array.isArray(p) ? Math.max(...p.filter((_, i) => i % 2 === 0)) : p;
      expect(longest(retro), name).toBeLessThanOrEqual(longest(standard));
      const pulses = (p: number | number[]) => (Array.isArray(p) ? Math.ceil(p.length / 2) : 1);
      expect(pulses(retro), name).toBeGreaterThanOrEqual(pulses(standard));
      expect(total(retro), name).toBeGreaterThan(0);
    }
  });

  it('vibrates with the current theme’s pattern, and not when haptics are off', () => {
    vibrate('check');
    expect(vibrateSpy).toHaveBeenLastCalledWith([14, 40, 14]);
    useSettings.getState().update({ soundTheme: 'retro' });
    vibrate('check');
    expect(vibrateSpy).toHaveBeenLastCalledWith([8, 15, 8, 15, 8]);
    playSound('gameLost');
    expect(vibrateSpy).toHaveBeenLastCalledWith([25, 25, 25, 25, 25, 25, 90]);
    useSettings.getState().update({ haptics: false });
    vibrate('move');
    expect(vibrateSpy).toHaveBeenCalledTimes(3);
  });
});

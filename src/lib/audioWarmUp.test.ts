import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const primeAudio = vi.hoisted(() => vi.fn());
vi.mock('./sound', () => ({ primeAudio }));

import { warmUpAudioLater } from './audioWarmUp';
import { hasUserGesture, resetUserGesture } from './userGesture';

describe('warmUpAudioLater', () => {
  beforeEach(() => {
    primeAudio.mockClear();
    resetUserGesture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the sound engine only after the first gesture, and only with sounds on', async () => {
    let soundsOn = false;
    warmUpAudioLater(() => soundsOn);
    expect(hasUserGesture()).toBe(false);
    window.dispatchEvent(new Event('pointerdown'));
    expect(hasUserGesture()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(primeAudio).not.toHaveBeenCalled();

    soundsOn = true;
    warmUpAudioLater(() => soundsOn);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    await vi.waitFor(() => expect(primeAudio).toHaveBeenCalledTimes(1));
  });
});

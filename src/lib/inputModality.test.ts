import { afterEach, describe, expect, it } from 'vitest';
import { trackInputModality } from './inputModality';

describe('trackInputModality', () => {
  let stop: (() => void) | null = null;
  afterEach(() => {
    stop?.();
    stop = null;
  });

  const root = () => document.documentElement.dataset.input;
  const key = (init: KeyboardEventInit) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

  it('says pointer after a click or a tap, and keyboard after a key press', () => {
    stop = trackInputModality();
    expect(root()).toBeUndefined();
    window.dispatchEvent(new Event('pointerdown'));
    expect(root()).toBe('pointer');
    key({ key: 'Tab' });
    expect(root()).toBe('keyboard');
    key({ key: 'Tab', shiftKey: true });
    expect(root()).toBe('keyboard');
    window.dispatchEvent(new Event('pointerdown'));
    expect(root()).toBe('pointer');
  });

  it('leaves the pointer alone for a modifier or a shortcut', () => {
    stop = trackInputModality();
    window.dispatchEvent(new Event('pointerdown'));
    key({ key: 'Shift', shiftKey: true });
    key({ key: 'Control', ctrlKey: true });
    key({ key: 'c', ctrlKey: true });
    key({ key: 'v', metaKey: true });
    expect(root()).toBe('pointer');
    // A single-key shortcut (H for a hint) is the keyboard.
    key({ key: 'h' });
    expect(root()).toBe('keyboard');
  });

  it('stops and clears the mark', () => {
    stop = trackInputModality();
    window.dispatchEvent(new Event('pointerdown'));
    stop();
    stop = null;
    expect(root()).toBeUndefined();
    key({ key: 'Tab' });
    expect(root()).toBeUndefined();
  });
});

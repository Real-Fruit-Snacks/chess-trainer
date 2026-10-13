import { afterEach, describe, expect, it } from 'vitest';
import { useSettings } from '@/store/settings';
import { characterShortcutsOn, pageShortcutKey, shortcutKey } from './shortcutKey';

function press(key: string, init: KeyboardEventInit = {}, target?: HTMLElement): string | null {
  const el = target ?? document.body;
  let seen: string | null = 'unset';
  const listener = (e: Event) => {
    seen = shortcutKey(e as KeyboardEvent);
  };
  window.addEventListener('keydown', listener);
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  window.removeEventListener('keydown', listener);
  return seen;
}

describe('shortcutKey', () => {
  it('normalises letters to lower case so Caps Lock and Shift do not matter', () => {
    expect(press('h')).toBe('h');
    expect(press('H')).toBe('h');
    expect(press('S', { shiftKey: true })).toBe('s');
    expect(press('Enter')).toBe('Enter');
  });

  it('ignores modified keys', () => {
    expect(press('s', { ctrlKey: true })).toBeNull();
    expect(press('s', { metaKey: true })).toBeNull();
    expect(press('h', { altKey: true })).toBeNull();
  });

  it('ignores presses from text fields, the board, dialogs and activated buttons', () => {
    const input = document.createElement('input');
    document.body.append(input);
    expect(press('h', {}, input)).toBeNull();

    const board = document.createElement('div');
    board.setAttribute('role', 'application');
    const inner = document.createElement('div');
    board.append(inner);
    document.body.append(board);
    expect(press('h', {}, inner)).toBeNull();
    expect(press('s', {}, board)).toBeNull();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const field = document.createElement('span');
    dialog.append(field);
    document.body.append(dialog);
    expect(press('n', {}, field)).toBeNull();

    const button = document.createElement('button');
    document.body.append(button);
    expect(press('Enter', {}, button)).toBeNull();
    expect(press(' ', {}, button)).toBeNull();
    // Letters from a focused button are still shortcuts.
    expect(press('n', {}, button)).toBe('n');

    input.remove();
    board.remove();
    dialog.remove();
    button.remove();
  });

  it('leaves a press alone that something else already handled', () => {
    const el = document.createElement('div');
    document.body.append(el);
    el.addEventListener('keydown', (e) => e.preventDefault());
    expect(press('h', { cancelable: true }, el)).toBeNull();
    el.remove();
  });
});

describe('pageShortcutKey (the single-key shortcuts setting)', () => {
  afterEach(() => {
    useSettings.getState().update({ keyboardShortcuts: true });
  });

  it('passes letters through while the setting is on', () => {
    expect(characterShortcutsOn()).toBe(true);
    expect(pageShortcutKey(new KeyboardEvent('keydown', { key: 'H' }))).toBe('h');
  });

  it('drops character keys, but not Enter, Space or the arrows, when it is off', () => {
    useSettings.getState().update({ keyboardShortcuts: false });
    expect(characterShortcutsOn()).toBe(false);
    expect(pageShortcutKey(new KeyboardEvent('keydown', { key: 'h' }))).toBeNull();
    expect(pageShortcutKey(new KeyboardEvent('keydown', { key: '?' }))).toBeNull();
    expect(pageShortcutKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe('Enter');
    expect(pageShortcutKey(new KeyboardEvent('keydown', { key: ' ' }))).toBe(' ');
    expect(pageShortcutKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe('ArrowRight');
  });
});

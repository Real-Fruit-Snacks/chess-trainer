import { describe, expect, it } from 'vitest';
import { isHelpShortcut, SHORTCUT_GROUPS } from './shortcuts';

function key(init: KeyboardEventInit & { target?: HTMLElement }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', init);
  if (init.target) Object.defineProperty(event, 'target', { value: init.target });
  return event;
}

describe('shortcut reference', () => {
  it('lists every group with at least one shortcut and no duplicates within a group', () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThanOrEqual(4);
    for (const group of SHORTCUT_GROUPS) {
      expect(group.shortcuts.length).toBeGreaterThan(0);
      const actions = group.shortcuts.map((s) => s.action);
      expect(new Set(actions).size).toBe(actions.length);
      for (const shortcut of group.shortcuts) expect(shortcut.keys.length).toBeGreaterThan(0);
    }
  });

  it('opens on ? but not while typing or with modifiers', () => {
    expect(isHelpShortcut(key({ key: '?' }))).toBe(true);
    expect(isHelpShortcut(key({ key: '/', shiftKey: true }))).toBe(true);
    expect(isHelpShortcut(key({ key: '/' }))).toBe(false);
    expect(isHelpShortcut(key({ key: '?', ctrlKey: true }))).toBe(false);
    const input = document.createElement('input');
    expect(isHelpShortcut(key({ key: '?', target: input }))).toBe(false);
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isHelpShortcut(key({ key: '?', target: editable }))).toBe(false);
  });
});

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

  it('describes what the pages really do', () => {
    const titles = SHORTCUT_GROUPS.map((g) => g.title);
    // Only Analyze has the move-list keys; Play has no keyboard handler at all.
    expect(titles).toContain('Analyze');
    expect(titles).not.toContain(expect.stringMatching(/Play\b/));
    expect(titles.join(' ')).not.toMatch(/\bPlay\b/);
    const flat = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts.map((s) => ({ group: g.title, ...s })));
    const keysIn = (group: string) => flat.filter((s) => s.group === group).flatMap((s) => s.keys);
    expect(keysIn('Analyze')).toEqual(expect.arrayContaining(['←', '→', 'Home', 'End', 'F', 'M']));
    expect(keysIn('What’s the threat?')).toEqual(['S', 'N']);
    expect(keysIn('Puzzles')).toEqual(expect.arrayContaining(['H', 'S', 'N', 'Enter']));
    expect(keysIn('Lessons')).toEqual(expect.arrayContaining(['←', '→', 'H']));
    expect(keysIn('Endgame studies')).toEqual(['H', 'S']);
    expect(keysIn('Lesson recall')).toEqual(expect.arrayContaining(['H', 'N', '→']));
    expect(keysIn('Mating patterns')).toEqual(['Enter']);
    expect(keysIn('Classic games')).toEqual(['Space', 'Enter', '→']);
    expect(keysIn('Arcade')).toEqual(expect.arrayContaining(['Enter', 'N']));
    // F is Analyze-only.
    expect(flat.filter((s) => s.keys.includes('F')).map((s) => s.group)).toEqual(['Analyze']);
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

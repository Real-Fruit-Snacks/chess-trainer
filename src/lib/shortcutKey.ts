import { useSettings } from '@/store/settings';

/**
 * The letter shortcuts of the trainers (Puzzles H/S/N, Studies H/S, Patterns
 * Enter) share one rule for when a key press counts:
 *
 * - never with Ctrl, Alt or Cmd held (Ctrl+S must stay the browser's);
 * - never from a text field, a select or anything editable;
 * - never from the chess board (`role="application"`), which types squares;
 * - never while a dialog is open;
 * - Enter and Space never from a button or link, which already act on them;
 * - and the key is compared without regard to case, so Caps Lock and Shift do
 *   not break a shortcut.
 *
 * Returns the normalised key (`'h'`, `'Enter'`), or null when the press is not
 * a shortcut. Independent of any setting: a page that wants to honour a
 * "turn single-key shortcuts off" preference checks that before calling.
 */
export function shortcutKey(event: KeyboardEvent): string | null {
  if (event.defaultPrevented) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target as HTMLElement | null;
  if (target && typeof target.closest === 'function') {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
      return null;
    }
    if (target.closest('[role="application"], [role="dialog"], dialog, [contenteditable]')) {
      return null;
    }
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      target.closest('button, a, [role="button"], summary')
    ) {
      return null;
    }
  }
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

/**
 * Whether single-character shortcuts (H, S, N, F, ?) are on. Settings can turn
 * them off for speech input and switch devices, where a stray letter would
 * otherwise act (WCAG 2.1.4); Enter, Space, the arrows, Home and End are not
 * character keys and keep working.
 */
export function characterShortcutsOn(): boolean {
  return useSettings.getState().keyboardShortcuts !== false;
}

/** `shortcutKey` that also honours the single-key shortcuts setting. */
export function pageShortcutKey(event: KeyboardEvent): string | null {
  const key = shortcutKey(event);
  if (key !== null && key.length === 1 && key !== ' ' && !characterShortcutsOn()) return null;
  return key;
}

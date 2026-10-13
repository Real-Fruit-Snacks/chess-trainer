import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isSearchShortcut, openQuickSearch, useQuickSearch } from './quickSearch';

function key(init: KeyboardEventInit & { target?: HTMLElement }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  if (init.target) Object.defineProperty(event, 'target', { value: init.target });
  return event;
}

describe('isSearchShortcut', () => {
  it('is Ctrl+K or Cmd+K, whatever the case of the letter', () => {
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: 'k', metaKey: true }))).toBe(true);
    // Caps Lock on.
    expect(isSearchShortcut(key({ key: 'K', ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: 'k' }))).toBe(false);
    expect(isSearchShortcut(key({ key: 'j', ctrlKey: true }))).toBe(false);
  });

  it('leaves other combinations alone', () => {
    expect(isSearchShortcut(key({ key: 'K', ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, isComposing: true }))).toBe(false);
  });

  it('goes by the K key on a keyboard without Latin letters, by the letter on others', () => {
    // A Russian layout: the K key types "л".
    expect(isSearchShortcut(key({ key: 'л', code: 'KeyK', ctrlKey: true }))).toBe(true);
    // Dvorak: the key where QWERTY has K types "t"; Ctrl+T is not search.
    expect(isSearchShortcut(key({ key: 't', code: 'KeyK', ctrlKey: true }))).toBe(false);
  });

  it('keeps the browser’s own Ctrl+K in text fields', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      const target = document.createElement(tag);
      expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, target }))).toBe(false);
    }
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, target: editable }))).toBe(false);
    const board = document.createElement('div');
    board.setAttribute('role', 'application');
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, target: board }))).toBe(true);
  });
});

describe('useQuickSearch', () => {
  afterEach(() => {
    for (const dialog of document.querySelectorAll('dialog')) dialog.remove();
  });

  const pressShortcut = () => {
    const event = key({ key: 'k', ctrlKey: true });
    act(() => {
      window.dispatchEvent(event);
    });
    return event;
  };

  it('opens and closes on the shortcut, and is mounted from the first time on', () => {
    const { result } = renderHook(() => useQuickSearch());
    expect(result.current).toMatchObject({ open: false, mounted: false });
    const event = pressShortcut();
    expect(event.defaultPrevented).toBe(true);
    expect(result.current).toMatchObject({ open: true, mounted: true });
    pressShortcut();
    expect(result.current).toMatchObject({ open: false, mounted: true });
    act(() => result.current.show());
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it('leaves another open dialog alone, but not its own', () => {
    const { result } = renderHook(() => useQuickSearch());
    const other = document.createElement('dialog');
    other.setAttribute('open', '');
    document.body.append(other);
    const ignored = pressShortcut();
    expect(ignored.defaultPrevented).toBe(false);
    expect(result.current.open).toBe(false);

    other.remove();
    const own = document.createElement('dialog');
    own.className = 'dialog search';
    own.setAttribute('open', '');
    document.body.append(own);
    pressShortcut();
    expect(result.current.open).toBe(true);
  });

  it('can be opened from anywhere while the shell is there', () => {
    const { result, unmount } = renderHook(() => useQuickSearch());
    act(() => openQuickSearch());
    expect(result.current).toMatchObject({ open: true, mounted: true });
    unmount();
    // Nothing to open once the shell has gone: no error either.
    expect(() => openQuickSearch()).not.toThrow();
  });
});

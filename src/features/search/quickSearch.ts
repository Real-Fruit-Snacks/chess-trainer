import { useCallback, useEffect, useState } from 'react';

/**
 * Quick search's share of the start-up code: the Ctrl+K / Cmd+K listener and the open state.
 * The dialog and every list it searches load when it is first opened (SearchDialog.tsx).
 */

/** Ctrl+K, or Cmd+K on a Mac, from anywhere but a text field (which keeps the browser's own). */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.isComposing) {
    return false;
  }
  const key = event.key.toLowerCase();
  // On a keyboard without Latin letters the K key still counts.
  if (key !== 'k' && (/^[a-z]$/.test(key) || event.code !== 'KeyK')) return false;
  const target = event.target as HTMLElement | null;
  return !(
    target &&
    (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable === true)
  );
}

/** How the shell opens it; set while the shell is mounted. */
let opener: (() => void) | null = null;

/** Opens quick search from anywhere in the app (the "What's new" card, for one). */
export function openQuickSearch(): void {
  opener?.();
}

/**
 * Whether quick search is open, and whether it was ever asked for: from then on its dialog
 * stays mounted, so it opens again at once with its lists in place.
 */
export function useQuickSearch(): {
  open: boolean;
  mounted: boolean;
  show: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const show = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    opener = show;
    const onKey = (event: KeyboardEvent) => {
      // Another dialog owns the screen (a game's setup, a confirmation): leave it alone.
      if (!isSearchShortcut(event) || document.querySelector('dialog[open]:not(.search)')) return;
      event.preventDefault();
      setMounted(true);
      setOpen((was) => !was);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener === show) opener = null;
    };
  }, [show]);

  return { open, mounted, show, close };
}

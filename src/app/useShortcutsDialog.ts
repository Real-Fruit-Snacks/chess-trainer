import { useEffect, useRef, useState } from 'react';
import { characterShortcutsOn } from '@/lib/shortcutKey';
import { isHelpShortcut } from './shortcuts';

/** Owns the open state and the global "?" listener. */
export function useShortcutsDialog(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isHelpShortcut(event) || !characterShortcutsOn()) return;
      // Another modal (a game setup, a confirmation) owns the screen: leave it alone.
      if (!openRef.current && document.querySelector('dialog[open]')) return;
      event.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}

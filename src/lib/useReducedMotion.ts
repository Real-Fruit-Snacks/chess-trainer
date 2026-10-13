import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** Whether the operating system asks for less motion right now. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false;
}

/** Tracks the `prefers-reduced-motion` media query, including live changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    const onChange = () => setReduced(media.matches);
    // Old WebKit (and some test doubles) only have the deprecated listener pair.
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => {
        if (typeof media.removeEventListener === 'function') {
          media.removeEventListener('change', onChange);
        }
      };
    }
    if (typeof media.addListener === 'function') {
      media.addListener(onChange);
      return () => media.removeListener(onChange);
    }
    return undefined;
  }, []);
  return reduced;
}

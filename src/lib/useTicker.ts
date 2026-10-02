import { useSyncExternalStore } from 'react';

/**
 * The current time, refreshed five times a second while anything is watching.
 * Every subscriber shares one timer, so a page with sixteen running clocks
 * still wakes up only five times a second, and only the clocks re-render —
 * not the boards around them.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let now = Date.now();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 200);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const idle = () => () => undefined;

/** Date.now(), ticking five times a second while `active`; 0 when not. */
export function useTicker(active = true): number {
  return useSyncExternalStore(
    active ? subscribe : idle,
    () => (active ? now : 0),
    () => 0,
  );
}

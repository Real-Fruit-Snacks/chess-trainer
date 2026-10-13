import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs` (keeps "due" counts honest on
 * long-lived pages). Pass a `refreshKey` to re-read the clock whenever some
 * state changes — e.g. the review queue, so a card scheduled "now" counts as
 * due straight away instead of at the next tick.
 */
export function useNow(intervalMs = 60_000, refreshKey?: unknown): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, refreshKey]);
  return now;
}

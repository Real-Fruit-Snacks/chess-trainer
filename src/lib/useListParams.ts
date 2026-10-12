import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * A long list's search and filters, kept in the address (`?q=fork&group=Endgames`) so Back
 * returns to them and a link can share them. Changes replace the current entry rather than
 * adding to the history, and never scroll the page.
 */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const get = useCallback((key: string) => params.get(key) ?? '', [params]);
  const set = useCallback(
    (key: string, value: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  );
  const clear = useCallback(
    (...keys: string[]) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of keys) next.delete(key);
          return next;
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  );
  return { get, set, clear };
}

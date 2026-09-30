import { useEffect, useState } from 'react';
import type { Fen } from '@/chess/types';
import { type ExplorerDatabase, type ExplorerResult, lookupExplorer } from './explorer';

export type ExplorerState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; result: ExplorerResult }
  | { status: 'error'; message: string };

/** Looks a position up in the opening explorer, debounced and abortable. */
export function useExplorer(
  fen: Fen | null,
  enabled: boolean,
  database: ExplorerDatabase,
): ExplorerState {
  const [state, setState] = useState<ExplorerState>({ status: 'off' });
  useEffect(() => {
    if (!enabled || !fen) {
      setState({ status: 'off' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    const timer = window.setTimeout(() => {
      lookupExplorer(fen, database, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setState({ status: 'ready', result });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Explorer unavailable',
          });
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fen, enabled, database]);
  return state;
}

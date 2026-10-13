import { useEffect, useMemo, useState } from 'react';
import {
  buildPositionIndex,
  cachedPositionIndex,
  gamesSignature,
  type IndexedGame,
  type PositionIndex,
  rememberPositionIndex,
} from './positionIndex';

export interface PositionIndexState {
  /** The index for these games, once built. */
  index: PositionIndex | null;
  /** How far the build has got, while it runs. */
  progress: { done: number; total: number } | null;
  /** The build failed (it is tried again when the games change). */
  failed: boolean;
}

/**
 * The position index over `games`, built when first needed (`active`) in the
 * background, kept in memory, and built again when the games change.
 */
export function usePositionIndex(
  games: readonly IndexedGame[],
  active: boolean,
): PositionIndexState {
  const signature = useMemo(() => gamesSignature(games), [games]);
  const [built, setBuilt] = useState<{ signature: string; index: PositionIndex } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const cached = cachedPositionIndex(signature);

  useEffect(() => {
    if (!active || cachedPositionIndex(signature)) return;
    const controller = new AbortController();
    setProgress({ done: 0, total: games.length });
    buildPositionIndex(games, {
      signal: controller.signal,
      onProgress: (done, total) => {
        if (!controller.signal.aborted) setProgress({ done, total });
      },
    })
      .then((index) => {
        if (controller.signal.aborted) return;
        rememberPositionIndex(signature, index);
        setBuilt({ signature, index });
        setProgress(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error(err);
        setFailedFor(signature);
        setProgress(null);
      });
    return () => controller.abort();
    // `games` changes identity with every store update; the signature says when they really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, active]);

  const index = cached ?? (built?.signature === signature ? built.index : null);
  return { index, progress: index ? null : progress, failed: failedFor === signature };
}

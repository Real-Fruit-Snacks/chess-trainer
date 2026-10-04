import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import {
  countOfflinePuzzleFiles,
  loadPuzzleIndex,
  type PuzzleIndex,
} from '@/features/puzzles/puzzleService';
import {
  currentPuzzleDownload,
  type DownloadProgress,
  startPuzzleDownload,
  stopPuzzleDownload,
  subscribeToPuzzleDownload,
} from './offlineDownload';

/* ------------------------------------------------------------------ */
/* The Settings row                                                    */
/* ------------------------------------------------------------------ */

/**
 * "Download every puzzle" — the first chunk of each rating band is always
 * precached; this fetches the rest so the whole library works offline. The
 * download keeps going when the page changes; only its result is announced.
 */
export function OfflinePuzzles() {
  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [status, setStatus] = useState<{ cached: number; total: number } | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(currentPuzzleDownload);

  useEffect(() => subscribeToPuzzleDownload(() => setProgress(currentPuzzleDownload())), []);

  useEffect(() => {
    let cancelled = false;
    void loadPuzzleIndex()
      .then(async (idx) => {
        if (cancelled) return;
        setIndex(idx);
        setStatus(await countOfflinePuzzleFiles(idx));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // When a download finishes while this row is on screen, refresh its count.
  useEffect(() => {
    if (progress !== null || !index) return;
    let cancelled = false;
    void countOfflinePuzzleFiles(index).then((counted) => {
      if (!cancelled) setStatus(counted);
    });
    return () => {
      cancelled = true;
    };
  }, [progress, index]);

  const complete = status !== null && status.cached >= status.total;
  const sizeMb = index ? Math.round((index.total * 270) / 1024 / 1024) : 0;

  return (
    <div className="settings__row" data-testid="offline-puzzles">
      <span className="small">
        {index
          ? complete
            ? `All ${index.total.toLocaleString()} puzzles are available offline.`
            : `${index.total.toLocaleString()} puzzles in the library; the ones you have played are kept offline${
                status ? ` (${status.cached} of ${status.total} files)` : ''
              }.`
          : 'Loading the puzzle index…'}
      </span>
      {progress ? (
        <div className="row">
          {/* Progress is shown, not announced: the live region speaks only the result. */}
          <span className="small muted" aria-hidden="true">
            {progress.total ? `${progress.done} / ${progress.total}` : 'Starting…'}
          </span>
          <span className="sr-only" role="status">
            Downloading puzzles. The result is announced when it finishes.
          </span>
          <Button size="sm" variant="ghost" onClick={stopPuzzleDownload}>
            Stop
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={() => index && startPuzzleDownload(index)}
          disabled={!index || complete}
        >
          {complete ? 'Downloaded' : `Download every puzzle (~${sizeMb} MB)`}
        </Button>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import {
  countOfflinePuzzleFiles,
  downloadAllPuzzles,
  loadPuzzleIndex,
  type PuzzleIndex,
} from '@/features/puzzles/puzzleService';

/**
 * "Download every puzzle" — the first chunk of each rating band is always
 * precached; this fetches the rest so the whole library works offline.
 */
export function OfflinePuzzles() {
  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [status, setStatus] = useState<{ cached: number; total: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

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
      abort.current?.abort();
    };
  }, []);

  const download = async () => {
    if (!index) return;
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ done: 0, total: 0 });
    try {
      await downloadAllPuzzles(
        index,
        (done, total) => setProgress({ done, total }),
        controller.signal,
      );
      // The service worker writes each response to the cache after handing it
      // to the page, so the last files can take a moment to show up in the count.
      let counted = await countOfflinePuzzleFiles(index);
      for (let attempt = 0; counted.cached < counted.total && attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        counted = await countOfflinePuzzleFiles(index);
      }
      setStatus(counted);
      if (counted.cached >= counted.total) {
        toast(`All ${index.total.toLocaleString()} puzzles are stored for offline use.`, {
          tone: 'success',
        });
      } else {
        toast(
          `${counted.total - counted.cached} of ${counted.total} files could not be stored — try again.`,
          { tone: 'warning' },
        );
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        toast(`Download stopped: ${err instanceof Error ? err.message : String(err)}`, {
          tone: 'warning',
        });
      }
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

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
          <span className="small muted" role="status">
            {progress.total ? `${progress.done} / ${progress.total}` : 'Starting…'}
          </span>
          <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
            Stop
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={() => void download()} disabled={!index || complete}>
          {complete ? 'Downloaded' : `Download every puzzle (~${sizeMb} MB)`}
        </Button>
      )}
    </div>
  );
}

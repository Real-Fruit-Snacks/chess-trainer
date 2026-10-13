import { toast } from '@/components/ui/toastStore';
import {
  countOfflinePuzzleFiles,
  downloadAllPuzzles,
  type PuzzleIndex,
} from '@/features/puzzles/puzzleService';

/* ------------------------------------------------------------------ */
/* The download task, which outlives the Settings page                 */
/* ------------------------------------------------------------------ */

export interface DownloadProgress {
  done: number;
  total: number;
}

interface DownloadTask {
  progress: DownloadProgress;
  controller: AbortController;
}

/** The running download, if any: module-level so navigating away does not stop it. */
let task: DownloadTask | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribes to changes of the running download; returns the unsubscribe. */
export function subscribeToPuzzleDownload(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The result of a finished download, for the one toast at the end. */
async function finish(index: PuzzleIndex): Promise<{ cached: number; total: number }> {
  // The service worker writes each response to the cache after handing it
  // to the page, so the last files can take a moment to show up in the count.
  let counted = await countOfflinePuzzleFiles(index);
  for (let attempt = 0; counted.cached < counted.total && attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    counted = await countOfflinePuzzleFiles(index);
  }
  return counted;
}

/**
 * Starts downloading every puzzle file unless a download is already running.
 * Progress is shared with whoever is listening; the final result is announced
 * once, whichever page is open by then.
 */
export function startPuzzleDownload(
  index: PuzzleIndex,
  onDone?: (status: { cached: number; total: number }) => void,
): void {
  if (task) return;
  const controller = new AbortController();
  task = { progress: { done: 0, total: 0 }, controller };
  notify();
  void (async () => {
    try {
      await downloadAllPuzzles(
        index,
        (done, total) => {
          if (task) task.progress = { done, total };
          notify();
        },
        controller.signal,
      );
      if (controller.signal.aborted) {
        // "Stop" is a choice, not a failure: what was fetched stays offline.
        const counted = await countOfflinePuzzleFiles(index);
        onDone?.(counted);
        toast(
          `Download stopped — ${counted.cached} of ${counted.total} puzzle files are offline.`,
          {
            tone: 'info',
          },
        );
        return;
      }
      const counted = await finish(index);
      onDone?.(counted);
      if (counted.cached >= counted.total) {
        toast(`All ${index.total.toLocaleString()} puzzles are stored for offline use.`, {
          tone: 'success',
        });
      } else {
        toast(
          `${counted.total - counted.cached} of ${counted.total} puzzle files could not be stored — try again.`,
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
      task = null;
      notify();
    }
  })();
}

export function stopPuzzleDownload(): void {
  task?.controller.abort();
}

/** The current progress, or null when nothing is downloading. */
export function currentPuzzleDownload(): DownloadProgress | null {
  return task ? { ...task.progress } : null;
}

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from '@/components/ui/toastStore';
import { describeFailure } from '@/lib/describeFailure';
import { MAIA_CACHE, MAIA_FILES, type MaiaFile, isCurrentMaiaFile } from '@/sw/maiaFiles';
import { maiaClient, type MaiaUrls, maiaUrls } from './maiaClient';

/**
 * The human-like opponent's files on this device: the page downloads them on
 * request into a cache of their own, checks each against its size and SHA-256,
 * and the model's worker reads them from there — offline included. Nothing is
 * downloaded until the learner asks for it.
 */

/** Whether the browser can keep the files at all (Cache Storage, which needs a secure page). */
export function canStoreMaia(): boolean {
  return typeof caches !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;
}

/** Whether both files are stored. False when the browser has no Cache API. */
export async function isMaiaDownloaded(urls: MaiaUrls = maiaUrls()): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    // Opening a cache creates it: look first.
    if (!(await caches.has(MAIA_CACHE))) return false;
    const cache = await caches.open(MAIA_CACHE);
    const [runtime, model] = await Promise.all([
      cache.match(urls.runtimeUrl),
      cache.match(urls.modelUrl),
    ]);
    return Boolean(runtime && model);
  } catch {
    return false;
  }
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Downloads one file into the cache as it arrives (so stopping stops the
 * transfer and leaves nothing behind: a cached response is kept only once its
 * body is complete), then checks it. A wrong file is deleted and refused.
 */
async function fetchFile(
  cache: Cache,
  url: string,
  file: MaiaFile,
  onBytes: (received: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok || !response.body) {
    throw new Error(`${file.name} could not be fetched (HTTP ${response.status}).`);
  }
  let received = 0;
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        onBytes(Math.min(received, file.bytes));
        controller.enqueue(chunk);
      },
    }),
  );
  const type = file.name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
  await cache.put(url, new Response(counted, { headers: { 'Content-Type': type } }));
  const stored = await cache.match(url);
  const bytes = stored ? await stored.arrayBuffer() : null;
  if (bytes?.byteLength !== file.bytes || (await sha256(bytes)) !== file.sha256) {
    await cache.delete(url);
    throw new Error(`${file.name} did not arrive intact; try again.`);
  }
}

/**
 * Downloads both files, the runtime first and the model last (so the pair
 * counts as downloaded exactly when it is whole), reporting the bytes of both
 * together. Files of an earlier version are dropped first.
 */
export async function fetchMaia(
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
  urls: MaiaUrls = maiaUrls(),
): Promise<void> {
  if (!canStoreMaia()) throw new Error('This browser cannot keep files offline.');
  const cache = await caches.open(MAIA_CACHE);
  for (const request of await cache.keys()) {
    if (!isCurrentMaiaFile(new URL(request.url).pathname)) await cache.delete(request);
  }
  const total = MAIA_FILES.runtime.bytes + MAIA_FILES.model.bytes;
  onProgress(0, total);
  await fetchFile(cache, urls.runtimeUrl, MAIA_FILES.runtime, (n) => onProgress(n, total), signal);
  await fetchFile(
    cache,
    urls.modelUrl,
    MAIA_FILES.model,
    (n) => onProgress(MAIA_FILES.runtime.bytes + n, total),
    signal,
  );
}

/** Deletes the files from the device (and stops the model). True when something went. */
export async function removeMaia(): Promise<boolean> {
  maiaClient().dispose();
  if (typeof caches === 'undefined') return false;
  try {
    return await caches.delete(MAIA_CACHE);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* The download task, which outlives the page that started it           */
/* ------------------------------------------------------------------ */

export interface MaiaDownloadProgress {
  received: number;
  total: number;
}

interface DownloadTask {
  progress: MaiaDownloadProgress;
  controller: AbortController;
}

let task: DownloadTask | null = null;
/** Bumped when the files come or go, so every view of them looks again. */
let generation = 0;
const listeners = new Set<() => void>();
const NOTIFY_EVERY_MS = 200;
let lastNotified = 0;
let snapshot: { progress: MaiaDownloadProgress | null; generation: number } = {
  progress: null,
  generation,
};

function notify(force = false): void {
  const now = Date.now();
  if (!force && now - lastNotified < NOTIFY_EVERY_MS) return;
  lastNotified = now;
  snapshot = { progress: task ? { ...task.progress } : null, generation };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Starts the download unless one is running; the result is announced once, wherever the learner is. */
export function startMaiaDownload(onDone?: (stored: boolean) => void): void {
  if (task) return;
  const controller = new AbortController();
  task = { progress: { received: 0, total: 0 }, controller };
  notify(true);
  void (async () => {
    try {
      await fetchMaia((received, total) => {
        if (task) task.progress = { received, total };
        notify();
      }, controller.signal);
      onDone?.(true);
      toast('The human-like opponent is ready, and kept on this device for offline play.', {
        tone: 'success',
      });
    } catch (err) {
      onDone?.(false);
      if (!controller.signal.aborted) {
        toast(`The download stopped: ${describeFailure(err)}`, { tone: 'warning' });
      }
    } finally {
      task = null;
      generation++;
      notify(true);
    }
  })();
}

/** Stops the running download (what arrived so far is not kept). */
export function stopMaiaDownload(): void {
  task?.controller.abort();
}

export interface MaiaDownloadState {
  /** Whether the files are on the device; null while that is being looked up. */
  downloaded: boolean | null;
  /** The running download, if any. */
  progress: MaiaDownloadProgress | null;
  canStore: boolean;
  start: () => void;
  stop: () => void;
  /** Deletes the files; resolves to whether there was anything to delete. */
  remove: () => Promise<boolean>;
}

/** The files' state for a view: downloaded or not, the running download, and what can be done. */
export function useMaiaDownload(): MaiaDownloadState {
  const { progress, generation: gen } = useSyncExternalStore(subscribe, () => snapshot);
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void isMaiaDownloaded().then((stored) => {
      if (live) setDownloaded(stored);
    });
    return () => {
      live = false;
    };
  }, [gen]);
  const remove = useCallback(async () => {
    const removed = await removeMaia();
    generation++;
    notify(true);
    return removed;
  }, []);
  return {
    downloaded,
    progress,
    canStore: canStoreMaia(),
    start: () => startMaiaDownload(),
    stop: stopMaiaDownload,
    remove,
  };
}

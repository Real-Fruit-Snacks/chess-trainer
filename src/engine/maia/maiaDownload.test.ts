import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Two small files stand in for the model and the runtime (the real ones are 25 MB). */
const files = vi.hoisted(() => {
  const runtime = new Uint8Array([0, 97, 115, 109, 1, 0]);
  const model = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1, 0, 9]);
  return { runtime, model };
});
const digests = vi.hoisted(() => ({ runtime: '', model: '' }));

vi.mock('@/sw/maiaFiles', () => ({
  MAIA_CACHE: 'chess-trainer-maia',
  MAIA_DIR: 'maia/',
  get MAIA_FILES() {
    return {
      runtime: { name: 'ort-9.9.9-simd-threaded.wasm', bytes: 6, sha256: digests.runtime },
      model: { name: 'maia3-test.onnx', bytes: 10, sha256: digests.model },
    };
  },
  MAIA_TOTAL_BYTES: 16,
  isCurrentMaiaFile: (path: string) =>
    path.endsWith('/ort-9.9.9-simd-threaded.wasm') || path.endsWith('/maia3-test.onnx'),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toastStore', () => ({ toast }));

import {
  canStoreMaia,
  fetchMaia,
  isMaiaDownloaded,
  removeMaia,
  startMaiaDownload,
  stopMaiaDownload,
  useMaiaDownload,
} from './maiaDownload';

const URLS = {
  runtimeUrl: 'http://localhost:3000/maia/ort-9.9.9-simd-threaded.wasm',
  modelUrl: 'http://localhost:3000/maia/maia3-test.onnx',
};

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cache Storage with one cache that keeps real bodies (as the browser does, once read to the end). */
function fakeCaches(initial: Record<string, Uint8Array> = {}) {
  const stored = new Map<string, Uint8Array>(Object.entries(initial));
  let exists = stored.size > 0;
  const cache = {
    keys: () => Promise.resolve([...stored.keys()].map((url) => new Request(url))),
    match: (url: string) => {
      const body = stored.get(url);
      return Promise.resolve(body ? new Response(body.slice()) : undefined);
    },
    put: async (url: string, response: Response) => {
      stored.set(url, new Uint8Array(await response.arrayBuffer()));
    },
    delete: (input: string | Request) =>
      Promise.resolve(stored.delete(typeof input === 'string' ? input : input.url)),
  };
  const storage = {
    has: (name: string) => Promise.resolve(exists && name === 'chess-trainer-maia'),
    open: (name: string) => {
      if (name !== 'chess-trainer-maia') return Promise.reject(new Error(name));
      exists = true;
      return Promise.resolve(cache);
    },
    delete: (name: string) => {
      const had = exists && name === 'chess-trainer-maia';
      if (had) stored.clear();
      exists = false;
      return Promise.resolve(had);
    },
  };
  return { stored, storage };
}

/** Serves the files, in chunks, or something else in their place. */
function fakeFetch(body: (url: string) => Uint8Array | null) {
  return vi.fn((url: string) => {
    const data = body(url);
    if (!data) return Promise.resolve(new Response('Not found', { status: 404 }));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data.slice(0, 3));
        controller.enqueue(data.slice(3));
        controller.close();
      },
    });
    return Promise.resolve(new Response(stream));
  });
}

const serveTheFiles = (url: string) =>
  url === URLS.runtimeUrl ? files.runtime : url === URLS.modelUrl ? files.model : null;

beforeEach(async () => {
  digests.runtime = await sha256(files.runtime);
  digests.model = await sha256(files.model);
  toast.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the human-like opponent’s files', () => {
  it('download into their cache, the runtime first, counting the bytes of both', async () => {
    const { stored, storage } = fakeCaches();
    vi.stubGlobal('caches', storage);
    const fetchSpy = fakeFetch(serveTheFiles);
    vi.stubGlobal('fetch', fetchSpy);
    expect(canStoreMaia()).toBe(true);
    expect(await isMaiaDownloaded(URLS)).toBe(false);

    const progress: [number, number][] = [];
    await fetchMaia((received, total) => progress.push([received, total]), undefined, URLS);
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([URLS.runtimeUrl, URLS.modelUrl]);
    expect(progress[0]).toEqual([0, 16]);
    expect(progress.at(-1)).toEqual([16, 16]);
    expect(progress.map(([n]) => n)).toEqual([...progress.map(([n]) => n)].sort((a, b) => a - b));
    expect(stored.get(URLS.modelUrl)).toEqual(files.model);
    expect(await isMaiaDownloaded(URLS)).toBe(true);
  });

  it('refuses a file that is not exactly the pinned one, and keeps nothing of it', async () => {
    const { stored, storage } = fakeCaches();
    vi.stubGlobal('caches', storage);
    // A captive portal answers the model's address with a page of its own.
    vi.stubGlobal(
      'fetch',
      fakeFetch((url) =>
        url === URLS.modelUrl ? new Uint8Array(10).fill(60) : serveTheFiles(url),
      ),
    );
    await expect(fetchMaia(() => undefined, undefined, URLS)).rejects.toThrow(
      'maia3-test.onnx did not arrive intact',
    );
    expect(stored.has(URLS.modelUrl)).toBe(false);
    expect(await isMaiaDownloaded(URLS)).toBe(false);

    vi.stubGlobal(
      'fetch',
      fakeFetch(() => null),
    );
    await expect(fetchMaia(() => undefined, undefined, URLS)).rejects.toThrow('HTTP 404');
  });

  it('drops the files of an earlier version before downloading these', async () => {
    const stale = 'http://localhost:3000/maia/ort-1.0.0-simd-threaded.wasm';
    const { stored, storage } = fakeCaches({ [stale]: new Uint8Array(4) });
    vi.stubGlobal('caches', storage);
    vi.stubGlobal('fetch', fakeFetch(serveTheFiles));
    await fetchMaia(() => undefined, undefined, URLS);
    expect(stored.has(stale)).toBe(false);
    expect(stored.size).toBe(2);
  });

  it('are deleted on request, and cannot be kept without the Cache API', async () => {
    const { storage } = fakeCaches({
      [URLS.runtimeUrl]: files.runtime,
      [URLS.modelUrl]: files.model,
    });
    vi.stubGlobal('caches', storage);
    expect(await isMaiaDownloaded(URLS)).toBe(true);
    expect(await removeMaia()).toBe(true);
    expect(await isMaiaDownloaded(URLS)).toBe(false);
    expect(await removeMaia()).toBe(false);

    vi.stubGlobal('caches', undefined);
    expect(canStoreMaia()).toBe(false);
    expect(await isMaiaDownloaded(URLS)).toBe(false);
    await expect(fetchMaia(() => undefined, undefined, URLS)).rejects.toThrow('offline');
  });
});

describe('useMaiaDownload', () => {
  it('shows a download through, and the files gone again after Delete', async () => {
    // The hook looks for the files where the app serves them (the test page's base path).
    const base = new URL(`${import.meta.env.BASE_URL}maia/`, location.href);
    const urls = {
      runtimeUrl: new URL('ort-9.9.9-simd-threaded.wasm', base).href,
      modelUrl: new URL('maia3-test.onnx', base).href,
    };
    const { storage } = fakeCaches();
    vi.stubGlobal('caches', storage);
    vi.stubGlobal(
      'fetch',
      fakeFetch((url) =>
        url === urls.runtimeUrl ? files.runtime : url === urls.modelUrl ? files.model : null,
      ),
    );
    const { result } = renderHook(() => useMaiaDownload());
    await waitFor(() => expect(result.current.downloaded).toBe(false));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.downloaded).toBe(true));
    expect(result.current.progress).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('ready'), { tone: 'success' });

    await act(async () => {
      expect(await result.current.remove()).toBe(true);
    });
    await waitFor(() => expect(result.current.downloaded).toBe(false));
  });

  it('says why a download stopped, but not when the learner stopped it', async () => {
    const { storage } = fakeCaches();
    vi.stubGlobal('caches', storage);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const done = vi.fn();
    startMaiaDownload(done);
    await waitFor(() => expect(done).toHaveBeenCalledWith(false));
    expect(toast).toHaveBeenCalledWith('The download stopped: the network could not be reached.', {
      tone: 'warning',
    });

    toast.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            const abort = () =>
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            // Like fetch: a signal aborted before the call rejects at once.
            if (init?.signal?.aborted) abort();
            init?.signal?.addEventListener('abort', abort);
          }),
      ),
    );
    const stopped = vi.fn();
    startMaiaDownload(stopped);
    stopMaiaDownload();
    await waitFor(() => expect(stopped).toHaveBeenCalledWith(false));
    expect(toast).not.toHaveBeenCalled();
  });
});

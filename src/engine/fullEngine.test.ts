import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_CACHE, ENGINE_DOWNLOAD_HEADER, ENGINE_FILES } from '@/sw/engineFiles';
import { ENGINE_BUILD_URLS, ENGINE_WASM_URLS } from './build';
import { fetchBuild, isBuildAvailable, isBuildDownloaded, removeFullEngine } from './fullEngine';

/** A Cache API with one cache (the engine's), holding the given URLs. */
function fakeCaches(stored: string[], exists = true) {
  const urls = new Set(stored);
  /** What `put` stored: the body's type and size, once the body was read to the end. */
  const bodies = new Map<string, { type: string | null; bytes: number }>();
  const cache = {
    delete: vi.fn((url: string) => Promise.resolve(urls.delete(url))),
    // Like the real one: the entry exists only once the whole body has been read.
    put: vi.fn(async (url: string, response: Response) => {
      const body = await response.arrayBuffer();
      urls.add(url);
      bodies.set(url, { type: response.headers.get('Content-Type'), bytes: body.byteLength });
    }),
  };
  return {
    urls,
    bodies,
    cache,
    storage: {
      match: (url: string) => Promise.resolve(urls.has(url) ? new Response('x') : undefined),
      has: (name: string) => Promise.resolve(exists && name === ENGINE_CACHE),
      open: vi.fn((name: string) =>
        name === ENGINE_CACHE ? Promise.resolve(cache) : Promise.reject(new Error(name)),
      ),
    },
  };
}

/** A response whose body arrives in the given chunks. */
function streamed(chunks: number[], headers: Record<string, string>) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size));
      controller.close();
    },
  });
  return new Response(body, { headers });
}

const SCRIPT = { 'Content-Type': 'text/javascript' };
const WASM = { 'Content-Type': 'application/wasm' };

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('isBuildDownloaded', () => {
  it('needs both files of the build', async () => {
    const full = [ENGINE_BUILD_URLS['full-multi'], ENGINE_WASM_URLS['full-multi']];
    vi.stubGlobal('caches', fakeCaches(full).storage);
    expect(await isBuildDownloaded('full-multi')).toBe(true);
    expect(await isBuildDownloaded('full-single')).toBe(false);
    vi.stubGlobal('caches', fakeCaches(full.slice(1)).storage);
    expect(await isBuildDownloaded('full-multi')).toBe(false);
  });

  it('is false without a Cache API, or when it fails', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await isBuildDownloaded('full-multi')).toBe(false);
    vi.stubGlobal('caches', { match: () => Promise.reject(new Error('SecurityError')) });
    expect(await isBuildDownloaded('full-multi')).toBe(false);
  });
});

describe('isBuildAvailable', () => {
  it('needs the files stored and the page served by the service worker', async () => {
    const full = [ENGINE_BUILD_URLS['full-multi'], ENGINE_WASM_URLS['full-multi']];
    vi.stubGlobal('caches', fakeCaches(full).storage);
    // jsdom has no service worker: a page loaded past it would fetch the engine from the network.
    expect(await isBuildAvailable('full-multi')).toBe(false);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: {} },
    });
    expect(await isBuildAvailable('full-multi')).toBe(true);
    expect(await isBuildAvailable('full-single')).toBe(false);
  });
});

describe('fetchBuild', () => {
  it('downloads past the service worker and stores both files, the binary last', async () => {
    const fake = fakeCaches([]);
    vi.stubGlobal('caches', fake.storage);
    const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
      Promise.resolve(
        url.endsWith('.js')
          ? new Response('glue', { headers: SCRIPT })
          : streamed([3, 3], { ...WASM, 'Content-Length': '6' }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const progress: [number, number][] = [];
    const controller = new AbortController();
    await fetchBuild('full-multi', (r, t) => progress.push([r, t]), controller.signal);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      ENGINE_BUILD_URLS['full-multi'],
      ENGINE_WASM_URLS['full-multi'],
    ]);
    // Marked for the service worker to leave alone, and kept out of the HTTP cache.
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      signal: controller.signal,
      cache: 'no-store',
      headers: { [ENGINE_DOWNLOAD_HEADER]: '1' },
    });
    expect(progress).toEqual([
      [0, 6],
      [3, 6],
      [6, 6],
    ]);
    expect(fake.cache.put.mock.calls.map((c) => c[0])).toEqual([
      ENGINE_BUILD_URLS['full-multi'],
      ENGINE_WASM_URLS['full-multi'],
    ]);
    expect(fake.bodies.get(ENGINE_WASM_URLS['full-multi'])).toEqual({
      type: 'application/wasm',
      bytes: 6,
    });
    expect(fake.bodies.get(ENGINE_BUILD_URLS['full-multi'])?.type).toBe('text/javascript');
  });

  it('leaves no binary behind when stopped half-way', async () => {
    const fake = fakeCaches([]);
    vi.stubGlobal('caches', fake.storage);
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('.js')) return Promise.resolve(new Response('glue', { headers: SCRIPT }));
        // A body that delivers one chunk, then fails the way an aborted fetch does.
        const body = new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(new Uint8Array(3));
          },
          pull(stream) {
            controller.abort();
            stream.error(new DOMException('The operation was aborted.', 'AbortError'));
          },
        });
        return Promise.resolve(new Response(body, { headers: { ...WASM, 'Content-Length': '6' } }));
      }),
    );
    await expect(
      fetchBuild('full-multi', () => undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.urls.has(ENGINE_WASM_URLS['full-multi'])).toBe(false);
    expect(await isBuildDownloaded('full-multi')).toBe(false);
  });

  it('measures a compressed response against the known size', async () => {
    vi.stubGlobal('caches', fakeCaches([]).storage);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('.js')
            ? new Response('glue', { headers: SCRIPT })
            : streamed([4], { ...WASM, 'Content-Length': '2', 'Content-Encoding': 'gzip' }),
        ),
      ),
    );
    const totals = new Set<number>();
    await fetchBuild('full-single', (_, t) => totals.add(t));
    expect([...totals]).toEqual([ENGINE_FILES['full-single'].wasmBytes]);
  });

  it('refuses an HTTP error or a page of the wrong type, storing nothing', async () => {
    const fake = fakeCaches([]);
    vi.stubGlobal('caches', fake.storage);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 404 }))),
    );
    await expect(fetchBuild('full-multi', () => undefined)).rejects.toThrow(
      'The engine script could not be fetched (HTTP 404).',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('.js')
            ? new Response('glue', { headers: SCRIPT })
            : new Response('gone', { status: 503 }),
        ),
      ),
    );
    await expect(fetchBuild('full-multi', () => undefined)).rejects.toThrow(
      'The engine could not be fetched (HTTP 503).',
    );
    // A captive portal answers 200 with its own page.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }),
        ),
      ),
    );
    await expect(fetchBuild('full-multi', () => undefined)).rejects.toThrow(
      'The engine script could not be fetched (HTTP 200).',
    );
    expect(fake.cache.put).not.toHaveBeenCalled();
  });

  it('needs the Cache API', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(fetchBuild('full-multi', () => undefined)).rejects.toThrow(
      'This browser cannot keep files offline.',
    );
  });
});

describe('removeFullEngine', () => {
  const all = (build: 'full-single' | 'full-multi') => [
    ENGINE_BUILD_URLS[build],
    ENGINE_WASM_URLS[build],
  ];

  it('deletes both full builds and leaves the lite ones', async () => {
    const lite = [ENGINE_BUILD_URLS.multi, ENGINE_WASM_URLS.multi];
    const fake = fakeCaches([...all('full-single'), ...all('full-multi'), ...lite]);
    vi.stubGlobal('caches', fake.storage);
    expect(await removeFullEngine()).toBe(true);
    expect([...fake.urls]).toEqual(lite);
    expect(await removeFullEngine()).toBe(false);
  });

  it('keeps the build just downloaded', async () => {
    const fake = fakeCaches([...all('full-single'), ...all('full-multi')]);
    vi.stubGlobal('caches', fake.storage);
    expect(await removeFullEngine('full-multi')).toBe(true);
    expect([...fake.urls]).toEqual(all('full-multi'));
  });

  it('does not create the engine cache when there is none', async () => {
    const fake = fakeCaches([], false);
    vi.stubGlobal('caches', fake.storage);
    expect(await removeFullEngine()).toBe(false);
    expect(fake.storage.open).not.toHaveBeenCalled();
    vi.stubGlobal('caches', undefined);
    expect(await removeFullEngine()).toBe(false);
  });
});

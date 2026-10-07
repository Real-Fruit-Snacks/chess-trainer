/**
 * A minimal Cache API (`caches.open` → match, put, delete, keys), shared the
 * way the real one is shared between the tabs of an origin. `failPuts` makes
 * every put throw, as a full disk does; `hangPuts` makes puts never finish
 * (the page closing in the middle of one); `onPut` decides put by put.
 */
export interface FakeCaches {
  entries: Map<string, Uint8Array>;
  failPuts: boolean;
  hangPuts: boolean;
  onPut: ((url: string) => 'fail' | 'hang' | undefined) | null;
  /** Puts finished so far. */
  puts: number;
  api: CacheStorage;
}

export function fakeCaches(): FakeCaches {
  const entries = new Map<string, Uint8Array>();
  const key = (request: RequestInfo | URL) =>
    typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
  const state: FakeCaches = {
    entries,
    failPuts: false,
    hangPuts: false,
    onPut: null,
    puts: 0,
    api: undefined as unknown as CacheStorage,
  };
  const cache = {
    match: (request: RequestInfo | URL) => {
      const bytes = entries.get(key(request));
      return Promise.resolve(bytes ? new Response(bytes.slice()) : undefined);
    },
    put: async (request: RequestInfo | URL, response: Response) => {
      const decided = state.onPut?.(key(request));
      if (decided === 'fail') {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      if (decided === 'hang') return new Promise<void>(() => undefined);
      if (state.failPuts) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      if (state.hangPuts) return new Promise<void>(() => undefined);
      entries.set(key(request), new Uint8Array(await response.arrayBuffer()));
      state.puts++;
    },
    delete: (request: RequestInfo | URL) => Promise.resolve(entries.delete(key(request))),
    keys: () => Promise.resolve([...entries.keys()].map((url) => new Request(url))),
  };
  state.api = { open: () => Promise.resolve(cache) } as unknown as CacheStorage;
  return state;
}

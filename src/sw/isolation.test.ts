import { describe, expect, it } from 'vitest';
import {
  ISOLATION_FLAG_URL,
  ISOLATION_HEADERS,
  readIsolationFlag,
  withIsolationHeaders,
  writeIsolationFlag,
} from './isolation';

/** Minimal in-memory CacheStorage: enough for open/match/put. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    stores,
    open: (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return Promise.resolve({
        match: (url: string) => Promise.resolve(store.get(url)?.clone()),
        put: (url: string, response: Response) => {
          store.set(url, response);
          return Promise.resolve();
        },
      } as unknown as Cache);
    },
  };
}

describe('isolation flag', () => {
  it('is off until written, then round-trips', async () => {
    const caches = fakeCaches();
    expect(await readIsolationFlag(caches)).toBe(false);
    expect(await writeIsolationFlag(true, caches)).toBe(true);
    expect(await readIsolationFlag(caches)).toBe(true);
    await writeIsolationFlag(false, caches);
    expect(await readIsolationFlag(caches)).toBe(false);
    expect([...(caches.stores.values().next().value ?? new Map()).keys()]).toEqual([
      ISOLATION_FLAG_URL,
    ]);
  });

  it('never lets a read that started first return the value a later write replaced', async () => {
    // A cache whose lookups are slow: `match` sees the store as it was when called.
    const store = new Map<string, string>([[ISOLATION_FLAG_URL, '1']]);
    const slow = {
      open: () =>
        Promise.resolve({
          match: (url: string) => {
            const seen = store.get(url);
            return new Promise((resolve) =>
              setTimeout(() => resolve(seen === undefined ? undefined : new Response(seen)), 20),
            );
          },
          put: async (url: string, response: Response) => {
            store.set(url, await response.text());
          },
        } as unknown as Cache),
    };
    const read = readIsolationFlag(slow);
    const write = writeIsolationFlag(false, slow);
    const readAfter = readIsolationFlag(slow);
    expect(await read).toBe(true);
    expect(await write).toBe(true);
    expect(await readAfter).toBe(false);
    expect(store.get(ISOLATION_FLAG_URL)).toBe('0');
  });

  it('degrades gracefully without the Cache API', async () => {
    expect(await readIsolationFlag(null)).toBe(false);
    expect(await writeIsolationFlag(true, null)).toBe(false);
    const broken = {
      open: () => Promise.reject(new Error('quota')),
    };
    expect(await readIsolationFlag(broken)).toBe(false);
    expect(await writeIsolationFlag(true, broken)).toBe(false);
  });
});

describe('isolation headers', () => {
  it('adds COOP and COEP while keeping the body, status and other headers', async () => {
    const original = new Response('<html></html>', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/html', 'X-Test': 'yes' },
    });
    const isolated = withIsolationHeaders(original);
    expect(isolated).not.toBe(original);
    expect(isolated.status).toBe(200);
    expect(isolated.headers.get('Content-Type')).toBe('text/html');
    expect(isolated.headers.get('X-Test')).toBe('yes');
    for (const [name, value] of Object.entries(ISOLATION_HEADERS)) {
      expect(isolated.headers.get(name)).toBe(value);
    }
    expect(isolated.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(await isolated.text()).toBe('<html></html>');
  });

  it('leaves opaque responses alone', () => {
    const opaque = Response.error();
    expect(withIsolationHeaders(opaque)).toBe(opaque);
  });
});

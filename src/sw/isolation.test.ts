import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ISOLATION_CHANGED_MESSAGE,
  ISOLATION_DEFAULT,
  ISOLATION_FLAG_URL,
  ISOLATION_HEADERS,
  readIsolationFlag,
  resetIsolationFlag,
  syncIsolationFlag,
  withIsolationHeaders,
  writeIsolationFlag,
} from './isolation';

/** Minimal in-memory CacheStorage: enough for open/match/put/delete. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const puts: string[] = [];
  return {
    stores,
    /** The values written, in order. */
    puts,
    open: (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return Promise.resolve({
        match: (url: string) => Promise.resolve(store.get(url)?.clone()),
        put: async (url: string, response: Response) => {
          puts.push(await response.clone().text());
          store.set(url, response);
        },
        delete: (url: string) => Promise.resolve(store.delete(url)),
      } as unknown as Cache);
    },
  };
}

describe('isolation flag', () => {
  it('is on until the learner says otherwise, then round-trips', async () => {
    expect(ISOLATION_DEFAULT).toBe(true);
    const caches = fakeCaches();
    expect(await readIsolationFlag(caches)).toBe(true);
    expect(await writeIsolationFlag(false, caches)).toBe(true);
    expect(await readIsolationFlag(caches)).toBe(false);
    await writeIsolationFlag(true, caches);
    expect(await readIsolationFlag(caches)).toBe(true);
    expect([...(caches.stores.values().next().value ?? new Map()).keys()]).toEqual([
      ISOLATION_FLAG_URL,
    ]);
  });

  it('goes back to the default on reset', async () => {
    const caches = fakeCaches();
    await writeIsolationFlag(false, caches);
    expect(await resetIsolationFlag(caches)).toBe(true);
    expect(await readIsolationFlag(caches)).toBe(true);
    expect(await resetIsolationFlag(null)).toBe(false);
  });

  it('syncs to the setting, writing only when they differ', async () => {
    const caches = fakeCaches();
    // Nothing stored means on: a setting that is on needs no write.
    expect(await syncIsolationFlag(true, caches)).toBe(false);
    expect(caches.puts).toEqual([]);
    expect(await syncIsolationFlag(false, caches)).toBe(true);
    expect(await syncIsolationFlag(false, caches)).toBe(false);
    expect(await syncIsolationFlag(true, caches)).toBe(true);
    expect(caches.puts).toEqual(['0', '1']);
    expect(await readIsolationFlag(caches)).toBe(true);
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
    // Nothing can be read: the default applies (the service worker has caches anyway).
    expect(await readIsolationFlag(null)).toBe(true);
    expect(await writeIsolationFlag(false, null)).toBe(false);
    expect(await syncIsolationFlag(false, null)).toBe(false);
    const broken = {
      open: () => Promise.reject(new Error('quota')),
    };
    expect(await readIsolationFlag(broken)).toBe(true);
    expect(await writeIsolationFlag(false, broken)).toBe(false);
    expect(await resetIsolationFlag(broken)).toBe(false);
  });
});

describe('telling the service worker', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('posts the new value on a write, and "read it again" on a reset', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: { postMessage } },
    });
    const caches = fakeCaches();
    await writeIsolationFlag(false, caches);
    await resetIsolationFlag(caches);
    expect(postMessage.mock.calls).toEqual([
      [{ type: ISOLATION_CHANGED_MESSAGE, enabled: false }],
      [{ type: ISOLATION_CHANGED_MESSAGE, enabled: undefined }],
    ]);
  });

  it('writes the flag even when no worker controls the page', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null },
    });
    const caches = fakeCaches();
    expect(await writeIsolationFlag(false, caches)).toBe(true);
    expect(await readIsolationFlag(caches)).toBe(false);
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

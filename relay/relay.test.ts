// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { d1Store, fromBase64, toBase64 } from './src/d1Store.mjs';
import {
  createRelay,
  expireVaults,
  hashToken,
  KEEP_UNUSED_MS,
  type VaultStore,
} from './src/handler.mjs';
import { memoryStore } from './src/memoryStore.mjs';
import { nodeServer } from './src/server.mjs';
import { sqliteStore } from './src/sqliteStore.mjs';
import worker from './src/worker.mjs';

/** A stand-in for a D1 binding over node:sqlite, answering as D1 does (BLOBs as number arrays). */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        first() {
          const row = db.prepare(sql).get(...(params as never[]));
          return Promise.resolve(row ?? null);
        },
        run() {
          const result = db.prepare(sql).run(...(params as never[]));
          return Promise.resolve({ success: true, meta: { changes: Number(result.changes) } });
        },
      };
      return statement;
    },
  };
}

const ID = 'a'.repeat(43);
const TOKEN = 'T'.repeat(43);
const OTHER = 'U'.repeat(43);
const URL_BASE = 'https://relay.test';

function request(
  method: string,
  path: string,
  {
    token = TOKEN,
    body,
    headers = {},
  }: {
    token?: string | null;
    body?: Uint8Array<ArrayBuffer>;
    headers?: Record<string, string>;
  } = {},
) {
  return new Request(`${URL_BASE}${path}`, {
    method,
    body: body ?? null,
    headers: {
      Origin: 'https://app.test',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
}

const bytes = (...values: number[]) => new Uint8Array(values);

const stores: [string, () => VaultStore][] = [
  ['memory', () => memoryStore()],
  ['sqlite', () => sqliteStore(':memory:')],
  ['d1', () => d1Store(fakeD1())],
];

/** A body that arrives in pieces, with no Content-Length to go by. */
function streamed(...pieces: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const size of pieces) controller.enqueue(new Uint8Array(size).fill(7));
      controller.close();
    },
  });
}

describe.each(stores)('the relay over the %s store', (_name, makeStore) => {
  function setup(
    options: {
      maxBytes?: number;
      allowedOrigins?: string[];
      allowCreate?: (request: Request) => boolean;
    } = {},
  ) {
    let clock = 1_000_000;
    const store = makeStore();
    const relay = createRelay({ store, now: () => clock, ...options });
    return {
      relay,
      store,
      tick: (ms: number) => {
        clock += ms;
      },
      time: () => clock,
    };
  }

  it('answers its health check and CORS preflights', async () => {
    const { relay } = setup({ maxBytes: 1000 });
    const health = await relay(request('GET', '/v1/health', { token: null }));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, maxBytes: 1000 });
    const preflight = await relay(request('OPTIONS', `/v1/vaults/${ID}`, { token: null }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('If-Match');
    expect(preflight.headers.get('Access-Control-Expose-Headers')).toContain('ETag');
  });

  it('answers only the listed origins when there is a list', async () => {
    const { relay } = setup({ allowedOrigins: ['https://app.test'] });
    const ours = await relay(request('GET', '/v1/health', { token: null }));
    expect(ours.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    const theirs = await relay(
      request('GET', '/v1/health', { token: null, headers: { Origin: 'https://evil.test' } }),
    );
    expect(theirs.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('creates a vault once, then serves it to its token only', async () => {
    const { relay } = setup();
    const create = () =>
      relay(
        request('PUT', `/v1/vaults/${ID}`, {
          body: bytes(1, 2, 3),
          headers: { 'If-None-Match': '*' },
        }),
      );
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.headers.get('ETag')).toBe('"1"');
    const again = await create();
    expect(again.status).toBe(412);
    expect(again.headers.get('ETag')).toBe('"1"');

    expect((await relay(request('GET', `/v1/vaults/${ID}`, { token: null }))).status).toBe(401);
    expect((await relay(request('GET', `/v1/vaults/${ID}`, { token: OTHER }))).status).toBe(403);
    const read = await relay(request('GET', `/v1/vaults/${ID}`));
    expect(read.status).toBe(200);
    expect(read.headers.get('ETag')).toBe('"1"');
    expect(read.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes(1, 2, 3));
    const unchanged = await relay(
      request('GET', `/v1/vaults/${ID}`, { headers: { 'X-Known-Version': '"1"' } }),
    );
    expect(unchanged.status).toBe(204);
    expect((await relay(request('GET', `/v1/vaults/${'b'.repeat(43)}`))).status).toBe(404);
  });

  it('replaces a vault only from the version it was read at', async () => {
    const { relay, tick } = setup();
    await relay(
      request('PUT', `/v1/vaults/${ID}`, { body: bytes(1), headers: { 'If-None-Match': '*' } }),
    );
    tick(5_000);
    const put = (version: string, body = bytes(2), token = TOKEN) =>
      relay(request('PUT', `/v1/vaults/${ID}`, { token, body, headers: { 'If-Match': version } }));
    expect((await relay(request('PUT', `/v1/vaults/${ID}`, { body: bytes(2) }))).status).toBe(428);
    expect((await put('"1"', bytes(2), OTHER)).status).toBe(403);
    const updated = await put('"1"');
    expect(updated.status).toBe(200);
    expect(updated.headers.get('ETag')).toBe('"2"');
    tick(5_000);
    const stale = await put('"1"', bytes(3));
    expect(stale.status).toBe(412);
    expect(stale.headers.get('ETag')).toBe('"2"');
    // Writes come no faster than one a second.
    tick(5_000);
    expect((await put('"2"', bytes(3))).status).toBe(200);
    const tooSoon = await put('"3"', bytes(4));
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.headers.get('Retry-After')).toBe('1');
    const read = await relay(request('GET', `/v1/vaults/${ID}`));
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes(3));
  });

  it('refuses vaults that are too big or empty, and requests it does not know', async () => {
    const { relay } = setup({ maxBytes: 4 });
    const put = (body: Uint8Array<ArrayBuffer>) =>
      relay(request('PUT', `/v1/vaults/${ID}`, { body, headers: { 'If-None-Match': '*' } }));
    expect((await put(bytes(1, 2, 3, 4, 5))).status).toBe(413);
    expect((await put(bytes())).status).toBe(400);
    expect((await relay(request('GET', '/v1/vaults/short'))).status).toBe(400);
    expect((await relay(request('GET', '/elsewhere'))).status).toBe(404);
    expect((await relay(request('POST', `/v1/vaults/${ID}`))).status).toBe(405);
    expect((await relay(request('GET', `/v1/vaults/${ID}`, { token: 'short' }))).status).toBe(401);
  });

  it('stops reading a body as soon as it is too big, even without a Content-Length', async () => {
    const { relay, store } = setup({ maxBytes: 10 });
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(4));
      },
    });
    const put = (body: ReadableStream<Uint8Array>) =>
      relay(
        new Request(`${URL_BASE}/v1/vaults/${ID}`, {
          method: 'PUT',
          body,
          duplex: 'half',
          headers: { Authorization: `Bearer ${TOKEN}`, 'If-None-Match': '*' },
        } as RequestInit),
      );
    expect((await put(endless)).status).toBe(413);
    expect(pulled).toBeLessThan(10);
    expect(await store.get(ID)).toBeNull();
    // Pieces that add up to the limit are kept whole.
    expect((await put(streamed(4, 4, 2))).status).toBe(201);
    expect((await store.get(ID))?.data.byteLength).toBe(10);
  });

  it('asks before creating a vault, when told to (a limit on new vaults per address)', async () => {
    let allow = false;
    const { relay, tick } = setup({ allowCreate: () => allow });
    const create = () =>
      relay(
        request('PUT', `/v1/vaults/${ID}`, { body: bytes(1), headers: { 'If-None-Match': '*' } }),
      );
    const refused = await create();
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe('60');
    allow = true;
    expect((await create()).status).toBe(201);
    // Replacing a vault is not creating one.
    allow = false;
    tick(1_000);
    const replaced = await relay(
      request('PUT', `/v1/vaults/${ID}`, { body: bytes(2), headers: { 'If-Match': '"1"' } }),
    );
    expect(replaced.status).toBe(200);
  });

  it('deletes a vault for its token only', async () => {
    const { relay } = setup();
    await relay(
      request('PUT', `/v1/vaults/${ID}`, { body: bytes(1), headers: { 'If-None-Match': '*' } }),
    );
    expect((await relay(request('DELETE', `/v1/vaults/${ID}`, { token: OTHER }))).status).toBe(403);
    expect((await relay(request('DELETE', `/v1/vaults/${ID}`))).status).toBe(204);
    expect((await relay(request('GET', `/v1/vaults/${ID}`))).status).toBe(404);
    expect((await relay(request('DELETE', `/v1/vaults/${ID}`))).status).toBe(204);
  });

  it('forgets vaults unused for a year; reading one counts as use', async () => {
    const { relay, store, tick, time } = setup();
    const quiet = 'q'.repeat(43);
    const read = 'r'.repeat(43);
    for (const id of [quiet, read]) {
      await relay(
        request('PUT', `/v1/vaults/${id}`, { body: bytes(1), headers: { 'If-None-Match': '*' } }),
      );
    }
    tick(KEEP_UNUSED_MS - 10 * 24 * 60 * 60 * 1000);
    await relay(request('GET', `/v1/vaults/${read}`));
    tick(20 * 24 * 60 * 60 * 1000);
    expect(await expireVaults(store, time())).toBe(1);
    expect((await relay(request('GET', `/v1/vaults/${quiet}`))).status).toBe(404);
    expect((await relay(request('GET', `/v1/vaults/${read}`))).status).toBe(200);
  });

  it('stores only the token’s hash', async () => {
    const { relay, store } = setup();
    await relay(
      request('PUT', `/v1/vaults/${ID}`, { body: bytes(9), headers: { 'If-None-Match': '*' } }),
    );
    const vault = await store.get(ID);
    expect(vault?.authHash).toBe(await hashToken(TOKEN));
    expect(vault?.authHash).not.toContain(TOKEN);
  });
});

describe('the relay entry points', () => {
  it('runs as a Worker over D1, and its cron forgets unused vaults', async () => {
    const env = { DB: fakeD1(), ALLOWED_ORIGINS: 'https://app.test' };
    const created = await worker.fetch(
      request('PUT', `/v1/vaults/${ID}`, { body: bytes(1, 2), headers: { 'If-None-Match': '*' } }),
      env,
    );
    expect(created.status).toBe(201);
    expect(created.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    const read = await worker.fetch(request('GET', `/v1/vaults/${ID}`), env);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes(1, 2));
    const waits: Promise<unknown>[] = [];
    worker.scheduled(null, env, { waitUntil: (p: Promise<unknown>) => waits.push(p) });
    expect(await Promise.all(waits)).toEqual([0]);
  });

  it('limits new vaults per address when the Worker has a NEW_VAULTS binding', async () => {
    const keys: string[] = [];
    const env = {
      DB: fakeD1(),
      NEW_VAULTS: {
        limit: ({ key }: { key: string }) => {
          keys.push(key);
          return Promise.resolve({ success: keys.length <= 1 });
        },
      },
    };
    const create = (id: string) =>
      worker.fetch(
        request('PUT', `/v1/vaults/${id}`, {
          body: bytes(1),
          headers: { 'If-None-Match': '*', 'CF-Connecting-IP': '203.0.113.9' },
        }),
        env,
      );
    expect((await create('a'.repeat(43))).status).toBe(201);
    expect((await create('b'.repeat(43))).status).toBe(429);
    expect(keys).toEqual(['203.0.113.9', '203.0.113.9']);
  });

  it('runs as a Node server', async () => {
    const relay = createRelay({ store: memoryStore(), maxBytes: 100 });
    const server = nodeServer(relay, { maxBodyBytes: 100 }).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const base = `http://127.0.0.1:${port}`;
      const created = await fetch(`${base}/v1/vaults/${ID}`, {
        method: 'PUT',
        body: bytes(7, 8, 9),
        headers: { Authorization: `Bearer ${TOKEN}`, 'If-None-Match': '*' },
      });
      expect(created.status).toBe(201);
      const read = await fetch(`${base}/v1/vaults/${ID}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(read.headers.get('etag')).toBe('"1"');
      expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes(7, 8, 9));
      // A body too big is refused, and the server keeps no more of it than the limit.
      const tooBig = await fetch(`${base}/v1/vaults/${'c'.repeat(43)}`, {
        method: 'PUT',
        body: new Uint8Array(200_000),
        headers: { Authorization: `Bearer ${TOKEN}`, 'If-None-Match': '*' },
      });
      expect(tooBig.status).toBe(413);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('keeps bytes intact through base64, large ones included', () => {
    const large = new Uint8Array(300_000).map((_, i) => (i * 31) % 256);
    expect(fromBase64(toBase64(large))).toEqual(large);
  });
});

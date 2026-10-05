import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isTransient,
  LichessError,
  lichessJson,
  lichessNdjson,
  lichessSend,
  lichessText,
  lichessTextStream,
  lichessUrl,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(make: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>((input, init = {}) =>
    Promise.resolve(make(input instanceof Request ? input.url : input.toString(), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A body that arrives in the given pieces. */
function streamed(pieces: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

async function failure(promise: Promise<unknown>): Promise<LichessError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof LichessError) return err;
    throw err;
  }
  throw new Error('expected a failure');
}

describe('Lichess requests', () => {
  it('builds addresses on lichess.org with the query', () => {
    expect(lichessUrl('/api/puzzle/activity', { max: 5, since: undefined, x: true })).toBe(
      'https://lichess.org/api/puzzle/activity?max=5&x=true',
    );
  });

  it('sends the token, a form or JSON, and reads JSON (or nothing) back', async () => {
    const fetchMock = respondWith((url, init) => {
      if (url.endsWith('/empty')) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ ok: init.method }), { status: 200 });
    });
    expect(await lichessJson('/api/x', { token: 'tok', form: { a: '1', b: undefined } })).toEqual({
      ok: 'POST',
    });
    const init = fetchMock.mock.calls[0]?.[1] ?? {};
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).toString()).toBe('a=1');
    expect(init.cache).toBe('no-store');

    await lichessJson('/api/y', { json: { solutions: [] } });
    const second = fetchMock.mock.calls[1]?.[1] ?? {};
    expect(new Headers(second.headers).get('Content-Type')).toBe('application/json');
    expect(second.body).toBe('{"solutions":[]}');

    expect(await lichessJson('/empty')).toBeNull();
    await expect(lichessSend('/empty', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('tells the kinds of failure apart', async () => {
    const statuses: Record<string, Response> = {};
    respondWith((url) => statuses[new URL(url).pathname] ?? new Response('', { status: 500 }));
    statuses['/401'] = new Response('{"error":"No such token"}', { status: 401 });
    statuses['/403'] = new Response('', { status: 403 });
    statuses['/404'] = new Response('{"error":"Not found"}', { status: 404 });
    statuses['/429'] = new Response('', { status: 429, headers: { 'Retry-After': '90' } });
    statuses['/429b'] = new Response('', { status: 429 });
    statuses['/400'] = new Response('{"error":{"pgn":["Too many moves"]}}', { status: 400 });

    expect((await failure(lichessJson('/401'))).kind).toBe('auth');
    expect((await failure(lichessJson('/403'))).kind).toBe('forbidden');
    const notFound = await failure(lichessJson('/404'));
    expect([notFound.kind, notFound.message]).toEqual(['not-found', 'Not found']);
    const slow = await failure(lichessJson('/429'));
    expect([slow.kind, slow.retryAfterSec]).toEqual(['rate-limited', 90]);
    expect((await failure(lichessJson('/429b'))).retryAfterSec).toBe(60);
    const invalid = await failure(lichessJson('/400'));
    expect(invalid.kind).toBe('invalid');
    expect(invalid.message).toContain('Too many moves');
    const server = await failure(lichessJson('/500'));
    expect([server.kind, server.status]).toEqual(['server', 500]);

    expect(isTransient(server)).toBe(true);
    expect(isTransient(slow)).toBe(true);
    expect(isTransient(invalid)).toBe(false);
    expect(isTransient(new Error('x'))).toBe(false);
  });

  it('reports no connection and unreadable answers', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed')));
    expect((await failure(lichessJson('/x'))).kind).toBe('network');
    respondWith(() => new Response('{not json', { status: 200 }));
    expect((await failure(lichessJson('/x'))).kind).toBe('server');
  });

  it('makes one request at a time, failures included', async () => {
    const order: string[] = [];
    let release: (() => void) | null = null;
    respondWith(async (url) => {
      const path = new URL(url).pathname;
      order.push(`start ${path}`);
      if (path === '/slow') await new Promise<void>((resolve) => (release = resolve));
      order.push(`end ${path}`);
      return path === '/bad' ? new Response('', { status: 500 }) : new Response('{}');
    });
    const slow = lichessJson('/slow');
    const bad = lichessJson('/bad').catch(() => 'failed');
    const after = lichessJson('/after');
    await vi.waitFor(() => expect(release).not.toBeNull());
    expect(order).toEqual(['start /slow']);
    (release as unknown as () => void)();
    await Promise.all([slow, bad, after]);
    expect(order).toEqual([
      'start /slow',
      'end /slow',
      'start /bad',
      'end /bad',
      'start /after',
      'end /after',
    ]);
    expect(await bad).toBe('failed');
  });

  it('streams ndjson line by line, across pieces, and stops when asked', async () => {
    respondWith(
      () =>
        new Response(streamed(['{"a":1}\n{"a"', ':2}\n\n{"a":3}\n', '{"a":4}']), {
          status: 200,
        }),
    );
    const seen: unknown[] = [];
    expect(await lichessNdjson('/x', (item) => void seen.push(item))).toBe(4);
    expect(seen).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    respondWith(() => new Response(streamed(['{"a":1}\n{"a":2}\n', '{"a":3}\n']), { status: 200 }));
    const firstTwo: unknown[] = [];
    const count = await lichessNdjson('/x', (item) => {
      firstTwo.push(item);
      return firstTwo.length < 2;
    });
    expect(count).toBe(2);
    expect(firstTwo).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('reads text whole, up to a limit, or piece by piece until told to stop', async () => {
    respondWith(() => new Response(streamed(['abc', 'def', 'ghi']), { status: 200 }));
    expect(await lichessText('/x')).toBe('abcdefghi');
    respondWith(() => new Response(streamed(['abc', 'def', 'ghi']), { status: 200 }));
    expect(await lichessText('/x', { maxChars: 4 })).toBe('abcdef');

    respondWith(() => new Response(streamed(['abc', 'def', 'ghi']), { status: 200 }));
    const pieces: string[] = [];
    const whole = await lichessTextStream('/x', (piece) => {
      pieces.push(piece);
      return pieces.length < 2;
    });
    expect([whole, pieces]).toEqual([false, ['abc', 'def']]);
  });
});

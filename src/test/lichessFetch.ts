import { vi } from 'vitest';
import { FAKE_ORIGIN, FakeLichess } from './fakeLichess';

/**
 * Puts the stand-in Lichess (`fakeLichess.ts`) behind `fetch` for a unit
 * test. Requests anywhere else fail loudly; `offline` makes every request
 * fail the way a dropped connection does.
 */
export interface FakeLichessHandle {
  fake: FakeLichess;
  /** While true, every request fails as if the device were offline. */
  offline: boolean;
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
}

function headersOf(init: RequestInit['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init).forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function bodyOf(body: RequestInit['body']): string {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error('The stand-in Lichess reads text and form bodies only.');
}

export function installFakeLichess(fake = new FakeLichess()): FakeLichessHandle {
  const handle: FakeLichessHandle = {
    fake,
    offline: false,
    fetch: vi.fn<typeof fetch>(),
  };
  handle.fetch.mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (init.signal?.aborted) throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (handle.offline) throw new TypeError('Failed to fetch');
    if (!url.startsWith(`${FAKE_ORIGIN}/`)) throw new Error(`Unexpected request to ${url}`);
    const res = await fake.handle({
      method: init.method ?? 'GET',
      url,
      headers: headersOf(init.headers),
      body: bodyOf(init.body),
    });
    const empty = res.status === 204 || res.status === 304 || res.body === '';
    return new Response(empty ? null : res.body, { status: res.status, headers: res.headers });
  });
  vi.stubGlobal('fetch', handle.fetch);
  return handle;
}

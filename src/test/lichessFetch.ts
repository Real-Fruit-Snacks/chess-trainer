import { vi } from 'vitest';
import { FAKE_ORIGIN, FakeLichess } from './fakeLichess';
import type { FakeStream } from './fakeLichessBoard';

/**
 * Puts the stand-in Lichess (`fakeLichess.ts`) behind `fetch` for a unit
 * test. Requests anywhere else fail loudly; `offline` makes every request
 * fail the way a dropped connection does.
 *
 * Lichess's streams (the Board API's) stay open and receive each line as it
 * happens, as they do from lichess.org; aborting the request, or cancelling
 * its body, closes them on the stand-in's side too. With `streams: false`
 * they are long polls instead, as Playwright's routes serve them: each answer
 * ends after its first lines.
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

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error
    ? reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

/** An open stream as the body of a `Response`, closed on both sides when the client gives up. */
function readableOf(stream: FakeStream, signal: AbortSignal | null): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let finished = false;
  let stopListening: (() => void) | null = null;
  const finish = () => {
    finished = true;
    stopListening?.();
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal) {
        const onAbort = () => {
          if (finished) return;
          finish();
          stream.detach();
          controller.error(abortReason(signal));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort);
        stopListening = () => signal.removeEventListener('abort', onAbort);
      }
      stream.attach({
        write: (text) => {
          if (!finished) controller.enqueue(encoder.encode(text));
        },
        end: () => {
          if (finished) return;
          finish();
          controller.close();
        },
        fail: (error) => {
          if (finished) return;
          finish();
          controller.error(error);
        },
      });
    },
    cancel() {
      if (finished) return;
      finish();
      stream.detach();
    },
  });
}

/** `promise`, or the abort's error as soon as `signal` aborts. */
function unlessAborted<T>(promise: Promise<T>, signal: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export function installFakeLichess(
  fake = new FakeLichess(),
  options: { streams?: boolean } = {},
): FakeLichessHandle {
  const streams = options.streams ?? true;
  const handle: FakeLichessHandle = {
    fake,
    offline: false,
    fetch: vi.fn<typeof fetch>(),
  };
  handle.fetch.mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const signal = init.signal ?? null;
    if (signal?.aborted) throw abortReason(signal);
    if (handle.offline) throw new TypeError('Failed to fetch');
    if (!url.startsWith(`${FAKE_ORIGIN}/`)) throw new Error(`Unexpected request to ${url}`);
    const answer = fake.handle(
      {
        method: init.method ?? 'GET',
        url,
        headers: headersOf(init.headers),
        body: bodyOf(init.body),
      },
      { streams, ...(signal ? { signal } : {}) },
    );
    let res: Awaited<typeof answer>;
    try {
      res = await unlessAborted(answer, signal);
    } catch (err) {
      // Given up before the answer came: Lichess sees the connection close.
      answer.then(
        (late) => late.stream?.detach(),
        () => undefined,
      );
      throw err;
    }
    if (res.stream) {
      return new Response(readableOf(res.stream, signal), {
        status: res.status,
        headers: res.headers,
      });
    }
    const empty = res.status === 204 || res.status === 304 || res.body === '';
    return new Response(empty ? null : res.body, { status: res.status, headers: res.headers });
  });
  vi.stubGlobal('fetch', handle.fetch);
  return handle;
}

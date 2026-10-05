import { fetchWithTimeout, isTimeoutError, retryAfterSeconds } from '@/lib/fetchWithTimeout';

/**
 * Talking to Lichess for the account sync. Every request goes through one
 * queue, as Lichess asks ("only make one request at a time"), including the
 * reading of a streamed answer; failures come back as a `LichessError` that
 * says what kind of failure it was, so the sync can tell "offline" from
 * "signed out" from "slow down".
 */
export const LICHESS_ORIGIN = 'https://lichess.org';

export type LichessErrorKind =
  /** No answer: offline, a dropped connection or a timeout. */
  | 'network'
  /** The token was refused (revoked, expired, or never valid). */
  | 'auth'
  /** The token lacks a permission the request needs. */
  | 'forbidden'
  | 'not-found'
  /** Too many requests: try again after `retryAfterSec`. */
  | 'rate-limited'
  /** Lichess refused what was sent (HTTP 400). */
  | 'invalid'
  | 'server';

export class LichessError extends Error {
  constructor(
    message: string,
    readonly kind: LichessErrorKind,
    readonly status: number | null = null,
    /** For `rate-limited`: how long Lichess asked to wait. */
    readonly retryAfterSec: number | null = null,
  ) {
    super(message);
    this.name = 'LichessError';
  }
}

/** Ordinary requests: twenty seconds. */
export const REQUEST_TIMEOUT_MS = 20_000;
/** Streamed answers (puzzle history, game exports) arrive slowly by design. */
export const STREAM_TIMEOUT_MS = 180_000;
/** How long to wait after a 429 that names no time (Lichess: "waiting one minute"). */
export const DEFAULT_RETRY_AFTER_SEC = 60;

let tail: Promise<unknown> = Promise.resolve();

/** Runs `task` after every request queued before it has finished. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

export interface LichessRequest {
  method?: 'GET' | 'POST' | 'DELETE';
  /** Bearer token; omitted for public endpoints. */
  token?: string | null;
  /** Query string. */
  query?: Record<string, string | number | boolean | undefined>;
  /** A form body (`application/x-www-form-urlencoded`). */
  form?: Record<string, string | undefined>;
  /** A JSON body. */
  json?: unknown;
  /** A plain-text body. */
  text?: string;
  accept?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function lichessUrl(path: string, query: LichessRequest['query'] = {}): string {
  const url = new URL(path, LICHESS_ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.href;
}

async function errorMessage(res: Response): Promise<string | null> {
  try {
    const text = (await res.text()).trim();
    if (!text) return null;
    try {
      const body = JSON.parse(text) as { error?: unknown; error_description?: unknown };
      const message = body.error_description ?? body.error;
      if (typeof message === 'string') return message;
      if (message && typeof message === 'object') return JSON.stringify(message);
    } catch {
      // Not JSON: the text itself, if it is short enough to be a message.
    }
    return text.length <= 200 ? text : null;
  } catch {
    return null;
  }
}

/** Turns a non-OK response into the matching error. */
export async function errorFor(res: Response): Promise<LichessError> {
  const detail = await errorMessage(res);
  switch (res.status) {
    case 401:
      return new LichessError('Lichess no longer accepts this device’s sign-in.', 'auth', 401);
    case 403:
      return new LichessError(
        'Lichess refused: the sign-in lacks a permission this needs.',
        'forbidden',
        403,
      );
    case 404:
      return new LichessError(detail ?? 'Not found on Lichess.', 'not-found', 404);
    case 429:
      return new LichessError(
        'Lichess asked the app to slow down.',
        'rate-limited',
        429,
        retryAfterSeconds(res) ?? DEFAULT_RETRY_AFTER_SEC,
      );
    case 400:
      return new LichessError(detail ?? 'Lichess refused the request.', 'invalid', 400);
    default:
      return new LichessError(
        `Lichess answered with an error (HTTP ${res.status}).`,
        'server',
        res.status,
      );
  }
}

/** Sends one request (not queued: the callers below queue it with the reading of its body). */
async function send(path: string, init: LichessRequest): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.accept) headers.Accept = init.accept;
  let body: BodyInit | undefined;
  if (init.form) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(init.form)) {
      if (value !== undefined) form.set(key, value);
    }
    body = form;
  } else if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  } else if (init.text !== undefined) {
    headers['Content-Type'] = 'text/plain';
    body = init.text;
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(lichessUrl(path, init.query), {
      method: init.method ?? (body ? 'POST' : 'GET'),
      headers,
      ...(body ? { body } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
      timeoutMs: init.timeoutMs ?? REQUEST_TIMEOUT_MS,
      // Answers depend on the account and change all the time.
      cache: 'no-store',
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new LichessError('Lichess took too long to answer.', 'network');
    }
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new LichessError('Lichess could not be reached.', 'network');
  }
  if (!res.ok) throw await errorFor(res);
  return res;
}

/** Wraps errors raised while a body is read (a dropped stream) like those of the request. */
async function reading<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof LichessError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    if (isTimeoutError(err)) throw new LichessError('Lichess took too long to answer.', 'network');
    if (err instanceof SyntaxError) {
      throw new LichessError('Lichess sent something the app could not read.', 'server');
    }
    throw new LichessError('The connection to Lichess dropped.', 'network');
  }
}

/** A request whose answer is JSON (or empty: resolves `null`). */
export function lichessJson<T>(path: string, init: LichessRequest = {}): Promise<T | null> {
  return serial(async () => {
    const res = await send(path, { accept: 'application/json', ...init });
    return reading(async () => {
      const text = await res.text();
      return text.trim() ? (JSON.parse(text) as T) : null;
    });
  });
}

/** A request whose answer is not needed (204s, deletions). */
export function lichessSend(path: string, init: LichessRequest = {}): Promise<void> {
  return serial(async () => {
    const res = await send(path, init);
    await reading(() => res.text());
  });
}

/**
 * Reads a text answer piece by piece as it arrives (a long PGN export),
 * handing each piece to `onText`; `onText` returns `false` to stop early (the
 * rest is dropped). Resolves `true` when the whole answer was read.
 */
export function lichessTextStream(
  path: string,
  onText: (text: string) => boolean | void,
  init: LichessRequest = {},
): Promise<boolean> {
  return serial(async () => {
    const res = await send(path, { timeoutMs: STREAM_TIMEOUT_MS, ...init });
    return reading(async () => {
      if (!res.body) {
        onText(await res.text());
        return true;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (onText(decoder.decode(value, { stream: true })) === false) {
          await reader.cancel().catch(() => undefined);
          return false;
        }
      }
      const rest = decoder.decode();
      if (rest) onText(rest);
      return true;
    });
  });
}

/** A text answer (a PGN export), up to about `maxChars` characters. */
export async function lichessText(
  path: string,
  init: LichessRequest & { maxChars?: number } = {},
): Promise<string> {
  const { maxChars = 8 * 1024 * 1024, ...rest } = init;
  let text = '';
  await lichessTextStream(
    path,
    (piece) => {
      text += piece;
      return text.length < maxChars;
    },
    rest,
  );
  return text;
}

/**
 * Reads an ndjson stream, handing each object to `onItem` as it arrives;
 * `onItem` returns `false` to stop early (the rest of the stream is dropped).
 * Resolves with the number of objects read.
 */
export function lichessNdjson(
  path: string,
  onItem: (item: unknown) => boolean | void,
  init: LichessRequest = {},
): Promise<number> {
  return serial(async () => {
    const res = await send(path, {
      accept: 'application/x-ndjson',
      timeoutMs: STREAM_TIMEOUT_MS,
      ...init,
    });
    return reading(async () => {
      let count = 0;
      let stopped = false;
      const take = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || stopped) return;
        count++;
        if (onItem(JSON.parse(trimmed)) === false) stopped = true;
      };
      if (!res.body) {
        for (const line of (await res.text()).split('\n')) take(line);
        return count;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          take(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
        }
        if (stopped) {
          await reader.cancel().catch(() => undefined);
          return count;
        }
      }
      take(buffer + decoder.decode());
      return count;
    });
  });
}

/** Whether an error means "try again later" rather than "something is wrong". */
export function isTransient(err: unknown): boolean {
  return (
    err instanceof LichessError &&
    (err.kind === 'network' || err.kind === 'rate-limited' || err.kind === 'server')
  );
}

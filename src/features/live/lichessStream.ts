import { fetchWithTimeout, isTimeoutError } from '@/lib/fetchWithTimeout';
import { errorFor, LichessError, lichessUrl } from '@/lib/lichess/api';
import { useLichess } from '@/store/lichess';

/**
 * Talking to Lichess for live games. These requests go straight to Lichess,
 * not through the account sync's one-at-a-time queue (`api.ts`): the event
 * stream, a seek and a game's stream stay open for the whole wait or game,
 * which would hold every other request back; and a move must not wait behind
 * a long download of puzzle history. Lichess counts its streams apart from
 * ordinary requests.
 */

/** The pauses and limits of live play on Lichess, in one place (the tests shorten them). */
export const lichessTiming = {
  /**
   * A stream that sends nothing for this long, not even the blank line
   * Lichess sends every 7 to 10 seconds to keep it open, has dropped
   * without saying so.
   */
  idleMs: 30_000,
  /** Ordinary requests (a move, a resignation…). */
  requestMs: 20_000,
  /**
   * After the event stream opens, how long its report of the games already in
   * progress may take to arrive: a seek is posted only after it, so that none
   * of those is taken for the seek's game.
   */
  openingMs: 600,
  /** The first pause before posting a seek again that ended without a game; doubled each time. */
  repostMs: 3_000,
  repostMaxMs: 30_000,
  /** A seek that stayed up this long ended in the ordinary way: the pauses start again. */
  steadySeekMs: 60_000,
  /**
   * After a seek is withdrawn, how long a game that slipped through is watched
   * for (and aborted): its start reaches the event stream within moments.
   */
  cancelGraceMs: 3_000,
  /** A stream that ended after delivering what it had is opened again after this pause. */
  resumeMs: 500,
  /** After a failure, the first pause before trying again; doubled each time. */
  retryMs: 1_000,
  retryMaxMs: 30_000,
  /** Failures in a row before a seek gives up. */
  seekRetries: 3,
};

/**
 * A token Lichess refuses outright (401) is of no use any more: Settings
 * offers to connect again, as it does when the sync meets the same refusal.
 */
export function noteSignInRefused(err: unknown): void {
  const lichess = useLichess.getState();
  if (err instanceof LichessError && err.kind === 'auth' && lichess.account) {
    lichess.setNeedsReconnect(true);
  }
}

function abortErrorOf(signal: AbortSignal): DOMException {
  const reason: unknown = signal.reason;
  return reason instanceof DOMException && reason.name === 'AbortError'
    ? reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

/** Waits `ms`, or rejects with an AbortError as soon as `signal` aborts. */
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortErrorOf(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortErrorOf(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** The pause before attempt `failures + 1`, doubling from `first` up to `max`. */
export function backoff(failures: number, first: number, max: number): number {
  return Math.min(max, first * 2 ** Math.max(0, failures - 1));
}

/**
 * Sends an ordinary Board API request (a move, a resignation…) at once.
 * Rejects with a `LichessError` when Lichess refuses or cannot be reached.
 */
export async function postToLichess(path: string, token: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(lichessUrl(path), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      timeoutMs: lichessTiming.requestMs,
      cache: 'no-store',
    });
  } catch (err) {
    if (isTimeoutError(err)) throw new LichessError('Lichess took too long to answer.', 'network');
    throw new LichessError('Lichess could not be reached.', 'network');
  }
  if (!res.ok) throw await errorFor(res);
  await res.text().catch(() => '');
}

export interface LichessStreamOptions {
  token: string;
  method?: 'GET' | 'POST';
  /** A form body (a seek's settings). */
  form?: Record<string, string>;
  signal: AbortSignal;
  /** Each object Lichess sends; the blank keep-alive lines are skipped. */
  onLine: (value: unknown) => void;
  /** Lichess has answered (status 200): the stream is open. */
  onOpen?: () => void;
}

/**
 * Reads one of Lichess's ndjson streams as it arrives. Resolves when Lichess
 * ends it; rejects with a `LichessError` (a refusal, or a connection lost or
 * gone quiet), or with an AbortError once `signal` aborts. Nothing of it
 * outlives the call: the connection is closed however it ends.
 */
export async function readLichessStream(
  path: string,
  options: LichessStreamOptions,
): Promise<void> {
  const { signal } = options;
  if (signal.aborted) throw abortErrorOf(signal);
  const controller = new AbortController();
  let quiet = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Every piece that arrives, a keep-alive included, shows the connection is alive.
  const watch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      quiet = true;
      controller.abort();
    }, lichessTiming.idleMs);
  };
  const forward = () => controller.abort();
  signal.addEventListener('abort', forward, { once: true });
  /** What went wrong, in the caller's terms: its own abort, a quiet line, or a lost connection. */
  const failure = (err: unknown, lost: string): Error => {
    if (signal.aborted) return abortErrorOf(signal);
    if (quiet) return new LichessError('The connection to Lichess went quiet.', 'network');
    if (err instanceof LichessError) return err;
    return new LichessError(lost, 'network');
  };
  watch();
  try {
    let res: Response;
    try {
      res = await fetch(lichessUrl(path), {
        method: options.method ?? 'GET',
        headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/x-ndjson' },
        ...(options.form ? { body: new URLSearchParams(options.form) } : {}),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      throw failure(err, 'Lichess could not be reached.');
    }
    if (!res.ok) throw failure(await errorFor(res), '');
    watch();
    options.onOpen?.();
    let buffer = '';
    const take = (text: string) => {
      buffer += text;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          let value: unknown;
          try {
            value = JSON.parse(line);
          } catch {
            throw new LichessError('Lichess sent something the app could not read.', 'server');
          }
          options.onLine(value);
          // A handler may have finished with the stream.
          if (signal.aborted) throw abortErrorOf(signal);
        }
        newline = buffer.indexOf('\n');
      }
    };
    if (!res.body) {
      let text: string;
      try {
        text = await res.text();
      } catch (err) {
        throw failure(err, 'The connection to Lichess dropped.');
      }
      take(`${text}\n`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          throw failure(err, 'The connection to Lichess dropped.');
        }
        if (chunk.done) break;
        watch();
        take(decoder.decode(chunk.value, { stream: true }));
      }
      take(`${decoder.decode()}\n`);
    } finally {
      // Closes the connection whatever happened (a no-op once it has ended).
      reader.cancel().catch(() => undefined);
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', forward);
    controller.abort();
  }
}

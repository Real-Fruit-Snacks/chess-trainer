/**
 * `fetch` with a deadline. Every request to Lichess, chess.com, the opening
 * explorer and the tablebase goes through here so a stalled connection fails
 * within a bounded time instead of hanging a page forever. The caller's own
 * `signal` still cancels the request early.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchWithTimeoutInit extends RequestInit {
  /** Milliseconds before the request is aborted (default 15 s). */
  timeoutMs?: number;
}

/** Combines the caller's signal with a timeout; falls back when `AbortSignal.any` is missing. */
export function timeoutSignal(
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  const controller = new AbortController();
  const forward = (source: AbortSignal) => () => controller.abort(source.reason);
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener('abort', forward(signal), { once: true });
  timeout.addEventListener('abort', forward(timeout), { once: true });
  return controller.signal;
}

/** True when `error` is the abort raised by a timeout rather than by the caller. */
export function isTimeoutError(error: unknown): boolean {
  // Duck-typed: the DOMException may come from another realm (a worker, jsdom).
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'TimeoutError'
  );
}

export async function fetchWithTimeout(
  url: string,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  return fetch(url, { ...rest, signal: timeoutSignal(signal, timeoutMs) });
}

/** Seconds to wait from a `Retry-After` header (delay or HTTP date), or null. */
export function retryAfterSeconds(res: Pick<Response, 'headers'>): number | null {
  const header = res.headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * A WebSocket to the relay that looks after itself, for the waiting room and
 * for each game room. While open it sends `ping` every 25 seconds and gives
 * the socket up when nothing at all comes back within 10: a phone that
 * changed networks can keep a dead socket "open" for minutes otherwise. After
 * a loss its owner decides whether to try again (`retry`), which waits 1, 2,
 * 4, 8 and then 15 seconds at most, each with a little jitter so that every
 * device a relay restart dropped does not come back in the same second. The
 * waits start again from 1 second once the owner has seen the connection work
 * (`settled`), and a waiting retry goes at once when the browser comes back
 * online or the page comes back into view.
 */

/** The waits between attempts; the last one repeats. */
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 15_000];
/** How often an open socket asks the relay whether it is still there. */
export const PING_EVERY_MS = 25_000;
/** How long after a ping the socket waits for anything at all before giving up on it. */
export const SILENCE_MS = 10_000;
/** The jitter added to each wait, as a share of it. */
const JITTER = 0.2;
/** The code the socket closes with when the relay has gone silent (4000–4999 are the app's own). */
const SILENT_CLOSE = 4000;
/** What a browser reports for a connection that died without a closing handshake. */
const ABNORMAL = 1006;

/** Idle: no socket and no retry waiting; waiting: a retry is scheduled. */
export type LiveSocketState = 'idle' | 'connecting' | 'open' | 'waiting';

export interface LiveSocketEvents {
  /** The socket opened: say what this side needs first. */
  open(): void;
  /** A message from the relay: a JSON object (`pong` and anything else are not passed on). */
  message(message: Record<string, unknown>): void;
  /**
   * The socket is gone: closed by the relay or the network, or given up for
   * silence. `opened` says whether it had opened. Not called after `close()`.
   */
  down(info: { code: number; opened: boolean }): void;
}

const sockets = new Set<LiveSocket>();
let listening = false;

function wakeAll(): void {
  for (const socket of [...sockets]) socket.wake();
}

/** One pair of listeners for every socket, added the first time a socket is made. */
function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('online', wakeAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wakeAll();
  });
}

/** The JSON object a message carries, or null. */
function parse(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export class LiveSocket {
  private ws: WebSocket | null = null;
  private opened = false;
  private attempt = 0;
  private current: LiveSocketState = 'idle';
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly url: () => string | null;
  private readonly events: LiveSocketEvents;
  private readonly random: () => number;

  /** `url` is read at each attempt; null means there is nowhere to connect (no relay). */
  constructor(url: () => string | null, events: LiveSocketEvents, random = Math.random) {
    this.url = url;
    this.events = events;
    this.random = random;
    sockets.add(this);
    listen();
  }

  get state(): LiveSocketState {
    return this.current;
  }

  /** Opens the socket now (a waiting retry goes at once); false when there is no relay to reach. */
  connect(): boolean {
    if (this.current === 'connecting' || this.current === 'open') return true;
    this.clearRetry();
    const url = this.url();
    if (!url) {
      this.current = 'idle';
      return false;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      // An address the browser will not open (ws: from an https: page, say): a
      // failed attempt like any other, reported a moment later like one.
      this.current = 'connecting';
      setTimeout(() => {
        if (this.current !== 'connecting' || this.ws !== null) return;
        this.current = 'idle';
        this.events.down({ code: ABNORMAL, opened: false });
      }, 0);
      return true;
    }
    this.ws = ws;
    this.opened = false;
    this.current = 'connecting';
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.opened = true;
      this.current = 'open';
      this.pingTimer = setInterval(() => this.ping(), PING_EVERY_MS);
      this.events.open();
    };
    ws.onmessage = (event: MessageEvent) => {
      if (this.ws !== ws) return;
      // Anything at all shows the relay is still there.
      this.clearSilence();
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      const message = parse(event.data);
      if (message) this.events.message(message);
    };
    ws.onclose = (event: CloseEvent) => {
      if (this.ws !== ws) return;
      const opened = this.opened;
      this.release();
      this.events.down({ code: event.code, opened });
    };
    return true;
  }

  /** Tries again after the next wait; returns the wait in milliseconds. */
  retry(): number {
    if (this.current === 'connecting' || this.current === 'open') return 0;
    this.clearRetry();
    const base = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] as number;
    const delay = Math.round(base * (1 + JITTER * this.random()));
    this.attempt += 1;
    this.current = 'waiting';
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.current = 'idle';
      this.connect();
    }, delay);
    return delay;
  }

  /** The connection worked (the relay answered as it should): the next loss starts the waits again. */
  settled(): void {
    this.attempt = 0;
  }

  /** The browser is back online, or the page in view: a waiting retry goes now, an open socket checks in. */
  wake(): void {
    if (this.current === 'waiting') {
      this.clearRetry();
      this.current = 'idle';
      this.connect();
    } else if (this.current === 'open') {
      this.ping();
    }
  }

  /** Sends a message (an object goes as JSON); false when the socket is not open. */
  send(message: unknown): boolean {
    if (this.current !== 'open' || !this.ws) return false;
    try {
      this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
      return true;
    } catch {
      // Closing already: its close event follows.
      return false;
    }
  }

  /** Closes the socket and cancels any retry, without a `down` (the owner asked for it). */
  close(code = 1000, reason = ''): void {
    this.clearRetry();
    const ws = this.ws;
    this.release();
    this.attempt = 0;
    if (!ws) return;
    try {
      ws.close(code, reason);
    } catch {
      // Closed already.
    }
  }

  /** Closes it for good: it no longer hears that the browser is back online. */
  dispose(): void {
    this.close();
    sockets.delete(this);
  }

  private ping(): void {
    if (this.current !== 'open' || !this.ws) return;
    try {
      this.ws.send('ping');
    } catch {
      return;
    }
    this.silenceTimer ??= setTimeout(() => this.silent(), SILENCE_MS);
  }

  /** Nothing came back after a ping: the socket is dead, whatever the browser says. */
  private silent(): void {
    this.silenceTimer = null;
    const ws = this.ws;
    if (!ws) return;
    this.release();
    try {
      ws.close(SILENT_CLOSE, 'No answer');
    } catch {
      // Closed already.
    }
    this.events.down({ code: ABNORMAL, opened: true });
  }

  /** Forgets the socket (its handlers too, so nothing it still says arrives). */
  private release(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearSilence();
    const ws = this.ws;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
    }
    this.ws = null;
    this.opened = false;
    this.current = 'idle';
  }

  private clearSilence(): void {
    if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

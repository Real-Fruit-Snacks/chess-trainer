/** Types for websocket.mjs, for the relay's tests. */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/** One WebSocket connection, on the server's side. */
export interface WebSocketConnection {
  /** Sends a text message; nothing is sent once the connection is closing. */
  send(text: string): void;
  /** Starts the close handshake (code 1000 unless told otherwise). */
  close(code?: number, reason?: string): void;
  /** A whole text message from the peer. */
  on(event: 'message', listener: (text: string) => void): WebSocketConnection;
  /**
   * The connection is gone, once: the code and reason of the peer's close frame
   * (1005 when it had no code), or 1006 when none came.
   */
  on(event: 'close', listener: (code: number, reason: string) => void): WebSocketConnection;
}

export interface UpgradeOptions {
  /** The largest message taken, in bytes (64 KiB): a bigger one closes the connection with 1009. */
  maxBytes?: number;
  /** How long a peer has to answer our close frame before its connection is cut (5 s). */
  closeTimeoutMs?: number;
}

export const DEFAULT_MAX_BYTES: number;
export const DEFAULT_CLOSE_TIMEOUT_MS: number;

/** The Sec-WebSocket-Accept that answers a Sec-WebSocket-Key. */
export function acceptKey(key: string): string;
/** Answers an upgrade request with an HTTP error, and closes the connection. */
export function refuse(socket: Duplex, status: number, headers?: Record<string, string>): void;
/**
 * Completes the handshake of an upgrade request (from Node's http `upgrade`
 * event): the connection, or null when it is not a WebSocket handshake (it is
 * then answered with 400, and closed).
 */
export function upgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  options?: UpgradeOptions,
): WebSocketConnection | null;

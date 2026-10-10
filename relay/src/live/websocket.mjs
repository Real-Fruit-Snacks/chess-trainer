/**
 * A small WebSocket server (RFC 6455) for Node's http `upgrade` event, with no
 * dependencies: what the self-hosted relay's live games need, and no more.
 * Text messages only, no extensions (so no compression), no subprotocols.
 *
 *   server.on('upgrade', (req, socket, head) => {
 *     const ws = upgrade(req, socket, head);
 *     if (!ws) return; // not a WebSocket handshake: answered 400 and closed
 *     ws.on('message', (text) => ws.send(text));
 *     ws.on('close', (code, reason) => {});
 *   });
 *
 * The peer's frames must be masked. A message may come in fragments, with
 * pings between them, and is capped (`maxBytes`, 64 KiB by default). A peer
 * that breaks the rules is told why and cut off: 1002 for the protocol (an
 * unmasked frame, say), 1003 for a binary message, 1007 for text that is not
 * UTF-8, 1009 for a message too big. Pings are answered with pongs.
 *
 * Closing goes by the handshake: a close frame each way, then the server ends
 * the TCP connection. A peer that never answers our close frame is cut off
 * after `closeTimeoutMs` (5 seconds).
 */
import { createHash } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

/** The handshake's fixed GUID (RFC 6455, section 1.3). */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** A Sec-WebSocket-Key: 16 random bytes in base64. */
const KEY_PATTERN = /^[A-Za-z0-9+/]{22}==$/;

/** The largest message taken, in bytes, unless told otherwise. */
export const DEFAULT_MAX_BYTES = 64 * 1024;
/** How long a peer has to answer our close frame before its connection is cut. */
export const DEFAULT_CLOSE_TIMEOUT_MS = 5000;
/** Bytes queued for a peer that does not read, beyond which its connection is cut. */
const MAX_QUEUED_BYTES = 1024 * 1024;
/** How long a quiet connection waits before TCP checks that the peer is still there. */
const KEEP_ALIVE_MS = 30_000;

const OP = { continuation: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa };
const EMPTY = Buffer.alloc(0);
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * @typedef {{
 *   send(text: string): void,
 *   close(code?: number, reason?: string): void,
 *   on(event: 'message' | 'close', listener: (...args: any[]) => void): WebSocketConnection,
 * }} WebSocketConnection
 *
 * @typedef {{ maxBytes?: number, closeTimeoutMs?: number }} UpgradeOptions
 */

/** Whether a peer may send `code` in a close frame (RFC 6455, section 7.4). */
function validCode(/** @type {number} */ code) {
  return (
    (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) ||
    (code >= 3000 && code <= 4999)
  );
}

/** A close reason in UTF-8, cut to the 123 bytes a close frame has room for. */
function reasonBytes(/** @type {string} */ reason) {
  const bytes = Buffer.from(reason, 'utf8');
  if (bytes.length <= 123) return bytes;
  let kept = '';
  for (const char of reason) {
    if (Buffer.byteLength(kept + char) > 123) break;
    kept += char;
  }
  return Buffer.from(kept, 'utf8');
}

/** The comma-separated tokens of a header, in lower case. */
const tokens = (/** @type {string | string[] | undefined} */ value) =>
  String(value ?? '')
    .toLowerCase()
    .split(',')
    .map((token) => token.trim());

/** The Sec-WebSocket-Accept that answers a Sec-WebSocket-Key. */
export function acceptKey(/** @type {string} */ key) {
  return createHash('sha1')
    .update(key + GUID)
    .digest('base64');
}

/**
 * Answers an upgrade request with an HTTP error, and closes the connection.
 * @param {import('node:stream').Duplex} socket
 * @param {number} status
 * @param {Record<string, string>} [headers]
 */
export function refuse(socket, status, headers = {}) {
  const lines = [
    `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ''}`,
    'Connection: close',
    'Content-Length: 0',
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
  ];
  socket.on('error', () => socket.destroy());
  // The peer may never close its side: the socket goes once the answer is out.
  socket.end(`${lines.join('\r\n')}\r\n\r\n`, () => socket.destroy());
}

/**
 * Completes the handshake of a WebSocket upgrade request: the connection, or
 * null when the request is not a WebSocket handshake (it is answered with 400,
 * and closed).
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:stream').Duplex} socket
 * @param {Buffer} head the bytes after the request (Node's `upgrade` event hands them over)
 * @param {UpgradeOptions} [options]
 * @returns {WebSocketConnection | null}
 */
export function upgrade(req, socket, head, options = {}) {
  const key = req.headers['sec-websocket-key'];
  if (
    req.method !== 'GET' ||
    !tokens(req.headers.upgrade).includes('websocket') ||
    !tokens(req.headers.connection).includes('upgrade') ||
    typeof key !== 'string' ||
    !KEY_PATTERN.test(key)
  ) {
    refuse(socket, 400);
    return null;
  }
  if (req.headers['sec-websocket-version'] !== '13') {
    refuse(socket, 400, { 'Sec-WebSocket-Version': '13' });
    return null;
  }
  if (socket.destroyed || !socket.writable) {
    socket.destroy();
    return null;
  }
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey(key)}`,
      '',
      '',
    ].join('\r\n'),
  );
  return connect(socket, head, options);
}

/**
 * The connection over a socket whose handshake is done.
 * @param {import('node:stream').Duplex} socket
 * @param {Buffer} head
 * @param {UpgradeOptions} options
 * @returns {WebSocketConnection}
 */
function connect(socket, head, options) {
  const { maxBytes = DEFAULT_MAX_BYTES, closeTimeoutMs = DEFAULT_CLOSE_TIMEOUT_MS } = options;
  /** @type {{ message: ((text: string) => void)[], close: ((code: number, reason: string) => void)[] }} */
  const listeners = { message: [], close: [] };
  /** The bytes of a frame's header so far: a header can arrive in pieces. */
  let header = EMPTY;
  /**
   * The frame whose payload is arriving.
   * @type {{ fin: boolean, opcode: number, mask: Buffer, length: number, pieces: Buffer[], received: number } | null}
   */
  let frame = null;
  /**
   * A text message that is still arriving in fragments.
   * @type {{ pieces: Buffer[], bytes: number } | null}
   */
  let message = null;
  /** False once nothing more is read: the peer's close frame came, or it broke the rules. */
  let reading = true;
  let closeSent = false;
  /** @type {{ code: number, reason: string } | null} */
  let closeReceived = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let closed = false;

  /** Writes one whole frame (a server's frames are not masked). */
  function write(/** @type {number} */ opcode, /** @type {Buffer} */ payload) {
    if (socket.destroyed || !socket.writable) return;
    const length = payload.length;
    const size = length < 126 ? 2 : length < 0x10000 ? 4 : 10;
    const out = Buffer.allocUnsafe(size + length);
    out[0] = 0x80 | opcode;
    if (size === 2) {
      out[1] = length;
    } else if (size === 4) {
      out[1] = 126;
      out.writeUInt16BE(length, 2);
    } else {
      out[1] = 127;
      out.writeUInt32BE(Math.floor(length / 0x100000000), 2);
      out.writeUInt32BE(length >>> 0, 6);
    }
    payload.copy(out, size);
    socket.write(out);
    // A peer that never reads would make the queue grow without end.
    if (socket.writableLength > MAX_QUEUED_BYTES) socket.destroy();
  }

  /** Cuts the connection when the peer has not closed it in time. */
  function arm() {
    if (timer !== null || socket.destroyed) return;
    timer = setTimeout(() => socket.destroy(), closeTimeoutMs);
    timer.unref();
  }

  /** Sends our close frame, once (`code` null: one without a code). */
  function sendClose(/** @type {number | null} */ code, /** @type {string} */ reason) {
    if (closeSent) return;
    closeSent = true;
    write(
      OP.close,
      code === null
        ? EMPTY
        : Buffer.concat([Buffer.from([code >> 8, code & 0xff]), reasonBytes(reason)]),
    );
  }

  /** The peer broke a rule: it is told why, nothing more is read, and the connection ends. */
  function fail(/** @type {number} */ code, /** @type {string} */ reason) {
    reading = false;
    frame = null;
    message = null;
    sendClose(code, reason);
    socket.end();
    arm();
  }

  /** The peer's close frame: answered with the same code, and the server ends the connection. */
  function closing(/** @type {Buffer} */ payload) {
    if (payload.length === 1) return fail(1002, 'A close code takes two bytes.');
    let code = 1005;
    let reason = '';
    if (payload.length >= 2) {
      code = payload.readUInt16BE(0);
      if (!validCode(code)) return fail(1002, 'That is not a close code.');
      try {
        reason = utf8.decode(payload.subarray(2));
      } catch {
        return fail(1007, 'A close reason must be UTF-8.');
      }
    }
    closeReceived = { code, reason };
    reading = false;
    message = null;
    sendClose(code === 1005 ? null : code, '');
    socket.end();
    arm();
  }

  /** A whole frame, unmasked. */
  function handle(
    /** @type {boolean} */ fin,
    /** @type {number} */ opcode,
    /** @type {Buffer} */ payload,
  ) {
    if (opcode === OP.ping) {
      if (!closeSent) write(OP.pong, payload);
      return;
    }
    if (opcode === OP.pong) return;
    if (opcode === OP.close) return closing(payload);
    const current = message ?? { pieces: [], bytes: 0 };
    current.pieces.push(payload);
    current.bytes += payload.length;
    if (!fin) {
      message = current;
      return;
    }
    message = null;
    let text;
    try {
      text = utf8.decode(Buffer.concat(current.pieces, current.bytes));
    } catch {
      return fail(1007, 'A message must be UTF-8.');
    }
    // Once our close frame is out, what still arrives is not passed on.
    if (closeSent) return;
    for (const listener of listeners.message) listener(text);
  }

  /**
   * A frame's header from the start of `bytes`: the frame and the header's size;
   * 'more' when it has not all arrived; null when it breaks the rules (the
   * connection is then failed).
   * @param {Buffer} bytes
   */
  function parseHeader(bytes) {
    const broken = (/** @type {number} */ code, /** @type {string} */ reason) => {
      fail(code, reason);
      return null;
    };
    if (bytes.length < 2) return 'more';
    const fin = (bytes[0] & 0x80) !== 0;
    const opcode = bytes[0] & 0x0f;
    let length = bytes[1] & 0x7f;
    if ((bytes[0] & 0x70) !== 0) return broken(1002, 'No extension was agreed.');
    if ((bytes[1] & 0x80) === 0) return broken(1002, 'A client must mask its frames.');
    const control = opcode >= 0x8;
    if (control) {
      if (opcode !== OP.close && opcode !== OP.ping && opcode !== OP.pong) {
        return broken(1002, 'Unknown opcode.');
      }
      if (!fin || length > 125) return broken(1002, 'A control frame must be whole and short.');
    } else if (opcode === OP.binary) {
      return broken(1003, 'Only text messages are taken.');
    } else if (opcode === OP.text) {
      if (message !== null) return broken(1002, 'The last message is not finished.');
    } else if (opcode === OP.continuation) {
      if (message === null) return broken(1002, 'There is no message to continue.');
    } else {
      return broken(1002, 'Unknown opcode.');
    }
    let size = 2;
    if (length === 126) {
      if (bytes.length < 4) return 'more';
      length = bytes.readUInt16BE(2);
      size = 4;
    } else if (length === 127) {
      if (bytes.length < 10) return 'more';
      const high = bytes.readUInt32BE(2);
      if (high > 0x7fffffff) return broken(1002, 'That is not a length.');
      length = high * 0x100000000 + bytes.readUInt32BE(6);
      size = 10;
    }
    // Refused as soon as the header says so: the payload is never kept.
    if (!control && (message?.bytes ?? 0) + length > maxBytes) {
      return broken(1009, 'Message too big.');
    }
    if (bytes.length < size + 4) return 'more';
    const mask = Buffer.from(bytes.subarray(size, size + 4));
    return { frame: { fin, opcode, mask, length, pieces: [], received: 0 }, size: size + 4 };
  }

  /** Reads what arrives: frames can be split across chunks, and chunks hold several frames. */
  function read(/** @type {Buffer} */ chunk) {
    let data = chunk;
    while (reading && data.length > 0) {
      if (frame === null) {
        const bytes = header.length > 0 ? Buffer.concat([header, data]) : data;
        const parsed = parseHeader(bytes);
        if (parsed === null) return;
        if (parsed === 'more') {
          header = Buffer.from(bytes);
          return;
        }
        header = EMPTY;
        frame = parsed.frame;
        data = bytes.subarray(parsed.size);
      }
      if (data.length > 0) {
        const piece = data.subarray(0, frame.length - frame.received);
        frame.pieces.push(piece);
        frame.received += piece.length;
        data = data.subarray(piece.length);
      }
      if (frame.received === frame.length) {
        const { fin, opcode, mask, pieces, length } = frame;
        frame = null;
        const payload = Buffer.concat(pieces, length);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        handle(fin, opcode, payload);
      }
    }
  }

  /** @type {WebSocketConnection} */
  const connection = {
    send(text) {
      if (closeSent || closeReceived || socket.destroyed) return;
      write(OP.text, Buffer.from(text, 'utf8'));
    },
    close(code = 1000, reason = '') {
      if (closeSent || socket.destroyed) return;
      sendClose(validCode(code) ? code : 1000, reason);
      arm();
    },
    on(event, listener) {
      listeners[event].push(listener);
      return connection;
    },
  };

  const tcp = /** @type {Partial<import('node:net').Socket>} */ (socket);
  // Moves are small and should not wait for more to send; a peer that vanished is noticed.
  tcp.setNoDelay?.(true);
  tcp.setKeepAlive?.(true, KEEP_ALIVE_MS);
  socket.on('error', () => socket.destroy());
  socket.on('end', () => {
    // The peer has closed its side (with no close frame, the connection was cut).
    reading = false;
    socket.end();
  });
  socket.on('close', () => {
    if (timer !== null) clearTimeout(timer);
    reading = false;
    if (closed) return;
    closed = true;
    const { code, reason } = closeReceived ?? { code: 1006, reason: '' };
    for (const listener of listeners.close) listener(code, reason);
  });
  // The bytes that came with the handshake are read first; reading starts on a
  // later tick, once the caller has added its listeners.
  if (head.length > 0) socket.unshift(head);
  socket.on('data', read);
  return connection;
}

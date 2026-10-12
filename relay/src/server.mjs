#!/usr/bin/env node
/**
 * The relay as a plain Node server, its vaults, push keys and reminders in a
 * SQLite file and its live games in memory (a restart loses the games under
 * way, correspondence games too): for hosting it yourself, or trying the app
 * against a local relay.
 *
 *   node relay/src/server.mjs --port 8787 --db relay.db --origin https://example.github.io
 *
 * Options: --host (default 127.0.0.1), --port (8787), --db (relay.db; ':memory:' keeps nothing),
 * --origin (the app's origin, repeatable or comma-separated; default any), --max-bytes,
 * --push-contact (the contact in push messages, mailto: or https:; default the first
 * https origin). Put it behind HTTPS (a reverse proxy) for anything but local use:
 * the app only talks to an https relay, apart from localhost.
 *
 * Every minute it sends the reminders due; once a day it deletes vaults unused
 * for a year and reminders unheard of for 60 days.
 */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelay, DEFAULT_MAX_BYTES, expireVaults, originAllowed } from './handler.mjs';
import { createLiveHub } from './live/hub.mjs';
import { ID_PATTERN } from './live/shared.mjs';
import { refuse, upgrade } from './live/websocket.mjs';
import {
  createPushApi,
  expireReminders,
  MAX_REMINDERS,
  pushContact,
  pushSender,
  sendDueReminders,
} from './push/reminders.mjs';
import { sqlitePushStore } from './push/sqlitePushStore.mjs';
import { sqliteStore } from './sqliteStore.mjs';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const GAME_PATH = /^\/v1\/games\/([^/]+)$/;
const ROOM_PATH = /^\/v1\/rooms\/([^/]+)$/;
/** Addresses of this machine: a reverse proxy in front of the relay, or local use. */
const LOOPBACK = /^(?:127\.|::1$|::ffff:127\.)/;

/**
 * An HTTP server answering with `handle` (a Fetch API handler). A body is kept
 * up to `maxBodyBytes` and one piece more, enough for the handler to refuse it
 * as too big; the rest is read and dropped, so a request that never ends cannot
 * fill the memory. The client's address goes to the handler as
 * CF-Connecting-IP, as on Cloudflare (whatever the client sent in it is
 * dropped), for the limits per address.
 * @param {(request: Request) => Promise<Response>} handle
 * @param {{ maxBodyBytes?: number }} [options]
 */
export function nodeServer(handle, { maxBodyBytes = DEFAULT_MAX_BYTES } = {}) {
  return createServer((req, res) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let kept = 0;
    req.on('data', (/** @type {Buffer} */ chunk) => {
      if (kept > maxBodyBytes) return;
      chunks.push(chunk);
      kept += chunk.length;
    });
    req.on('end', () => {
      void (async () => {
        const body = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(name, value);
          else if (Array.isArray(value)) headers.set(name, value.join(', '));
        }
        headers.delete('cf-connecting-ip');
        const address = clientAddress(req);
        if (address) headers.set('cf-connecting-ip', address);
        const method = req.method ?? 'GET';
        const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' || body.length === 0 ? null : body,
        });
        const response = await handle(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      })().catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
  });
}

/**
 * The address the waiting room counts a socket against (at most so many
 * sockets per address). Behind a reverse proxy on the same machine every
 * socket comes from the proxy, so the address is the one the proxy adds to
 * X-Forwarded-For: the last one, as any before it came from the client. A
 * local socket with no such header is not counted.
 * @param {import('node:http').IncomingMessage} req
 */
function clientAddress(req) {
  const address = req.socket.remoteAddress ?? '';
  if (!LOOPBACK.test(address)) return address;
  const forwarded = String(req.headers['x-forwarded-for'] ?? '');
  return forwarded.slice(forwarded.lastIndexOf(',') + 1).trim();
}

/**
 * Live games on a Node server: WebSocket upgrades of `/v1/lobby` (the waiting
 * room), `/v1/games/:id` (a game) and `/v1/rooms/:id` (a group room) go to
 * `hub`, which keeps everything in memory. A socket from a page on an origin
 * that is not allowed gets 403, any other path 404. Closing the server closes the hub's sockets first.
 * @param {import('node:http').Server} server
 * @param {{ hub?: import('./live/hub.mjs').LiveHub, allowedOrigins?: readonly string[] }} [options]
 * @returns {import('./live/hub.mjs').LiveHub}
 */
export function attachLive(server, { hub = createLiveHub(), allowedOrigins = ['*'] } = {}) {
  server.on('upgrade', (req, socket, head) => {
    if (!originAllowed(allowedOrigins, req.headers.origin)) return refuse(socket, 403);
    let pathname = '';
    try {
      pathname = new URL(req.url ?? '/', 'http://relay').pathname;
    } catch {
      // Not a path: refused below.
    }
    const game = GAME_PATH.exec(pathname)?.[1];
    const room = ROOM_PATH.exec(pathname)?.[1];
    const id = game ?? room;
    const lobby = pathname === '/v1/lobby';
    if (!lobby && !(id !== undefined && ID_PATTERN.test(id))) return refuse(socket, 404);
    const ws = upgrade(req, socket, head);
    if (!ws) return;
    const events =
      room !== undefined
        ? hub.openGroup(room, ws)
        : game === undefined
          ? hub.openLobby(ws, clientAddress(req))
          : hub.openRoom(game, ws);
    ws.on('message', (text) => void events.message(text).catch(() => undefined));
    ws.on('close', () => void events.close().catch(() => undefined));
  });
  const close = server.close;
  // A server's close waits for its sockets: the live ones are told to go first.
  server.close = function (callback) {
    hub.closeAll();
    return close.call(this, callback);
  };
  return hub;
}

/** `--name value` and `--name=value` pairs; repeated names collect. */
function readArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('--')) continue;
    const [name, inline] = arg.slice(2).split('=', 2);
    const value = inline ?? argv[++i] ?? '';
    args.set(name, [...(args.get(name) ?? []), value]);
  }
  return args;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = readArgs(process.argv.slice(2));
  const one = (name, fallback) => args.get(name)?.at(-1) ?? fallback;
  /** A whole-number option, or the server does not start (a typo must not lift a limit). */
  const whole = (name, fallback, max = Number.MAX_SAFE_INTEGER) => {
    const value = Number(one(name, String(fallback)));
    if (!Number.isSafeInteger(value) || value < 1 || value > max) {
      console.error(`--${name} takes a whole number from 1 to ${max}.`);
      process.exit(2);
    }
    return value;
  };
  const maxBytes = whole('max-bytes', DEFAULT_MAX_BYTES);
  const port = whole('port', 8787, 65535);
  const host = one('host', '127.0.0.1');
  const origins = (args.get('origin') ?? ['*']).flatMap((o) => o.split(',')).map((o) => o.trim());
  const contactOption = one('push-contact', '');
  if (contactOption && pushContact([], contactOption) !== contactOption) {
    console.error('--push-contact takes a mailto: or https: address.');
    process.exit(2);
  }
  const store = sqliteStore(one('db', 'relay.db'));
  const pushStore = sqlitePushStore(one('db', 'relay.db'));
  const allowedOrigins = origins.filter(Boolean);
  const contact = pushContact(allowedOrigins, contactOption);
  const handle = createRelay({
    store,
    allowedOrigins,
    maxBytes,
    live: true,
    push: createPushApi({ store: pushStore, allowedOrigins }),
  });
  const server = nodeServer(handle, { maxBodyBytes: maxBytes });
  const hub = createLiveHub({ notify: pushSender({ store: pushStore, contact }) });
  attachLive(server, { hub, allowedOrigins });
  server.listen(port, host, () => {
    console.log(`Open File relay (sync, live games and push) on http://${host}:${port}`);
  });
  const sweep = () =>
    void Promise.all([expireVaults(store), expireReminders(pushStore)]).catch(() => undefined);
  sweep();
  setInterval(sweep, DAY).unref();
  // The reminders due, every minute; a run still sending lets the next one pass.
  let reminding = false;
  const remind = () => {
    if (reminding) return;
    reminding = true;
    void sendDueReminders({ store: pushStore, contact, limit: MAX_REMINDERS })
      .catch(() => undefined)
      .finally(() => {
        reminding = false;
      });
  };
  setInterval(remind, MINUTE).unref();
}

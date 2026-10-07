#!/usr/bin/env node
/**
 * The relay as a plain Node server, its vaults in a SQLite file: for hosting
 * it yourself, or trying the app against a local relay.
 *
 *   node relay/src/server.mjs --port 8787 --db relay.db --origin https://example.github.io
 *
 * Options: --host (default 127.0.0.1), --port (8787), --db (relay.db; ':memory:' keeps nothing),
 * --origin (the app's origin, repeatable or comma-separated; default any), --max-bytes.
 * Put it behind HTTPS (a reverse proxy) for anything but local use: the app only
 * talks to an https relay, apart from localhost.
 */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelay, DEFAULT_MAX_BYTES, expireVaults } from './handler.mjs';
import { sqliteStore } from './sqliteStore.mjs';

const DAY = 24 * 60 * 60 * 1000;

/**
 * An HTTP server answering with `handle` (a Fetch API handler).
 * @param {(request: Request) => Promise<Response>} handle
 */
export function nodeServer(handle) {
  return createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      void (async () => {
        const body = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(name, value);
          else if (Array.isArray(value)) headers.set(name, value.join(', '));
        }
        const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' || body.length === 0 ? null : body,
        });
        const response = await handle(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      })().catch(() => {
        res.writeHead(500);
        res.end();
      });
    });
  });
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
  const origins = (args.get('origin') ?? ['*']).flatMap((o) => o.split(',')).map((o) => o.trim());
  const store = sqliteStore(one('db', 'relay.db'));
  const handle = createRelay({
    store,
    allowedOrigins: origins.filter(Boolean),
    maxBytes: Number(one('max-bytes', DEFAULT_MAX_BYTES)),
  });
  const host = one('host', '127.0.0.1');
  const port = Number(one('port', '8787'));
  nodeServer(handle).listen(port, host, () => {
    console.log(`Chess Trainer sync relay on http://${host}:${port}`);
  });
  const sweep = () => void expireVaults(store).catch(() => undefined);
  sweep();
  setInterval(sweep, DAY).unref();
}

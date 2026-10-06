#!/usr/bin/env node
/**
 * Serves `dist/` the way GitHub Pages does, for the end-to-end run against the
 * production base path (`VITE_BASE_PATH=/chess-trainer/`):
 *
 * - the site lives under the base path; `/<base>` without the slash redirects;
 * - a directory serves its `index.html`;
 * - a path with no file answers **404 with `404.html`** (a copy of the app shell,
 *   which then renders the route) — unlike `vite preview`, which answers every
 *   unknown path with `index.html` and a 200;
 * - nothing outside the base path belongs to the site (a plain 404).
 *
 * Usage:  node scripts/serve-dist.mjs [--port 4173] [--host 127.0.0.1] [--base /chess-trainer/] [--dir dist]
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** "/chess-trainer" or "chess-trainer/" → "/chess-trainer/"; "" → "/". */
export function normalizeBase(base = '/') {
  const withLeading = base.startsWith('/') ? base : `/${base}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Which file answers `pathname` and with what status, Pages-style.
 * @returns {Promise<{ status: number, file?: string, location?: string }>}
 */
export async function resolveRequest(root, base, pathname) {
  if (`${pathname}/` === base) return { status: 301, location: base };
  if (!pathname.startsWith(base)) return { status: 404 };
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(base.length));
  } catch {
    return { status: 400 };
  }
  const target = resolve(root, relative);
  // Never outside the site, whatever "../" or encoded separators the path carries.
  if (target !== root && !target.startsWith(root + sep)) return { status: 404 };
  if (await isFile(target)) return { status: 200, file: target };
  if (await isFile(join(target, 'index.html'))) {
    if (!pathname.endsWith('/')) return { status: 301, location: `${pathname}/` };
    return { status: 200, file: join(target, 'index.html') };
  }
  const fallback = join(root, '404.html');
  return (await isFile(fallback)) ? { status: 404, file: fallback } : { status: 404 };
}

/** An HTTP server for the built site in `dir`, under `base`. */
export function createDistServer({ dir = 'dist', base = '/' } = {}) {
  const root = resolve(dir);
  const prefix = normalizeBase(base);
  return createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    resolveRequest(root, prefix, pathname)
      .then(({ status, file, location }) => {
        if (location) {
          res.writeHead(status, { Location: location });
          res.end();
          return;
        }
        if (!file) {
          res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(status === 400 ? 'Bad request' : 'Not found');
          return;
        }
        res.writeHead(status, {
          'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
          // Always revalidate: tests must never see a previous build's files.
          'Cache-Control': 'no-cache',
        });
        if (req.method === 'HEAD') res.end();
        else createReadStream(file).pipe(res);
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(String(err));
      });
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const option = (name, fallback) =>
    args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
  const port = Number(option('--port', '4173'));
  const host = option('--host', '127.0.0.1');
  const base = normalizeBase(option('--base', process.env.VITE_BASE_PATH || '/'));
  const dir = option('--dir', 'dist');
  createDistServer({ dir, base }).listen(port, host, () => {
    console.log(`Serving ${dir}/ at http://${host}:${port}${base} (404.html for unknown paths)`);
  });
}

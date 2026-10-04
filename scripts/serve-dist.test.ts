// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDistServer, normalizeBase } from './serve-dist.mjs';

const dist = mkdtempSync(join(tmpdir(), 'serve-dist-test-'));
writeFileSync(join(dist, 'index.html'), '<title>shell</title>');
writeFileSync(join(dist, '404.html'), '<title>shell (404)</title>');
writeFileSync(join(dist, 'licence.txt'), 'GNU GENERAL PUBLIC LICENSE');
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'assets', 'index-abc.js'), 'export {};');
mkdirSync(join(dist, 'engine'));
writeFileSync(join(dist, 'engine', 'stockfish.wasm'), 'wasm');

const server = createDistServer({ dir: dist, base: '/chess-trainer/' });
let origin = '';
beforeAll(
  () =>
    new Promise<void>((done) => {
      server.listen(0, '127.0.0.1', () => {
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        done();
      });
    }),
);
afterAll(() => {
  server.close();
  rmSync(dist, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) =>
  fetch(`${origin}${path}`, { redirect: 'manual', ...init });

describe('serve-dist (GitHub Pages behaviour)', () => {
  it('serves the app shell at the base path, and redirects the base without its slash', async () => {
    const home = await get('/chess-trainer/');
    expect(home.status).toBe(200);
    expect(await home.text()).toBe('<title>shell</title>');
    const bare = await get('/chess-trainer');
    expect(bare.status).toBe(301);
    expect(bare.headers.get('location')).toBe('/chess-trainer/');
  });

  it('answers a deep link with 404.html and a 404, as Pages does', async () => {
    const deep = await get('/chess-trainer/puzzles/rush');
    expect(deep.status).toBe(404);
    expect(deep.headers.get('content-type')).toMatch(/^text\/html/);
    expect(await deep.text()).toBe('<title>shell (404)</title>');
  });

  it('serves files with their types', async () => {
    const script = await get('/chess-trainer/assets/index-abc.js');
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect((await get('/chess-trainer/engine/stockfish.wasm')).headers.get('content-type')).toBe(
      'application/wasm',
    );
    const licence = await get('/chess-trainer/licence.txt');
    expect(licence.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await licence.text()).toContain('GENERAL PUBLIC LICENSE');
    const head = await get('/chess-trainer/licence.txt', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('owns nothing outside the base path and never serves files outside dist', async () => {
    const outside = await get('/puzzles');
    expect(outside.status).toBe(404);
    expect(await outside.text()).toBe('Not found');
    const escape = await get('/chess-trainer/..%2f..%2fetc%2fpasswd');
    expect(escape.status).toBe(404);
    expect(await escape.text()).not.toContain('root:');
  });

  it('normalises the base path', () => {
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('chess-trainer')).toBe('/chess-trainer/');
    expect(normalizeBase('/chess-trainer')).toBe('/chess-trainer/');
  });
});

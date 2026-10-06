#!/usr/bin/env node
/**
 * Renders a small preview of every textured board (public/boards/<board>.<ext>, from the Lichess
 * repository) into public/boards/thumbs/<board>.jpg, 128 px square, using the Chromium that
 * ships with Playwright. The pickers show these, so opening Settings never downloads the full
 * textures; a board's full picture is fetched only once it is chosen.
 *
 * Usage: node scripts/generate-board-thumbs.mjs
 */
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARDS = join(ROOT, 'public', 'boards');
const OUT = join(BOARDS, 'thumbs');
const SIZE = 128;
const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

const files = (await readdir(BOARDS)).filter((file) => extname(file) in TYPES).sort();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
for (const file of files) {
  const data = (await readFile(join(BOARDS, file))).toString('base64');
  const type = TYPES[extname(file)];
  await page.setContent(
    `<!doctype html><style>html,body{margin:0}</style>` +
      `<img src="data:${type};base64,${data}" width="${SIZE}" height="${SIZE}" alt="">`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  const name = `${file.slice(0, -extname(file).length)}.jpg`;
  await page.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 82 });
  console.log(`Wrote public/boards/thumbs/${name}`);
}
await browser.close();

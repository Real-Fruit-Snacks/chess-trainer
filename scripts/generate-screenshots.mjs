#!/usr/bin/env node
/**
 * Renders the screenshots the web app manifest lists (public/screenshots/),
 * which browsers show in their install dialog: two wide ones for desktops and
 * two narrow ones for phones, as WebP. They are not precached, so they cost
 * nothing offline.
 *
 * Run it against a production build:
 *
 *   npm run build && npm run preview          (in one terminal)
 *   npm run screenshots                       (in another)
 *
 * or pass another base URL: `node scripts/generate-screenshots.mjs http://127.0.0.1:4173/`.
 * The sizes written here must match the `sizes` of the manifest entries in vite.config.ts.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'screenshots');
const BASE = new URL(process.argv[2] ?? 'http://127.0.0.1:4173/');

/** The Opera Game (Morphy v the Duke of Brunswick and Count Isouard, Paris 1858). */
const OPERA_GAME =
  '[Event "Paris"]\n[Site "Paris FRA"]\n[Date "1858.??.??"]\n[White "Paul Morphy"]\n' +
  '[Black "Duke Karl / Count Isouard"]\n[Result "1-0"]\n\n' +
  '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 ' +
  '8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 ' +
  '14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0';

const WIDE = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const NARROW = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

/** A learner who has done the placement and seen the tour, so no welcome cards. */
function seed() {
  const progress = {
    state: { onboarded: true, puzzleRating: 1500, puzzleRd: 80, tourDismissed: true },
    version: 7,
  };
  localStorage.setItem('chess-trainer:progress', JSON.stringify(progress));
}

/** A bundled puzzle near 1500, the same one each run: the first of the band's first file. */
async function puzzleId(page) {
  const index = await (await page.request.get(new URL('puzzles/index.json', BASE).href)).json();
  const band = index.buckets.find((b) => b.min <= 1500 && 1500 <= b.max) ?? index.buckets[0];
  const list = await (
    await page.request.get(new URL(`puzzles/${band.files[0]}`, BASE).href)
  ).json();
  return list[0].id;
}

const SHOTS = [
  {
    file: 'wide-puzzles.webp',
    device: WIDE,
    async go(page) {
      await page.goto(new URL(`puzzles?id=${await puzzleId(page)}`, BASE).href);
      await page
        .locator('.puzzle-status')
        .filter({ hasText: /Your move/ })
        .waitFor();
    },
  },
  {
    file: 'wide-analyze.webp',
    device: WIDE,
    async go(page) {
      const fragment = new URLSearchParams({ pgn: OPERA_GAME, ply: '29' }).toString();
      await page.goto(new URL(`analyze#${fragment}`, BASE).href);
      await page.getByRole('button', { name: 'Review game' }).click();
      await page.locator('.evalgraph').first().waitFor({ timeout: 120_000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page
        .locator('.engine-status')
        .filter({ hasText: /depth (1[4-9]|2\d)/ })
        .waitFor({
          timeout: 120_000,
        });
    },
  },
  {
    file: 'narrow-puzzles.webp',
    device: NARROW,
    async go(page) {
      await page.goto(new URL(`puzzles?id=${await puzzleId(page)}`, BASE).href);
      await page
        .locator('.puzzle-status')
        .filter({ hasText: /Your move/ })
        .waitFor();
    },
  },
  {
    file: 'narrow-lesson.webp',
    device: NARROW,
    async go(page) {
      await page.goto(new URL('learn/opening-principles', BASE).href);
      await page.getByTestId('lesson-task').waitFor();
    },
  },
];

/* global Image, document, window -- these run inside the page */

/** Re-encodes a PNG screenshot as WebP with the browser's own encoder. */
async function toWebp(page, png) {
  const dataUrl = await page.evaluate(
    async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', 0.82);
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      ...shot.device,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await context.addInitScript(seed);
    const page = await context.newPage();
    await shot.go(page);
    // Let the last animation and the engine's arrows settle.
    await page.waitForTimeout(600);
    const png = await page.screenshot({ type: 'png' });
    const webp = await toWebp(page, png);
    await writeFile(join(OUT, shot.file), webp);
    const { width, height } = shot.device.viewport;
    const scale = shot.device.deviceScaleFactor;
    console.log(
      `  screenshots/${shot.file} (${width * scale}×${height * scale}, ${Math.round(webp.length / 1024)} KB)`,
    );
    await context.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

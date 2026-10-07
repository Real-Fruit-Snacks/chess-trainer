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
import { launchBrowser, OPERA_GAME, puzzleId, seedLearner, toWebp } from './lib/screenshots.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'screenshots');
const BASE = new URL(process.argv[2] ?? 'http://127.0.0.1:4173/');

/* global window -- runs inside the page */

const WIDE = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const NARROW = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const SHOTS = [
  {
    file: 'wide-puzzles.webp',
    device: WIDE,
    async go(page) {
      await page.goto(new URL(`puzzles?id=${await puzzleId(page, BASE)}`, BASE).href);
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
      await page.goto(new URL(`puzzles?id=${await puzzleId(page, BASE)}`, BASE).href);
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

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await launchBrowser();
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      ...shot.device,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await context.addInitScript(seedLearner);
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

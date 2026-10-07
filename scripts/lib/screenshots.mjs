/**
 * What the two screenshot scripts share (scripts/generate-screenshots.mjs for the install dialog,
 * scripts/readme-screenshots.mjs for the README): the browser, a learner who has finished the
 * welcome, a pinned puzzle, a classic game to review and the WebP encoder.
 */
import { chromium } from '@playwright/test';

/** The Opera Game (Morphy v the Duke of Brunswick and Count Isouard, Paris 1858). */
export const OPERA_GAME =
  '[Event "Paris"]\n[Site "Paris FRA"]\n[Date "1858.??.??"]\n[White "Paul Morphy"]\n' +
  '[Black "Duke Karl / Count Isouard"]\n[Result "1-0"]\n\n' +
  '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 ' +
  '8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 ' +
  '14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0';

/** Chromium from Playwright, or the one PLAYWRIGHT_CHROMIUM_PATH names. */
export function launchBrowser() {
  return chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
}

/**
 * A learner who has done the placement and seen the tour, so no welcome cards. Runs in the page
 * (an init script), so it takes everything it needs as its argument.
 * @param {{ progress?: Record<string, unknown> }} [seed]
 */
export function seedLearner(seed = {}) {
  const state = {
    onboarded: true,
    puzzleRating: 1500,
    puzzleRd: 80,
    tourDismissed: true,
    ...seed.progress,
  };
  localStorage.setItem('chess-trainer:progress', JSON.stringify({ state, version: 8 }));
}

/**
 * The first puzzle of the first file of the band that holds `rating`: the same one each run.
 * @param {import('@playwright/test').Page} page
 * @param {URL} base
 */
export async function puzzleId(page, base, rating = 1500) {
  const index = await (await page.request.get(new URL('puzzles/index.json', base).href)).json();
  const band = index.buckets.find((b) => b.min <= rating && rating <= b.max) ?? index.buckets[0];
  const list = await (
    await page.request.get(new URL(`puzzles/${band.files[0]}`, base).href)
  ).json();
  return list[0].id;
}

/* global Image, document -- these run inside the page */

/**
 * Re-encodes a PNG screenshot as WebP with the browser's own encoder.
 * @param {import('@playwright/test').Page} page
 * @param {Buffer} png
 */
export async function toWebp(page, png, quality = 0.82) {
  const dataUrl = await page.evaluate(
    async ([src, q]) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', q);
    },
    [`data:image/png;base64,${png.toString('base64')}`, quality],
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

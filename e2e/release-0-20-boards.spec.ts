import { expect, type Page, test } from '@playwright/test';
import { expectBoard } from './helpers';

/**
 * 0.20: every Lichess board. The flat ones are drawn from their two colours; the textured ones
 * are pictures, fetched the first time the board is shown (the pickers show small previews) and
 * kept by the service worker for offline use, with the board's colours underneath meanwhile.
 */
async function seed(page: Page, settings: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([settingsJson]) => {
      localStorage.setItem(
        'chess-trainer:progress',
        JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
      );
      // Seeded once; later pages keep what the test changed.
      if (!localStorage.getItem('chess-trainer:settings')) {
        localStorage.setItem('chess-trainer:settings', settingsJson);
      }
    },
    [JSON.stringify({ state: { playCoach: false, ...settings }, version: 3 })] as const,
  );
}

function basePath(baseURL: string | undefined): string {
  return new URL(baseURL ?? 'http://127.0.0.1/').pathname;
}

const background = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundImage);

test.describe('board themes from Lichess', () => {
  test('a textured board is previewed small, then drawn on every board once chosen', async ({
    page,
    baseURL,
  }) => {
    const base = basePath(baseURL);
    await seed(page);
    const fetched: string[] = [];
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith(`${base}boards/`) && response.ok()) {
        fetched.push(path.slice(base.length));
      }
    });

    await page.goto('/settings');
    const boards = page.getByRole('group', { name: 'Board theme' });
    await expect(boards.getByRole('button')).toHaveCount(28);
    await expect(boards.getByRole('button', { name: 'Brown' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const wood = boards.getByRole('button', { name: 'Wood', exact: true });
    expect(await wood.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
      `${base}boards/thumbs/wood.jpg`,
    );
    // The previews load; the full pictures stay on the server.
    await expect.poll(() => fetched.includes('boards/thumbs/wood.jpg')).toBe(true);
    expect(fetched.filter((path) => !path.startsWith('boards/thumbs/'))).toEqual([]);

    await wood.click();
    await expect(wood).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main')).toContainText(
      'Wood — from Lichess, by the lila authors and pirouetti (AGPL-3.0).',
    );

    // The analysis board shows the picture over its colours, and the picture loads.
    await page.goto('/analyze');
    await expectBoard(page);
    await expect
      .poll(() => background(page, 'cg-board'))
      .toMatch(new RegExp(`^url\\("[^"]*${base}boards/wood\\.jpg"\\), url\\("data:image/svg`));
    await expect.poll(() => fetched.includes('boards/wood.jpg')).toBe(true);
    const picture = await page.request.get(`${base}boards/wood.jpg`);
    expect(picture.headers()['content-type']).toContain('image/jpeg');

    // So do the drills' boards, whose squares only tint it.
    await page.goto('/drills/coordinates');
    const clickboard = page.locator('.clickboard');
    await expect(clickboard).toHaveClass(/clickboard--texture/);
    expect(await background(page, '.clickboard')).toContain(`${base}boards/wood.jpg`);
    expect(
      await page
        .locator('.clickboard__square--dark')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgba(0, 0, 0, 0)');
  });

  test('a flat board is drawn from its colours with nothing to fetch', async ({ page }) => {
    await seed(page, { boardTheme: 'green' });
    await page.goto('/analyze');
    await expectBoard(page);
    const image = decodeURIComponent(await background(page, 'cg-board'));
    expect(image).toMatch(/^url\("data:image\/svg\+xml;utf8,/);
    expect(image).toContain('#ffffdd');
    expect(image).toContain('#86a666');
  });

  test('the board picture is kept for offline use', async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    const base = basePath(baseURL);
    await seed(page, { boardTheme: 'marble' });
    await page.goto('/analyze');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    // The first load's picture passed before the worker took over; the next one is kept.
    await page.reload();
    await expectBoard(page);
    const url = new URL(`${base}boards/marble.jpg`, baseURL).href;
    await expect
      .poll(() =>
        page.evaluate(async (href) => {
          const cache = await caches.open('chess-trainer-boards');
          return (await cache.match(href)) !== undefined;
        }, url),
      )
      .toBe(true);
    // Not in the install: the pictures (PNG and SVG ones included) are fetched only when shown.
    const worker = await (await page.request.get(`${base}sw.js`)).text();
    expect(worker).not.toMatch(/boards\/(?:pink\.png|newspaper\.svg|thumbs\/)/);

    // Served from the device's copy with no network. (Playwright's WebKit fails every request
    // while emulating offline, the worker's included, so there it is fetched online: the copy
    // checked above is what the worker serves.)
    await context.setOffline(browserName !== 'webkit');
    try {
      const offline = await page.evaluate(async (href) => {
        const response = await fetch(href);
        return { status: response.status, type: response.headers.get('content-type') };
      }, url);
      expect(offline.status).toBe(200);
      expect(offline.type).toContain('image/jpeg');
    } finally {
      await context.setOffline(false);
    }
  });
});

import { expect, test } from '@playwright/test';

/**
 * The experimental multi-threaded engine: the setting stores a flag the
 * service worker reads, the next navigation is served with COOP/COEP headers,
 * the page becomes cross-origin isolated and the threaded build starts.
 */
test.describe('multi-threaded engine', () => {
  test.beforeEach(async ({ page }) => {
    // The container running the tests may have few cores; the thread count is
    // derived from this value, so pin it to keep the expectations stable.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
    });
  });

  test('switches cross-origin isolation on and off across reloads', async ({ page }) => {
    await page.goto('/progress');
    const status = page.getByTestId('engine-threads-status');
    await expect(status).toContainText(/Off/);
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);

    // Wait for the service worker to control the page, then opt in.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByText('Multi-threaded engine (experimental)').click();
    await expect(status).toContainText(/Reload the app/);

    await page.getByRole('button', { name: 'Reload now' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByTestId('engine-threads-status')).toContainText(/using 3 threads/);
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');

    // The analysis board now runs the threaded build.
    await page.goto('/analyze');
    await expect(page.locator('.engine-status')).toContainText('3 threads', { timeout: 30_000 });
    await expect(page.locator('.engine-status')).toContainText(/depth \d+/, { timeout: 30_000 });

    // Switching it off restores a plain document on the next load.
    await page.goto('/progress');
    await page.getByText('Multi-threaded engine (experimental)').click();
    await page.getByRole('button', { name: 'Reload now' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByTestId('engine-threads-status')).toContainText(/Off/);
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  });

  test('cross-origin API calls still work while isolated', async ({ page }) => {
    await page.goto('/progress');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByText('Multi-threaded engine (experimental)').click();
    await page.getByRole('button', { name: 'Reload now' }).click();
    await page.waitForLoadState('load');
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

    // CORS requests are allowed under COEP require-corp; mock the network so
    // the test does not depend on lichess.org being reachable.
    await page.route('https://lichess.org/api/games/user/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-chess-pgn',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '[Event "Test"]\n[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0\n',
      }),
    );
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page
      .getByRole('group', { name: 'Import source' })
      .getByRole('button', { name: 'Lichess' })
      .click();
    await page.getByLabel('Lichess username').fill('someone');
    await page.getByRole('button', { name: 'Fetch recent games' }).click();
    await expect(page.getByRole('listitem').first()).toContainText('a');
  });
});

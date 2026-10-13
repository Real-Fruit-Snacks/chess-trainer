import { expect, type Page, test } from '@playwright/test';
import { dismissToasts } from './helpers';

/**
 * The engine's two upgrades over the one-thread lite build.
 *
 * Threads are on by default: the service worker serves every page with the
 * COOP/COEP headers from its second load on, the page is cross-origin
 * isolated and the threaded build starts. The full engine is a switch in
 * Settings that downloads Stockfish's large network (99 MB) and keeps it on
 * the device, offline included, until the switch goes off again.
 */

/** Waits for the service worker to take over, then reloads into an isolated page. */
async function reloadIsolated(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.reload();
  await page.waitForLoadState('load');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
}

/** Clicks the settings' "Reload now" and waits for the new document, not the old one's load state. */
async function reloadNow(page: Page) {
  const loaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Reload now' }).click();
  await loaded;
}

const threadsSwitch = (page: Page) => page.getByRole('switch', { name: /^Multi-threaded engine/ });
const fullSwitch = (page: Page) => page.getByRole('switch', { name: /^Full engine/ });
const engineStatus = (page: Page) => page.locator('.engine-status');

test.describe('multi-threaded engine', () => {
  test.beforeEach(async ({ page }) => {
    // The machine running the tests may have few cores; the thread count is
    // derived from this value, so pin it to keep the expectations stable.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
    });
  });

  test('is on by default and starts from the second load', async ({ page }) => {
    await page.goto('settings#engine');
    await expect(threadsSwitch(page)).toBeChecked();
    // The first visit has no service worker yet, so no headers: one thread for now.
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const status = page.getByTestId('engine-threads-status');
    await expect(status).toContainText('On from the next load');

    await reloadNow(page);
    await expect(page.getByTestId('engine-threads-status')).toContainText(
      'On — the engine is using 3 threads on this device.',
    );
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');
    await expect(page.getByRole('button', { name: 'Reload now' })).toHaveCount(0);

    // The analysis board runs the threaded lite build.
    await page.goto('analyze');
    await expect(engineStatus(page)).toContainText('Stockfish 19 lite · 3 threads', {
      timeout: 30_000,
    });
    await expect(engineStatus(page)).toContainText(/depth \d+/, { timeout: 30_000 });
  });

  test('switching threads off restores a plain document, and on again', async ({ page }) => {
    await page.goto('settings#engine');
    await reloadIsolated(page);

    await threadsSwitch(page).click();
    await expect(page.getByTestId('engine-threads-status')).toContainText(/^Off/);
    await expect(
      page.locator('.toast').filter({
        hasText: 'Reload the app to go back to the single-threaded engine.',
      }),
    ).toBeVisible();
    await reloadNow(page);
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
    await expect(threadsSwitch(page)).not.toBeChecked();

    await page.goto('analyze');
    await expect(engineStatus(page)).toContainText('Stockfish 19 lite', { timeout: 30_000 });
    await expect(engineStatus(page)).not.toContainText('threads');

    // The choice survives the reload; switching back on isolates the next load again.
    await page.goto('settings#engine');
    await dismissToasts(page);
    await threadsSwitch(page).click();
    await reloadNow(page);
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  });

  test('cross-origin API calls still work while isolated', async ({ page, browserName }) => {
    // Playwright's WebKit does not intercept a request from a page its service worker
    // isolated, so the mock below would be bypassed for the real lichess.org (where the
    // call works too: such a run imports real games).
    test.skip(browserName === 'webkit', 'Playwright cannot mock this request in WebKit');
    await page.goto('settings#engine');
    await reloadIsolated(page);

    // CORS requests are allowed under COEP require-corp; mock the network so the test
    // does not depend on lichess.org being reachable. My games runs no engine, so
    // nothing competes with the page for the processor.
    let requested = '';
    await page.route('https://lichess.org/api/games/user/**', (route) => {
      requested = route.request().url();
      return route.fulfill({
        status: 200,
        contentType: 'application/x-chess-pgn',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '[Event "Test"]\n[White "someone"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0\n',
      });
    });
    await page.goto('games');
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    await page.getByLabel('Lichess username').fill('someone');
    await page.getByRole('button', { name: /Fetch 30 most recent/ }).click();
    await expect(page.getByTestId('games-overview')).toContainText('Games imported');
    await expect(page.getByTestId('games-overview')).toContainText('1 / 0 / 0');
    expect(requested).toContain('/api/games/user/someone');
  });
});

test.describe('full engine', () => {
  // A 99 MB download, compiled by the browser: give it time on a slow machine.
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
    });
  });

  /** Whether the device keeps an engine file. */
  const stored = (page: Page, baseURL: string | undefined, file: string) =>
    page.evaluate(
      async (url) => (await caches.match(url)) !== undefined,
      new URL(`engine/${file}`, baseURL).href,
    );

  test('downloads, runs offline and is removed with its switch', async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    await page.goto('settings#engine');
    await reloadIsolated(page);
    const status = page.getByTestId('engine-full-status');
    await expect(status).toContainText(/^Off — the lite engine runs/);

    await fullSwitch(page).click();
    await expect(status).toContainText('Downloaded — every page that starts the engine', {
      timeout: 180_000,
    });
    await expect(
      page.locator('.toast').filter({ hasText: 'The full engine is downloaded:' }),
    ).toBeVisible();
    expect(await stored(page, baseURL, 'stockfish-19.js')).toBe(true);
    expect(await stored(page, baseURL, 'stockfish-19.wasm')).toBe(true);
    // Only the build this device runs: not the one-thread twin.
    expect(await stored(page, baseURL, 'stockfish-19-single.wasm')).toBe(false);

    const diagnostics = page.getByTestId('engine-diagnostics');
    await diagnostics.locator('summary').click();
    await expect(diagnostics).toContainText('On — downloaded');
    await expect(diagnostics).toContainText('Stockfish 19 · 3 threads');

    // It runs from the device's own copy: no network needed. (Playwright's WebKit
    // cannot navigate while emulating offline, so there it runs online, from the
    // same copy.)
    await context.setOffline(browserName !== 'webkit');
    try {
      await page.goto('analyze');
      await expect(engineStatus(page)).toContainText('Stockfish 19 · 3 threads', {
        timeout: 90_000,
      });
      await expect(engineStatus(page)).toContainText(/depth \d+/, { timeout: 90_000 });
    } finally {
      await context.setOffline(false);
    }

    // Switching it off deletes the download; the lite engine runs again.
    await page.goto('settings#engine');
    await dismissToasts(page);
    await fullSwitch(page).click();
    await expect(
      page.locator('.toast').filter({
        hasText: 'The full engine was removed from this device (99 MB freed)',
      }),
    ).toBeVisible();
    expect(await stored(page, baseURL, 'stockfish-19.wasm')).toBe(false);
    expect(await stored(page, baseURL, 'stockfish-19.js')).toBe(false);
    await page.goto('analyze');
    await expect(engineStatus(page)).toContainText('Stockfish 19 lite · 3 threads', {
      timeout: 30_000,
    });
  });

  test('a download stopped half-way leaves nothing behind', async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    // The network is slowed through the DevTools protocol, which only Chromium speaks.
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Needs Chromium network throttling');
    await page.goto('settings#engine');
    await reloadIsolated(page);
    const status = page.getByTestId('engine-full-status');

    // Slow enough to stop half-way. The page downloads the engine itself, past the
    // service worker, so the page's network conditions apply.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const throttle = (bytesPerSecond: number) =>
      cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: bytesPerSecond,
        uploadThroughput: -1,
      });
    await throttle(8 * 1024 * 1024);
    await fullSwitch(page).click();
    const bar = page.getByRole('progressbar', { name: 'Full engine download' });
    await expect(bar).toBeVisible();
    await expect(status).toContainText('Downloading the full engine:');
    await expect
      .poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(status).toContainText('Not downloaded yet — the lite engine runs until it is.');
    // Stopped means stopped: nothing lands in storage afterwards.
    await page.waitForTimeout(2000);
    expect(await stored(page, baseURL, 'stockfish-19.wasm')).toBe(false);
    await page.goto('analyze');
    await expect(engineStatus(page)).toContainText('Stockfish 19 lite · 3 threads', {
      timeout: 30_000,
    });

    // Its own button starts it again.
    await page.goto('settings#engine');
    await throttle(-1);
    await page.getByTestId('engine-full-download').click();
    await expect(status).toContainText('Downloaded — every page that starts the engine', {
      timeout: 180_000,
    });
    expect(await stored(page, baseURL, 'stockfish-19.wasm')).toBe(true);
  });
});

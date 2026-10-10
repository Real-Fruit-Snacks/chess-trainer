import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { offlineBundle } from './offlineBundle';

/**
 * The offline copy of a release (`npm run release:offline`), unpacked and
 * served by its own launcher (playwright.offline.config.ts): the app opens
 * cross-origin isolated, deep links work, every engine build and the
 * human-like opponent are there, and it goes on working with no network.
 */
const { version, dir } = offlineBundle();

test.describe('the offline copy', () => {
  test('opens cross-origin isolated, as the version it was built as', async ({ page, request }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
    await expect(page.locator('main h1').first()).toBeVisible();
    // The launcher isolates the very first visit: the threaded engine can run at once.
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    await expect(page.locator('.shell__footer')).toContainText(`Chess Trainer v${version}`);
    const ping = await request.get('/__chess-trainer/launcher');
    expect(await ping.json()).toEqual({ app: 'chess-trainer', version });
  });

  test('answers a deep link with the app, as the live site does', async ({ page }) => {
    const response = await page.goto('/learn/basic-checkmates');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Basic checkmates' })).toBeVisible();
  });

  test('serves every engine build and the human-like opponent with their types', async ({
    request,
  }) => {
    const files = ['engine', 'maia'].flatMap((folder) =>
      readdirSync(join(dir, 'app', folder))
        .filter((name) => /\.(js|wasm|onnx)$/.test(name))
        .map((name) => `${folder}/${name}`),
    );
    // Four engine builds (two of them the full engine) and the opponent's runtime.
    expect(files.filter((file) => file.endsWith('.wasm'))).toHaveLength(5);
    for (const file of files) {
      const head = await request.head(file);
      expect(head.status(), file).toBe(200);
      expect(head.headers()['content-type'], file).toBe(
        file.endsWith('.wasm')
          ? 'application/wasm'
          : file.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : 'application/octet-stream',
      );
    }
  });

  test('runs the engine', async ({ page }) => {
    await page.goto('/analyze');
    await expect(page.locator('.line__score').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/depth \d+/)).toBeVisible({ timeout: 30_000 });
  });

  test('goes on working with no network at all', async ({ page, context }) => {
    await page.goto('/');
    // The service worker holds the app once it controls the page.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    try {
      await page.goto('/learn/basic-checkmates');
      await expect(page.getByRole('heading', { level: 1, name: 'Basic checkmates' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});

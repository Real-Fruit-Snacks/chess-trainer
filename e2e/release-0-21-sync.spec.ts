import { type BrowserContext, expect, type Page, type Route, test } from '@playwright/test';
import { createRelay } from '../relay/src/handler.mjs';
import { memoryStore } from '../relay/src/memoryStore.mjs';
import { siteConfig } from '../src/site.config';

/**
 * 0.21: sync between devices, end to end — two (and three) browsers with
 * their own storage, the real relay code answering in place of the deployed
 * one, and the app's own encryption, phrase and merge. The relay answers
 * through routes, which the service worker would bypass, so it is kept out.
 */
test.use({ serviceWorkers: 'block' });

const PROGRESS_KEY = 'chess-trainer:progress';
const REPERTOIRE_KEY = 'chess-trainer:repertoire';

/** The relay, in this process: every device's requests reach the same vaults. */
function startRelay() {
  const store = memoryStore();
  const handle = createRelay({ store, minWriteIntervalMs: 0 });
  /** The vault ids requests named. */
  const ids = new Set<string>();
  const route = async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const id = /\/v1\/vaults\/([^/?]+)/.exec(request.url())?.[1];
    const posted = request.postDataBuffer();
    if (id) ids.add(id);
    const response = await handle(
      new Request(request.url(), {
        method,
        headers: request.headers(),
        body: posted && method !== 'GET' && method !== 'OPTIONS' ? new Uint8Array(posted) : null,
      }),
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  };
  return { store, ids, route };
}

type Relay = ReturnType<typeof startRelay>;

/** A device: its own browser storage, a learner with one repertoire of their own. */
async function device(
  context: BrowserContext,
  relay: Relay,
  repertoire: { id: string; name: string } | null,
): Promise<Page> {
  await context.route(`${siteConfig.syncRelay}/**`, relay.route);
  const page = await context.newPage();
  await page.addInitScript(
    ([progressKey, repertoireKey, rep]) => {
      if (localStorage.getItem(progressKey)) return;
      localStorage.setItem(
        progressKey,
        JSON.stringify({
          state: { onboarded: true, puzzleRating: 1250, puzzleRd: 60 },
          version: 8,
        }),
      );
      if (rep) {
        localStorage.setItem(
          repertoireKey,
          JSON.stringify({
            state: {
              cards: {},
              sessions: [],
              custom: [
                { ...JSON.parse(rep), color: 'white', pgn: '1. e4 c5 2. Nf3 *', createdAt: 1 },
              ],
            },
            version: 1,
          }),
        );
      }
    },
    [PROGRESS_KEY, REPERTOIRE_KEY, repertoire ? JSON.stringify(repertoire) : ''] as const,
  );
  return page;
}

/** Turns sync on and reads the recovery phrase off the dialog. */
async function turnOn(page: Page): Promise<string[]> {
  await page.goto('/settings#sync');
  await page.getByTestId('sync-turn-on').click();
  const list = page.getByTestId('sync-phrase-words');
  await expect(list.locator('li')).toHaveCount(12);
  await expect(page.getByTestId('sync-qr')).toBeVisible();
  const words = (await list.locator('li').allTextContents()).map((t) => t.replace(/^\d+/, ''));
  await page.getByTestId('sync-phrase-done').click();
  // Turning on sends what this device has (counted, when there is anything to count).
  await expect(page.getByTestId('sync-status')).toHaveText(/^Synced just now\. .* sent\.$/);
  return words;
}

async function repertoireNames(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    const custom = raw
      ? (JSON.parse(raw) as { state: { custom: { name: string }[] } }).state.custom
      : [];
    return custom.map((r) => r.name).sort();
  }, REPERTOIRE_KEY);
}

test.describe('sync between devices', () => {
  test('two devices join with the phrase and keep each other’s work', async ({ browser }) => {
    const relay = startRelay();
    const a = await device(await browser.newContext(), relay, {
      id: 'rep-a',
      name: 'Sicilian on A',
    });
    const b = await device(await browser.newContext(), relay, { id: 'rep-b', name: 'London on B' });

    const words = await turnOn(a);
    expect(words.every((w) => /^[a-z]{3,8}$/.test(w))).toBe(true);

    // The relay holds one sealed vault, and nothing it could read.
    expect(relay.store.size()).toBe(1);
    const vault = await relay.store.get([...relay.ids][0] ?? '');
    const bytes = Buffer.from(vault?.data ?? []);
    expect(bytes.subarray(0, 4).toString()).toBe('CTS1');
    expect(bytes.includes('Sicilian')).toBe(false);
    expect(bytes.includes('chess-trainer')).toBe(false);

    await b.goto('/settings#sync');
    await b.getByTestId('sync-join').click();
    await b.getByTestId('sync-join-phrase').fill(words.join(' '));
    // B has a repertoire of its own: both are kept by default.
    await expect(b.getByRole('radio', { name: /Keep both/ })).toBeChecked();
    await b.getByTestId('sync-join-confirm').click();
    // The toast says what came in.
    await expect(b.locator('.toast').first()).toContainText(
      'This device now syncs with your other devices: 1 repertoire came in.',
    );
    await expect(b.getByTestId('sync-status')).toContainText('Synced just now.');
    await expect.poll(() => repertoireNames(b)).toEqual(['London on B', 'Sicilian on A']);
    // What B added went up as it joined: the vault's second version.
    await expect
      .poll(async () => (await relay.store.get([...relay.ids][0] ?? ''))?.version)
      .toBe(2);

    // A brings in what B added, and says so, counted.
    await a.getByTestId('sync-now').click();
    await expect.poll(() => repertoireNames(a)).toEqual(['London on B', 'Sicilian on A']);
    await expect(a.getByTestId('sync-status')).toHaveText(
      'Synced just now. 1 repertoire from your other devices.',
    );
    await expect(
      a.getByTestId('sync-totals').locator('.stat', { hasText: 'Your repertoires' }),
    ).toContainText('2');
    await a.goto('/openings');
    await expect(a.locator('.repertoire-card', { hasText: 'London on B' })).toBeVisible();
  });

  test('a join link opens Settings ready to join, and leaves no phrase in the address', async ({
    browser,
  }) => {
    const relay = startRelay();
    const a = await device(await browser.newContext(), relay, null);
    const words = await turnOn(a);

    const c = await device(await browser.newContext(), relay, null);
    await c.goto(`/settings#sync=${words.join('-')}`);
    await expect(c.getByTestId('sync-join-phrase')).toHaveValue(words.join(' '));
    await expect(c).toHaveURL(/\/settings$/);
    await c.getByTestId('sync-join-confirm').click();
    await expect(c.getByTestId('sync-status')).toContainText('Synced just now.');
  });

  test('deleting the synced copy stops every device, which keep their data', async ({
    browser,
  }) => {
    const relay = startRelay();
    const a = await device(await browser.newContext(), relay, {
      id: 'rep-a',
      name: 'Sicilian on A',
    });
    const b = await device(await browser.newContext(), relay, null);
    const words = await turnOn(a);
    await b.goto('/settings#sync');
    await b.getByTestId('sync-join').click();
    await b.getByTestId('sync-join-phrase').fill(words.join(' '));
    await b.getByTestId('sync-join-confirm').click();
    await expect(b.getByTestId('sync-status')).toContainText('Synced just now.');

    await a.getByTestId('sync-delete').click();
    await a.getByTestId('sync-card').getByTestId('confirm-accept').click();
    await expect(a.getByTestId('sync-turn-on')).toBeVisible();
    expect(relay.store.size()).toBe(0);

    await b.getByTestId('sync-now').click();
    await expect(b.getByTestId('sync-stopped')).toBeVisible();
    expect(await repertoireNames(b)).toEqual(['Sicilian on A']);
    expect(await repertoireNames(a)).toEqual(['Sicilian on A']);
  });
});

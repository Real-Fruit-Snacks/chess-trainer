import { type BrowserContext, expect, type Page, type Route } from '@playwright/test';
import { createRelay } from '../relay/src/handler.mjs';
import { memoryStore } from '../relay/src/memoryStore.mjs';
import { siteConfig } from '../src/site.config';

/**
 * Sync between devices in the end-to-end tests: the real relay code, in this
 * process, answering every device's requests through routes (the service
 * worker would bypass them, so the specs block it), and devices with their
 * own browser storage.
 */

const PROGRESS_KEY = 'chess-trainer:progress';
export const REPERTOIRE_KEY = 'chess-trainer:repertoire';

/** The relay, in this process: every device's requests reach the same vaults. */
export function startRelay() {
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

export type Relay = ReturnType<typeof startRelay>;

/** A device: its own browser storage, a learner with one repertoire of their own. */
export async function device(
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
export async function turnOn(page: Page): Promise<string[]> {
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

/** Joins the sync on `page` with the phrase, from Settings. */
export async function join(page: Page, words: readonly string[]): Promise<void> {
  await page.goto('/settings#sync');
  await page.getByTestId('sync-join').click();
  await page.getByTestId('sync-join-phrase').fill(words.join(' '));
  await page.getByTestId('sync-join-confirm').click();
  await expect(page.getByTestId('sync-status')).toContainText('Synced just now.');
}

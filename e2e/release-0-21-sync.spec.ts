import { expect, type Page, test } from '@playwright/test';
import { device, REPERTOIRE_KEY, startRelay, turnOn } from './sync';

/**
 * 0.21: sync between devices, end to end — two (and three) browsers with
 * their own storage, the real relay code answering in place of the deployed
 * one, and the app's own encryption, phrase and merge. The relay answers
 * through routes, which the service worker would bypass, so it is kept out.
 */
test.use({ serviceWorkers: 'block' });

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

    // B stops at its next sync: Sync now, or one it ran by itself meanwhile (the one that
    // follows joining may be under way already).
    const stopped = b.getByTestId('sync-stopped');
    await expect(async () => {
      if (await b.getByTestId('sync-now').isVisible()) {
        await b.getByTestId('sync-now').click({ timeout: 2_000 });
      }
      await expect(stopped).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    expect(await repertoireNames(b)).toEqual(['Sicilian on A']);
    expect(await repertoireNames(a)).toEqual(['Sicilian on A']);
  });
});

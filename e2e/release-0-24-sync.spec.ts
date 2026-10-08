import { expect, type Page, test } from '@playwright/test';
import { device, join, startRelay, turnOn } from './sync';

/**
 * 0.24: the settings sync too, and each device chooses what it syncs. Two
 * browsers with their own storage and the real relay code: a device joining
 * takes the synced settings, a setting changed on one device reaches the
 * other, the engine settings stay with each device, and a part switched off
 * on one device stays as it is there until it is switched on again, when what
 * changed on both sides comes together.
 */
test.use({ serviceWorkers: 'block' });

const coordinates = (page: Page) => page.getByRole('switch', { name: 'Show coordinates' });
const legalMoves = (page: Page) => page.getByRole('switch', { name: 'Show legal move dots' });
const parts = (page: Page) => page.getByRole('group', { name: 'What syncs on this device' });

/** The device's own settings as stored (the engine build, the install prompt). */
const deviceSettings = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('chess-trainer:device-settings');
    return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null;
  });

/** When the device last finished a sync, as stored. */
const lastSyncAt = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('chess-trainer:device-sync');
    return raw
      ? ((JSON.parse(raw) as { state: { lastSyncAt?: number } }).state.lastSyncAt ?? 0)
      : 0;
  });

/** Syncs `page` from Settings and waits until that sync has finished. */
async function syncNow(page: Page) {
  await page.goto('/settings#sync');
  const before = await lastSyncAt(page);
  await page.getByTestId('sync-now').click();
  await expect.poll(() => lastSyncAt(page)).toBeGreaterThan(before);
  await expect(page.getByTestId('sync-status')).toContainText('Synced just now.');
}

test.describe('settings between devices', () => {
  test('follow the learner to every device; the engine settings stay', async ({ browser }) => {
    const relay = startRelay();
    const a = await device(await browser.newContext(), relay, null);
    const b = await device(await browser.newContext(), relay, null);

    // A hides the coordinates and runs the engine on one thread.
    await a.goto('/settings');
    await coordinates(a).click();
    await expect(coordinates(a)).not.toBeChecked();
    await a.goto('/settings#engine');
    await a.getByRole('switch', { name: /^Multi-threaded engine/ }).click();
    await expect(a.getByRole('switch', { name: /^Multi-threaded engine/ })).not.toBeChecked();

    const words = await turnOn(a);
    await expect(a.getByTestId('sync-status')).toHaveText(/ and 1 setting sent\.$/);

    // B joins: its board looks as A's does, and its engine keeps its threads.
    await join(b, words);
    await b.goto('/settings');
    await expect(coordinates(b)).not.toBeChecked();
    await b.goto('/settings#engine');
    await expect(b.getByRole('switch', { name: /^Multi-threaded engine/ })).toBeChecked();
    expect(await deviceSettings(b)).toMatchObject({ engineThreads: true });

    // A setting changed on B reaches A at its next sync, counted.
    await b.goto('/settings');
    await legalMoves(b).click();
    await expect(legalMoves(b)).not.toBeChecked();
    await syncNow(b);
    await syncNow(a);
    await expect(a.getByTestId('sync-status')).toContainText('1 setting from your other devices.');
    await a.goto('/settings');
    await expect(legalMoves(a)).not.toBeChecked();
    expect(await deviceSettings(a)).toMatchObject({ engineThreads: false });
  });

  test('a device keeps a part to itself, and syncs it again later', async ({ browser }) => {
    const relay = startRelay();
    const a = await device(await browser.newContext(), relay, null);
    const b = await device(await browser.newContext(), relay, null);
    const words = await turnOn(a);
    await join(b, words);

    // B keeps its settings to itself: every switch was on.
    const bParts = parts(b);
    await expect(bParts.getByRole('switch')).toHaveCount(5);
    for (const name of ['Progress', 'Repertoires', 'Saved analyses', 'Imported games']) {
      await expect(bParts.getByRole('switch', { name })).toBeChecked();
    }
    await bParts.getByRole('switch', { name: 'Settings' }).click();
    await expect(bParts.getByRole('switch', { name: 'Settings' })).not.toBeChecked();

    // A hides the coordinates; B, keeping its settings, does not follow.
    await a.goto('/settings');
    await coordinates(a).click();
    await syncNow(a);
    await syncNow(b);
    await b.goto('/settings');
    await expect(coordinates(b)).toBeChecked();
    // B hides the legal-move dots, on B alone for now.
    await legalMoves(b).click();
    await syncNow(a);
    await a.goto('/settings');
    await expect(legalMoves(a)).toBeChecked();

    // B syncs its settings again: each side's change comes to the other.
    await b.goto('/settings#sync');
    await parts(b).getByRole('switch', { name: 'Settings' }).click();
    await expect(b.getByTestId('sync-status')).toHaveText(
      /^Synced just now\. 1 setting from your other devices; 1 setting sent\.$/,
    );
    await b.goto('/settings');
    await expect(coordinates(b)).not.toBeChecked();
    await expect(legalMoves(b)).not.toBeChecked();
    await syncNow(a);
    await a.goto('/settings');
    await expect(legalMoves(a)).not.toBeChecked();
    await expect(coordinates(a)).not.toBeChecked();
  });
});

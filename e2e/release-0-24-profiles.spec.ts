import { expect, type Page, test } from '@playwright/test';

/**
 * 0.24: settings per profile. A new profile starts with the settings of the
 * one it was made from, then keeps its own; the engine settings belong to the
 * device, the same in every profile.
 */
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('chess-trainer:progress')) return;
    localStorage.setItem(
      'chess-trainer:progress',
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 8 }),
    );
  });
}

const coordinates = (page: Page) => page.getByRole('switch', { name: 'Show coordinates' });
const threads = (page: Page) => page.getByRole('switch', { name: /^Multi-threaded engine/ });

/** Switches to the other profile (of two: only the inactive one offers Switch). */
async function switchProfile(page: Page, name: string) {
  await page.goto('/settings#profiles');
  await page.getByTestId('profiles').getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByTestId('profile-badge')).toHaveText(name, { timeout: 15_000 });
}

test('each profile keeps its own settings, and the device its engine settings', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/settings');
  await coordinates(page).click();
  await expect(coordinates(page)).not.toBeChecked();

  await page.goto('/settings#profiles');
  await page.getByTestId('new-profile-name').fill('Ada');
  await page.getByRole('button', { name: 'Add profile' }).click();
  await switchProfile(page, 'Ada');

  // Ada starts with the settings of the profile she was made from…
  await page.goto('/settings');
  await expect(coordinates(page)).not.toBeChecked();
  // …then keeps her own.
  await coordinates(page).click();
  await expect(coordinates(page)).toBeChecked();
  await page.goto('/settings#engine');
  await threads(page).click();
  await expect(threads(page)).not.toBeChecked();

  await switchProfile(page, 'Me');
  await page.goto('/settings');
  await expect(coordinates(page)).not.toBeChecked();
  // The engine settings are the device's: the same here.
  await page.goto('/settings#engine');
  await expect(threads(page)).not.toBeChecked();
});

import { expect, type Page, test } from '@playwright/test';

/**
 * Visual regression: pixel snapshots of the pages that do not depend on the
 * date, the engine or random content, so a CSS change that moves things
 * around is caught before it ships. Baselines live next to this file
 * (`visual.spec.ts-snapshots/`); regenerate them on purpose with
 * `npx playwright test visual --update-snapshots` after a deliberate design
 * change and commit the result.
 */
const PAGES: { path: string; name: string; mask?: string[] }[] = [
  { path: '/settings', name: 'settings', mask: ['.faint'] },
  { path: '/arcade', name: 'arcade' },
  { path: '/drills', name: 'drills' },
  { path: '/learn', name: 'learn' },
  { path: '/reference', name: 'reference' },
];

async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'chess-trainer:progress',
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
    );
    // Colour scheme pinned, animations off: a snapshot must not depend on the machine.
    localStorage.setItem(
      'chess-trainer:settings',
      JSON.stringify({ state: { colorScheme: 'light', animations: false }, version: 3 }),
    );
  });
}

test.describe('visual snapshots', () => {
  // No service worker: its "ready to work offline" toast arrives whenever the
  // precache finishes, which must not decide what a snapshot shows.
  test.use({ serviceWorkers: 'block' });

  for (const { path, name, mask } of PAGES) {
    test(`${name} looks as it did`, async ({ page }) => {
      await seed(page);
      await page.goto(path);
      await expect(page.locator('main h1').first()).toBeVisible();
      // Let fonts and lazy content settle.
      await page.waitForTimeout(1000);
      // The first screen only, at CSS pixels: enough to catch a layout change,
      // small enough to keep in the repository.
      await expect(page).toHaveScreenshot(`${name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        maxDiffPixelRatio: 0.02,
        mask: (mask ?? []).map((selector) => page.locator(selector)),
      });
    });
  }
});

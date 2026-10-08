import { expect, type Page, test } from '@playwright/test';

/**
 * 0.23: Settings in tabs — Appearance, Play, Engine, Sync & data and App. The
 * address names the open tab, links to a card open its tab, the keyboard moves
 * between the tabs, and every tab fits a 320px phone.
 */
async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'chess-trainer:progress',
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
    );
  });
}

const TABS = ['Appearance', 'Play', 'Engine', 'Sync & data', 'App'] as const;

test.describe('settings in tabs', () => {
  test('one tab at a time, named in the address and kept on reload', async ({ page }) => {
    await seed(page);
    await page.goto('/settings');
    const tabs = page.getByRole('tablist', { name: 'Settings sections' });
    await expect(tabs.getByRole('tab')).toHaveText([...TABS]);
    await expect(page.getByRole('tab', { name: 'Appearance' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Engine & analysis' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Engine' }).click();
    await expect(page).toHaveURL(/\/settings#engine$/);
    await expect(page.getByRole('heading', { name: 'Engine & analysis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Board', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Engine' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // A link to a card opens its tab and brings the card into view.
    await page.goto('/settings#lichess');
    await expect(page.getByRole('tab', { name: 'Sync & data' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('lichess-card')).toBeInViewport();
  });

  test('the keyboard moves between the tabs', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard test');
    await seed(page);
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Appearance' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Play' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Puzzle rating' })).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'App', exact: true })).toBeFocused();
    await expect(page.getByTestId('open-lab')).toBeVisible();
    // Tab leaves the tab list for the open tab's controls.
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tab', { name: 'Appearance' })).not.toBeFocused();
    await expect(page.getByRole('tablist').locator(':focus')).toHaveCount(0);
  });
});

test.describe('settings tabs on a 320px phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test('every tab fits without scrolling sideways', async ({ page }) => {
    await seed(page);
    await page.goto('/settings');
    for (const name of TABS) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const widths = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        tabs: document.querySelector('[role="tablist"]')?.getBoundingClientRect().right ?? 0,
      }));
      expect(widths.document, name).toBeLessThanOrEqual(widths.viewport);
      expect(widths.tabs, name).toBeLessThanOrEqual(widths.viewport);
    }
  });
});

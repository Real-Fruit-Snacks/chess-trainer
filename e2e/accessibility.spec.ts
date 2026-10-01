import { expect, test } from '@playwright/test';
import { expectBoard, playMove } from './helpers';

test.describe('accessibility', () => {
  test('the keyboard shortcut reference opens with ? and closes with Escape', async ({ page }) => {
    await page.goto('/learn');
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Previous / next move')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // The footer link opens it too.
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(dialog).toBeVisible();
  });

  test('skip link and focus management', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();

    // In-app navigation moves focus to the new page's main region.
    await page
      .getByRole('link', { name: 'Learn', exact: true })
      .locator('visible=true')
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
    await expect(page.locator('#main')).toBeFocused();
  });

  test('moves are announced to screen readers', async ({ page }) => {
    await page.goto('/learn/how-pieces-move');
    const board = await expectBoard(page);
    const live = page.locator('.board__announce').first();
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await playMove(board, 'd4', 'h4');
    await expect(live).toContainText('White plays rook d4 to h4');
  });

  test('the high-contrast board theme applies colour-blind-safe highlights', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'High contrast' }).click();
    await expect(page.getByText(/colour-blind-safe highlights/)).toBeVisible();
    await page.goto('/learn/how-pieces-move');
    await expectBoard(page);
    await expect(page.locator('.board').first()).toHaveClass(/board--theme-contrast/);
  });

  test('respects prefers-reduced-motion for board animation', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/learn/how-pieces-move');
    await expectBoard(page);
    await expect(page.locator('.board').first()).toHaveAttribute('data-animated', 'false');
    await context.close();
  });

  test('animates by default', async ({ page }) => {
    await page.goto('/learn/how-pieces-move');
    await expectBoard(page);
    await expect(page.locator('.board').first()).toHaveAttribute('data-animated', 'true');
  });
});

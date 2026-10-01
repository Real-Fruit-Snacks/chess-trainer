import { expect, type Page, test } from '@playwright/test';

const PROGRESS_KEY = 'chess-trainer:progress';

async function seedProgress(page: Page, state: Record<string, unknown>, version = 6) {
  await page.addInitScript(
    ([storageKey, value]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value);
    },
    [PROGRESS_KEY, JSON.stringify({ state, version })] as const,
  );
}

test.describe('test lab', () => {
  test('opens from Settings and exercises sounds, feedback, storage and the crash page', async ({
    page,
  }) => {
    await seedProgress(page, { onboarded: true });
    await page.goto('/settings');
    await page.getByTestId('storage-usage').waitFor();
    await expect(page.getByTestId('storage-usage')).toContainText(/Local data: \d+ (B|KB|MB)/);
    await page.getByTestId('open-lab').click();
    await expect(page).toHaveURL(/\/settings\/lab$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test lab');

    // Platform checks come from the real browser.
    await expect(page.getByTestId('check-wasm')).toContainText('Yes');
    await expect(page.getByTestId('check-workers')).toContainText('Yes');
    await expect(page.getByTestId('check-viewport')).toContainText(/\d+ × \d+/);

    // Every icon and every sound cue has a button or a tile.
    expect(await page.locator('[data-testid^="icon-"]').count()).toBeGreaterThanOrEqual(40);
    expect(await page.locator('[data-testid^="sound-"]').count()).toBe(10);
    await page.getByTestId('sound-capture').click();
    await page.getByTestId('haptic-check').click();

    // Feedback: a toast and the dialog.
    await page.getByTestId('toast-success').click();
    await expect(page.locator('.toast').last()).toContainText('A success toast.');
    await page.getByTestId('open-dialog').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).toBeHidden();

    // The board previews render with the current set and the promotion menu appears.
    await page.getByTestId('palette-green').click();
    await expect(page.getByTestId('palette-green')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('show-promotion').click();
    await expect(page.getByRole('button', { name: 'Queen' })).toBeVisible();
    await page.getByRole('button', { name: 'Queen' }).click();

    // Storage: fill it, see the warning a learner would see, and clean up.
    await expect(page.getByTestId('storage-ok')).toBeVisible();
    await page.getByTestId('storage-fill').click();
    await expect(page.getByTestId('lab-storage')).toContainText('Storage is full', {
      timeout: 30_000,
    });
    await expect(page.locator('.toast', { hasText: 'Storage is full' })).toBeVisible();
    await page.getByTestId('storage-clear').click();
    await expect(page.getByTestId('storage-ok')).toBeVisible();
    const fillerLeft = await page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.includes('lab-filler')).length,
    );
    expect(fillerLeft).toBe(0);

    // The crash page, with a report link that already knows the version.
    await page.getByTestId('crash').click();
    const crash = page.getByTestId('crash-page');
    await expect(crash).toContainText('Test lab: deliberate crash');
    await expect(crash).toContainText('Route: /settings/lab');
    const report = crash.getByRole('link', { name: 'Report a bug' });
    expect(await report.getAttribute('href')).toContain('template=bug_report.yml');
    await crash.getByRole('link', { name: 'Go home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('cg-board, .home__hero, h1').first()).toBeVisible();
  });
});

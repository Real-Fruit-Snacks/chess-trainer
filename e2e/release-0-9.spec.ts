import { expect, type Page, test } from '@playwright/test';

const PROGRESS_KEY = 'chess-trainer:progress';
/** The cues of a sound set (sound.ts), each with a button in the lab. */
const SOUND_CUES = 11;

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
    await page.goto('/settings#storage');
    await page.getByTestId('storage-usage').waitFor();
    await expect(page.getByTestId('storage-usage')).toContainText(/Local data: \d+ (B|KB|MB)/);
    await page.getByRole('tab', { name: 'App', exact: true }).click();
    await page.getByTestId('open-lab').click();
    await expect(page).toHaveURL(/\/settings\/lab$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test lab');

    // Platform checks come from the real browser.
    await expect(page.getByTestId('check-wasm')).toContainText('Yes');
    await expect(page.getByTestId('check-workers')).toContainText('Yes');
    await expect(page.getByTestId('check-viewport')).toContainText(/\d+ × \d+/);

    // Every icon and every sound cue has a button or a tile.
    expect(await page.locator('[data-testid^="icon-"]').count()).toBeGreaterThanOrEqual(40);
    expect(await page.locator('[data-testid^="sound-"]').count()).toBe(SOUND_CUES);
    await page.getByTestId('sound-capture').click();
    await page.getByTestId('haptic-check').click();

    // Feedback: a toast and the dialog.
    await page.getByTestId('toast-success').click();
    // Its own toast, wherever it sits: "Ready to work offline" may arrive at the same moment.
    await expect(page.locator('.toast', { hasText: 'A success toast.' })).toBeVisible();
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

test.describe('sound theme and volume', () => {
  test('Retro and the volume slider persist, and the lab follows them', async ({ page }) => {
    await seedProgress(page, { onboarded: true });
    await page.goto('/settings');
    const themes = page.getByRole('radiogroup', { name: 'Sound theme' });
    await expect(themes.getByRole('radio')).toHaveText(['Standard', 'Soft', 'Retro']);
    await themes.getByRole('radio', { name: 'Retro' }).click();
    await expect(themes.getByRole('radio', { name: 'Retro' })).toBeChecked();

    // The slider moves in steps of 5 % from the keyboard and shows its value.
    const slider = page.getByRole('slider', { name: 'Volume' });
    await expect(slider).toHaveValue('100');
    await slider.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveValue('70');
    await expect(slider).toHaveAttribute('aria-valuetext', '70%');
    await expect(page.getByText('70%')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('70');
    await expect(
      page.getByRole('radiogroup', { name: 'Sound theme' }).getByRole('radio', { name: 'Retro' }),
    ).toBeChecked();
    const settings = await page.evaluate(() => {
      const raw = localStorage.getItem('chess-trainer:settings');
      return raw
        ? (JSON.parse(raw) as { state: { soundTheme: string; soundVolume: number } }).state
        : null;
    });
    expect(settings).toMatchObject({ soundTheme: 'retro', soundVolume: 0.7 });

    // The lab shows the same controls, the retro haptic patterns and the loss cue.
    await page.getByRole('tab', { name: 'App', exact: true }).click();
    await page.getByTestId('open-lab').click();
    await expect(page.getByTestId('volume-slider')).toHaveValue('70');
    await expect(page.getByTestId('haptic-capture')).toContainText('8·12·8·12·8·12·30ms');
    await expect(page.getByTestId('sound-gameLost')).toHaveText('Game lost');
    await page.getByTestId('sound-gameLost').click();
    await page.getByTestId('sound-capture').click();

    // Turning sounds off hides the volume in Settings; the theme stays only while it
    // still picks the vibration patterns, and goes with vibration too.
    await page.goto('/settings');
    await page.getByText('Sound effects', { exact: true }).click();
    await expect(page.getByRole('switch', { name: /^Sound effects/ })).not.toBeChecked();
    await expect(page.getByRole('slider', { name: 'Volume' })).toHaveCount(0);
    const canVibrate = await page.evaluate(() => typeof navigator.vibrate === 'function');
    await expect(page.getByRole('radiogroup', { name: 'Sound theme' })).toHaveCount(
      canVibrate ? 1 : 0,
    );
    await page.getByText('Vibration', { exact: true }).click();
    await expect(page.getByRole('switch', { name: /^Vibration/ })).not.toBeChecked();
    await expect(page.getByRole('radiogroup', { name: 'Sound theme' })).toHaveCount(0);
  });
});

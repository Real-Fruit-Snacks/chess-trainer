import { expect, type Page, test } from '@playwright/test';
import { completeOnboarding, expectBoard } from './helpers';

const PROGRESS_KEY = 'chess-trainer:progress';

async function seedProgress(page: Page, state: Record<string, unknown>, version = 5) {
  await page.addInitScript(
    ([storageKey, value]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value);
    },
    [PROGRESS_KEY, JSON.stringify({ state, version })] as const,
  );
}

async function readProgress(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw
      ? (
          JSON.parse(raw) as {
            state: {
              puzzleRating: number;
              puzzleRd: number;
              calibration: { done: number; total: number } | null;
              ratedAttempts: number;
              attempts: { score?: number; hintLevel?: number }[];
            };
          }
        ).state
      : null;
  }, PROGRESS_KEY);
}

test.describe('Glicko-2 puzzle rating', () => {
  test('a calibration run finds the level from a very uncertain start', async ({ page }) => {
    await page.goto('/puzzles');
    await expect(page.getByTestId('onboarding-calibrate')).toBeVisible();
    await page.getByRole('button', { name: 'Start the calibration' }).click();
    await expectBoard(page);
    await expect(page.getByTestId('calibration')).toContainText('puzzle 1 of 12');
    await expect(page.getByTestId('rating-label')).toContainText('± 350');
    await expect(page.getByTestId('rating-label')).toContainText('provisional');

    // Giving up on the first puzzle counts as a fail and moves the rating a long way.
    await page.getByRole('button', { name: /Solution/ }).click();
    await expect(page.getByTestId('rating-delta')).toBeVisible();
    const after = await readProgress(page);
    expect(after?.calibration).toMatchObject({ done: 1, total: 12 });
    expect(after?.puzzleRating).toBeLessThan(1100 - 80);
    expect(after?.puzzleRd).toBeLessThan(350);
    expect(after?.attempts[0]?.score).toBe(0);
    await page.getByRole('button', { name: /Next/ }).click();
    await expect(page.getByTestId('calibration')).toContainText('puzzle 2 of 12');
  });

  test('self-assessment starts moderately certain and hints reduce the credit', async ({
    page,
  }) => {
    await page.goto('/puzzles');
    await completeOnboarding(page);
    await expectBoard(page);
    await expect(page.getByTestId('rating-label')).toContainText('± 250');
    await expect(page.getByTestId('calibration')).toHaveCount(0);
    await expect(page.getByText('Your move.')).toBeVisible();
    await page.keyboard.press('h');
    await page.keyboard.press('h');
    await page.getByRole('button', { name: /Solution/ }).click();
    const state = await readProgress(page);
    expect(state?.attempts[0]?.hintLevel).toBe(2);
    expect(state?.attempts[0]?.score).toBe(0); // the solution was shown: a fail
  });

  test('the Progress page explains the rating and can start a calibration', async ({ page }) => {
    await seedProgress(page, {
      onboarded: true,
      puzzleRating: 1523,
      puzzleRd: 61,
      puzzleVolatility: 0.06,
      ratedAttempts: 80,
    });
    await page.goto('/progress');
    await expect(page.getByTestId('progress-rating-label')).toContainText('± 61');
    await expect(page.getByTestId('provisional-note')).toHaveCount(0);
    const scales = page.getByTestId('rating-scales');
    await expect(scales).toContainText('Lichess');
    await expect(scales).toContainText(/1,0[05]0–1,3[05]0/); // ≈ 1,200 ± 150
    await expect(scales).toContainText('below 1000'); // FIDE
    await page.goto('/settings');
    await page.getByLabel('Start again from').selectOption('calibrate');
    await page.goto('/progress');
    await expect(page.getByTestId('provisional-note')).toContainText('calibration: 0 of 12');
    const state = await readProgress(page);
    expect(state?.puzzleRd).toBe(350);
    expect(state?.calibration?.total).toBe(12);
  });

  test('old saves get a deviation from their history', async ({ page }) => {
    await seedProgress(
      page,
      {
        onboarded: true,
        puzzleRating: 1420,
        ratedAttempts: 45,
        ratingHistory: [
          { at: 1_700_000_000_000, rating: 1200 },
          { at: 1_700_500_000_000, rating: 1420 },
        ],
      },
      4,
    );
    await page.goto('/progress');
    await expect(page.getByTestId('progress-rating-label')).toContainText('± 80');
    await expect(page.locator('.stat__value', { hasText: '1,420' })).toBeVisible();
  });
});

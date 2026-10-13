import { expect, test } from '@playwright/test';
import { expectBoard, playMove } from './helpers';

/**
 * 0.27.2: learning a repertoire at the learner's pace. A note on the learner's
 * move stays up until they go on; the reply waits for them (the hook's tests
 * cover the line's end, which waits for Next line).
 */
test.describe('repertoire notes', () => {
  test('the note on a move stays up, and the reply waits for Continue', async ({ page }) => {
    await page.goto('/openings/italian');
    await page.getByRole('button', { name: /Start learning/ }).click();
    const board = await expectBoard(page);
    const status = page.locator('.puzzle-status');

    // 1. e4 and 2. Nf3 carry no note: the replies come on their own.
    const line = page.locator('.openings__line');
    const played = line.locator('.openings__line-played');
    await expect(status).toContainText('New move');
    await playMove(board, 'e2', 'e4');
    await expect(played).toHaveCount(2, { timeout: 10_000 });
    await expect(status).toContainText('New move');
    await playMove(board, 'g1', 'f3');
    await expect(played).toHaveCount(4, { timeout: 10_000 });
    await expect(status).toContainText('New move');

    // 3. Bc4 has one: it stays up, and the reply waits.
    await playMove(board, 'f1', 'c4');
    const note = page.getByText('The Italian: develop, castle, then play c3 and d3.');
    await expect(note).toBeVisible();
    await expect(status).toContainText('is in your repertoire');
    const playOn = page.getByTestId('repertoire-play-on');
    await expect(playOn).toBeFocused();
    await page.waitForTimeout(2000);
    await expect(note).toBeVisible();
    await expect(status).toContainText('is in your repertoire');

    await playOn.click();
    await expect(played).toHaveCount(6);
    await expect(status).not.toContainText('is in your repertoire');
    await expect(line).toContainText('Bc4');
  });
});

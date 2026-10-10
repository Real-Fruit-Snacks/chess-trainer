import { expect, test } from '@playwright/test';
import { expectBoard, playMove, waitForBoardIdle } from './helpers';

/**
 * 0.25: lessons as a conversation with a coach — the reason after every move,
 * the answer to a tempting wrong move with the reply that punishes it on the
 * board until it is taken back, and lines that go on after the opponent's reply.
 */
test.describe('the coach', () => {
  test('answers a tempting wrong move with the reply that punishes it, until it is taken back', async ({
    page,
  }) => {
    // "Is it really free?": the knight takes a pawn the d6 pawn protects.
    await page.goto('/learn/piece-values?step=4');
    const board = await expectBoard(page);
    const coach = page.getByTestId('coach-log');
    await playMove(board, 'f3', 'e5');
    await expect(coach).toContainText('That is the trap');
    await expect(coach).toContainText('dxe5');
    await expect(page.getByRole('button', { name: 'Show answer' })).toHaveCount(0);
    await page.getByTestId('lesson-take-back').click();

    // Back to the question: a developing move is the answer, and the coach says why.
    await expect(page.getByRole('button', { name: 'Show answer' })).toBeEnabled();
    await waitForBoardIdle(page);
    await playMove(board, 'f1', 'c4');
    await expect(page.getByTestId('coach-good')).toContainText('joins the game');
    await expect(page.getByTestId('coach-why')).toContainText(
      'A protected pawn is not a free pawn',
    );
  });

  test('plays a line: the reply, the coach’s word on it, and the next question', async ({
    page,
  }) => {
    // The ladder mate: three rook moves, Black's king stepping back after each check.
    await page.goto('/learn/basic-checkmates?step=2');
    const board = await expectBoard(page);
    const question = page.getByTestId('lesson-task');
    await expect(question).toContainText('Where does the other rook check?');

    await playMove(board, 'h1', 'h6');
    await expect(page.getByTestId('coach-note')).toContainText('The king steps back');
    await expect(question).toContainText('Climb one more rank');
    await waitForBoardIdle(page);
    await playMove(board, 'a5', 'a7');
    await expect(page.getByTestId('coach-note').last()).toContainText('Back on the edge');
    await expect(question).toContainText('checkmate in one');
    await waitForBoardIdle(page);
    await playMove(board, 'h6', 'h8');
    await expect(page.getByTestId('coach-good').last()).toContainText('check on the eighth rank');
    await expect(page.getByRole('button', { name: /Continue/ })).toBeVisible();
  });

  test('keeps the board and the newest words in view', async ({ page, isMobile }) => {
    await page.goto('/learn/how-pieces-move');
    const board = await expectBoard(page);
    await playMove(board, 'd4', 'd8');
    const latest = page.getByTestId('coach-latest');
    if (isMobile) {
      // Phones: the coach's answer right under the board, with its own take-back.
      await expect(latest).toBeVisible();
      await expect(latest).toContainText('Black simply takes it with Kxd8');
      // A copy for the eye (hidden from assistive technology, which reads the conversation).
      await latest.locator('button', { hasText: 'Take back' }).click();
      await expect(page.getByRole('button', { name: 'Show answer' })).toBeEnabled();
      return;
    }
    // Wide screens: the panel beside the board holds the conversation; the copy is hidden.
    await expect(latest).toBeHidden();
    await expect(page.getByTestId('coach-log')).toContainText('Black simply takes it with Kxd8');
    await expect(page.locator('.trainer__board')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('lesson-take-back')).toBeInViewport();
  });
});

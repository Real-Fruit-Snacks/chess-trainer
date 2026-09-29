import { expect, type Locator, type Page } from '@playwright/test';

const FILES = 'abcdefgh';

/**
 * Clicks a square on a chessground board, taking the board orientation into
 * account. Chessground supports click-to-move, so two calls make a move.
 */
export async function clickSquare(
  board: Locator,
  square: string,
  orientation: 'white' | 'black' = 'white',
) {
  const box = await board.boundingBox();
  if (!box) throw new Error('Board is not visible');
  const file = FILES.indexOf(square[0] ?? '');
  const rank = Number(square[1]) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  const size = box.width / 8;
  await board.page().mouse.click(box.x + col * size + size / 2, box.y + row * size + size / 2);
}

export async function playMove(
  board: Locator,
  from: string,
  to: string,
  orientation: 'white' | 'black' = 'white',
) {
  await clickSquare(board, from, orientation);
  await clickSquare(board, to, orientation);
}

/** Dismisses the puzzle onboarding (if shown) by picking the default level. */
export async function completeOnboarding(page: Page) {
  const start = page.getByRole('button', { name: /Start solving/ });
  // The page is code-split, so wait until either the onboarding or a board is on screen.
  await page.locator('cg-board, button:has-text("Start solving")').first().waitFor();
  if (await start.isVisible()) {
    await start.click();
  }
}

export async function expectBoard(page: Page): Promise<Locator> {
  const board = page.locator('cg-board').first();
  await expect(board).toBeVisible();
  return board;
}

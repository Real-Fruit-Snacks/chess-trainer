import { expect, type Locator, type Page } from '@playwright/test';

const FILES = 'abcdefgh';

/**
 * Scrolls so that the board sits between the sticky header and the bottom
 * navigation (which overlay the page), and returns its bounding box.
 */
export async function revealBoard(board: Locator) {
  await board.scrollIntoViewIfNeeded();
  const adjusted = await board.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const nav = document.querySelector('.shell__bottomnav');
    const navTop =
      nav && getComputedStyle(nav).display !== 'none'
        ? nav.getBoundingClientRect().top
        : window.innerHeight;
    const free = navTop - header;
    // Centre the board in the free area when it fits, otherwise align its top under the header.
    const target = rect.height <= free ? header + (free - rect.height) / 2 : header + 8;
    const delta = rect.top - target;
    // Instant, not smooth: the click coordinates are measured right after this.
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
    return delta;
  });
  // Let the scroll event reach chessground, which recomputes its cached bounds on it.
  if (Math.abs(adjusted) > 1) await board.page().waitForTimeout(150);
  const box = await board.boundingBox();
  if (!box) throw new Error('Board is not visible');
  return box;
}

/** Closes every toast currently on screen. */
export async function dismissToasts(page: Page) {
  const buttons = page.locator('.toast button[aria-label="Dismiss"]');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    await buttons
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
}

/**
 * Clicks a square on a chessground board, taking the board orientation into
 * account. Chessground supports click-to-move, so two calls make a move.
 */
export async function clickSquare(
  board: Locator,
  square: string,
  orientation: 'white' | 'black' = 'white',
) {
  // A toast (for example "Ready to work offline") can float over the bottom of
  // the board and swallow the click, so dismiss any first.
  await dismissToasts(board.page());
  // Clicks land at viewport coordinates, so the board must be fully on screen
  // and clear of the sticky header and the mobile bottom navigation.
  const box = await revealBoard(board);
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

/**
 * Dismisses the puzzle onboarding (if shown) with a self-assessed level, so
 * tests get the ordinary rated mode rather than a calibration run.
 */
export async function completeOnboarding(page: Page) {
  // The page is code-split, so wait until either the onboarding or a board is on screen.
  await page.locator('cg-board, button:has-text("Start")').first().waitFor();
  const option = page.getByText('I know the rules and play occasionally');
  if (await option.isVisible()) {
    await option.click();
    await page.getByRole('button', { name: /Start solving/ }).click();
  }
}

export async function expectBoard(page: Page): Promise<Locator> {
  const board = page.locator('cg-board').first();
  await expect(board).toBeVisible();
  return board;
}

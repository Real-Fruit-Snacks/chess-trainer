import { expect, type Page, test } from '@playwright/test';
import { completeOnboarding, expectBoard, playMove } from './helpers';

/**
 * 0.12: the board and the chess core — typed squares stay on the board, a
 * cancelled promotion leaves a live board, PGNs from the wild load cleanly,
 * the click board paints the right colours and the vision drills accept
 * every target.
 */

const CHESSCOM_PGN = [
  '[Event "Live Chess"]',
  '[Site "Chess.com"]',
  '[White "alice"]',
  '[Black "bob"]',
  '[Result "1-0"]',
  '[TimeControl "600"]',
  '',
  '1. e4 {[%clk 0:09:58.7]} 1... e5 {[%clk 0:09:57.1]} 2. Nf3 {[%clk 0:09:55]} 2... Nc6',
  '{[%clk 0:09:50.3]} 3. Bb5 {[%clk 0:09:52.4] The Spanish.} 1-0',
].join('\n');

async function seedProgress(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('chess-trainer:progress')) return;
    localStorage.setItem(
      'chess-trainer:progress',
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
    );
  });
}

/** Loads text through the Analyze import panel. */
async function importText(page: Page, text: string) {
  await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
  await page.locator('textarea').fill(text);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

/** The translate() offset of a piece, in squares from the top-left corner of the board. */
async function squareOf(page: Page, selector: string): Promise<{ col: number; row: number }> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const board = el.closest('cg-board') as HTMLElement;
      const size = board.getBoundingClientRect().width / 8;
      const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.getAttribute('style') ?? '');
      return {
        col: Math.round(Number(match?.[1] ?? 0) / size),
        row: Math.round(Number(match?.[2] ?? 0) / size),
      };
    });
}

test.describe('board keyboard', () => {
  test('typing a square on the puzzle board does not fire the hint shortcut', async ({ page }) => {
    await seedProgress(page);
    await page.goto('/puzzles');
    await completeOnboarding(page);
    await expect(page.locator('.puzzle-status')).toContainText(/Your move/i, { timeout: 30_000 });
    const hint = page.getByRole('button', { name: /^Hint/ });
    await expect(hint).toBeEnabled();

    // The puzzle board is named after the puzzle ("Puzzle mX03M, black to move").
    const board = page.getByRole('application').first();
    await board.focus();
    await page.keyboard.press('h');
    await page.keyboard.press('7');
    // The square was taken by the board: it is spoken, and the hint was not used.
    await expect(page.locator('.board__cursor-announce')).toContainText(/^h7, /);
    await expect(hint).toHaveText(/^Hint/);
    await expect(page.locator('.puzzle-status')).toContainText(/Your move/i);
  });
});

test.describe('promotion', () => {
  test('cancelling a promotion in Analyze leaves the pawn on its square and the board movable', async ({
    page,
  }) => {
    await page.goto('/analyze?fen=8/P6k/8/8/8/8/8/K7%20w%20-%20-%200%201');
    const board = await expectBoard(page);
    await playMove(board, 'a7', 'a8');
    const dialog = page.getByRole('dialog', { name: 'Choose a piece to promote to' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('button', { name: 'Queen' })).toBeFocused();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // The pawn is back on a7 (column 0, second row from the top) and nothing was recorded.
    await expect
      .poll(() => squareOf(page, 'cg-board piece.white.pawn'))
      .toEqual({ col: 0, row: 1 });
    await expect(page.locator('.treemoves')).toContainText('No moves yet');

    // The board still accepts the move: the picker opens again and a choice is played.
    await playMove(board, 'a7', 'a8');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('r');
    await expect(dialog).toBeHidden();
    await expect(page.locator('.treemoves')).toContainText('a8=R');
  });
});

test.describe('PGN import', () => {
  test('a PGN with glued move numbers loads', async ({ page }) => {
    await page.goto('/analyze');
    await expectBoard(page);
    await importText(page, '1.e4 e5 2.Nf3');
    const moves = page.locator('.treemoves');
    await expect(moves).toContainText('Nf3');
    await expect(moves).toContainText('e5');
    await expect(page.getByText(/Could not read/)).toHaveCount(0);
  });

  test('a chess.com PGN with clock tags loads with no bracket text in the move list', async ({
    page,
  }) => {
    await page.goto('/analyze');
    await expectBoard(page);
    await importText(page, CHESSCOM_PGN);
    const moves = page.locator('.treemoves');
    await expect(moves).toContainText('Bb5');
    await expect(moves).toContainText('The Spanish.');
    await expect(moves).not.toContainText('[%clk');
    await expect(moves).not.toContainText('%clk');
    await expect(page.getByText(/Could not read/)).toHaveCount(0);
  });

  test('a PGN with an invalid FEN header is refused instead of crashing the page', async ({
    page,
  }) => {
    await page.goto('/analyze');
    await expectBoard(page);
    await importText(page, '[SetUp "1"]\n[FEN "this is not a fen"]\n\n1. e4 *');
    // The import names the problem instead of crashing.
    await expect(page.getByText(/Invalid FEN header/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('click board', () => {
  test('the coordinates drill paints a1 dark and h1 light, in one tab stop', async ({ page }) => {
    await page.goto('/drills/coordinates');
    const a1 = page.getByRole('button', { name: 'a1', exact: true });
    const h1 = page.getByRole('button', { name: 'h1', exact: true });
    const h8 = page.getByRole('button', { name: 'h8', exact: true });
    await expect(a1).toHaveClass(/clickboard__square--dark/);
    await expect(h8).toHaveClass(/clickboard__square--dark/);
    await expect(h1).toHaveClass(/clickboard__square--light/);
    const luminance = (locator: typeof a1) =>
      locator.evaluate((el) => {
        const [r, g, b] = (getComputedStyle(el).backgroundColor.match(/\d+/g) ?? []).map(Number);
        return (r ?? 0) * 0.299 + (g ?? 0) * 0.587 + (b ?? 0) * 0.114;
      });
    expect(await luminance(a1)).toBeLessThan(await luminance(h1));
    // A single tab stop, no grid semantics.
    const group = page.getByRole('group', { name: /Coordinates drill board/ });
    await expect(group).toBeVisible();
    await expect(group.locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(page.getByRole('grid')).toHaveCount(0);
  });
});

test.describe('vision drill', () => {
  // The puzzle files are mocked: keep the service worker from answering with the real ones.
  test.use({ serviceWorkers: 'block' });

  test('the Captures drill accepts a second capture on the same position', async ({ page }) => {
    // One puzzle whose position (after Black's setup move) has exactly two captures: Rxd5 and Rxh5.
    await page.route('**/puzzles/index.json', (route) =>
      route.fulfill({
        json: {
          source: 'test',
          license: 'CC0-1.0',
          generatedAt: '2026-01-01T00:00:00.000Z',
          seed: 1,
          filters: { minPlays: 0, minPopularity: 0, maxRd: 999 },
          chunk: 500,
          total: 1,
          buckets: [
            {
              id: 'b1100',
              label: 'Club',
              min: 1100,
              max: 1399,
              count: 1,
              files: ['b1100-00.json'],
            },
          ],
        },
      }),
    );
    await page.route('**/puzzles/b1100-00.json', (route) =>
      route.fulfill({
        json: [
          {
            id: 'two-captures',
            fen: 'k7/8/8/3n3p/8/8/8/3RK2R b - - 0 1',
            moves: 'a8b8 d1d5 b8c8 h1h5',
            rating: 1200,
            rd: 50,
            popularity: 90,
            plays: 1000,
            themes: 'short',
            url: 'https://lichess.org/training/two-captures',
          },
        ],
      }),
    );
    await page.goto('/drills/vision?mode=captures');
    await page.getByRole('button', { name: /Start · / }).click();
    const status = page.getByTestId('vision-status');
    await expect(status).toContainText('2 to go', { timeout: 15_000 });
    const board = page.locator('cg-board').first();
    await playMove(board, 'd1', 'd5');
    await expect(status).toContainText('1 to go');
    // Before 0.12 the board was dead here: the second capture is accepted.
    await playMove(board, 'h1', 'h5');
    await expect(page.locator('.drill__hud')).toContainText('2Found');
  });
});

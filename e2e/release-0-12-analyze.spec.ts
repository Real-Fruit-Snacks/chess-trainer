import { expect, type Page, test } from '@playwright/test';
import { expectBoard } from './helpers';

/**
 * 0.12: Analyze and My games — destructive actions ask first, the tablebase
 * speaks in moves, phones get a navigation strip under the board, a broken
 * PGN names its illegal move, and a game handed over opens from the player's side.
 */

const SCHOLAR = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';

async function seed(page: Page, settings: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([settingsJson]) => {
      if (localStorage.getItem('chess-trainer:progress')) return;
      localStorage.setItem(
        'chess-trainer:progress',
        JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
      );
      if (settingsJson) localStorage.setItem('chess-trainer:settings', settingsJson);
    },
    [Object.keys(settings).length ? JSON.stringify({ state: settings, version: 4 }) : ''] as const,
  );
}

/** Loads text through the Analyze import panel. */
async function importText(page: Page, text: string) {
  await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
  await page.getByLabel('Paste a FEN or a PGN').fill(text);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

test.describe('analyze: confirmations', () => {
  test('Reset board asks first once there are moves, and the library confirms a delete', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/analyze');
    await expectBoard(page);
    // An empty board resets without a question.
    await page.getByTestId('reset-board').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await importText(page, SCHOLAR);
    await expect(page.locator('.treemoves')).toContainText('Qxf7#');
    await page.getByTestId('reset-board').click();
    const dialog = page.getByRole('dialog', { name: 'Reset the board?' });
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('confirm-cancel').click();
    await expect(page.locator('.treemoves')).toContainText('Qxf7#');
    await page.getByTestId('reset-board').click();
    await page
      .getByRole('dialog', { name: 'Reset the board?' })
      .getByTestId('confirm-accept')
      .click();
    await expect(page.locator('.treemoves')).not.toContainText('Qxf7#');

    // Save something, then try to delete it from the library.
    await importText(page, SCHOLAR);
    await page.getByTestId('save-analysis').click();
    await page.getByTestId('save-analysis-name').fill('Scholar');
    await page.getByTestId('save-analysis-confirm').click();
    await expect(page.getByText('Saved “Scholar” to My analyses.')).toBeVisible();
    // The board was saved from this entry: the button now offers to update it.
    await expect(page.getByTestId('save-analysis')).toHaveText('Update “Scholar”');
    await page.getByTestId('open-library').click();
    const library = page.getByTestId('library');
    await expect(library.getByTestId('library-item')).toHaveCount(1);
    await library.getByRole('button', { name: 'Delete Scholar' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete “Scholar”?' });
    await expect(confirm).toBeVisible();
    await confirm.getByTestId('confirm-cancel').click();
    await expect(library.getByTestId('library-item')).toHaveCount(1);
    await library.getByRole('button', { name: 'Delete Scholar' }).click();
    await page
      .getByRole('dialog', { name: 'Delete “Scholar”?' })
      .getByTestId('confirm-accept')
      .click();
    await expect(library.getByTestId('library-item')).toHaveCount(0);
  });
});

test.describe('analyze: tablebase', () => {
  test('a DTM in half-moves is shown as a mate in moves', async ({ page }) => {
    await seed(page, { tablebase: true });
    await page.route('https://tablebase.lichess.ovh/standard*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          category: 'win',
          dtz: 10,
          dtm: 10,
          checkmate: false,
          stalemate: false,
          insufficient_material: false,
          moves: [
            { uci: 'd1d7', san: 'Qd7', category: 'loss', dtz: -9, dtm: -9, zeroing: false },
            { uci: 'd1a1', san: 'Qa1', category: 'draw', dtz: 0, dtm: null, zeroing: false },
          ],
        }),
      }),
    );
    await page.goto('/analyze?fen=' + encodeURIComponent('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'));
    await expectBoard(page);
    const card = page.locator('.card', { hasText: 'Tablebase' }).first();
    await expect(card).toContainText('Winning for white · mate in 5');
    await expect(card).not.toContainText('mate in 10');
    // Figurines keep the letter for screen readers: the button is read as "Q d7".
    await expect(card.getByRole('button', { name: /^Q\s?d7$/ })).toHaveAttribute(
      'title',
      /mate in 5 \(DTM 9 half-moves\)/,
    );
  });
});

test.describe('analyze: phones', () => {
  test.use({ viewport: { width: 390, height: 820 } });

  test('the strip under the board steps through the game', async ({ page }) => {
    await seed(page);
    await page.goto('/analyze');
    await expectBoard(page);
    await importText(page, SCHOLAR);
    const strip = page.locator('.analyze__strip');
    await expect(strip).toBeVisible();
    // The panel's own navigation is hidden on phones so the controls are not doubled.
    await expect(page.locator('.analyze__panelnav')).toBeHidden();
    await expect(strip.locator('.analyze__strip-move')).toContainText('4. Qxf7#');
    await strip.getByRole('button', { name: 'Start of game' }).click();
    await expect(strip.locator('.analyze__strip-move')).toHaveText('Start position');
    await strip.getByRole('button', { name: 'Next move' }).click();
    await expect(strip.locator('.analyze__strip-move')).toContainText('1. e4');
    await strip.getByRole('button', { name: 'Next move' }).click();
    await expect(strip.locator('.analyze__strip-move')).toContainText('1… e5');
    await strip.getByRole('button', { name: 'End of game' }).click();
    await expect(strip.locator('.analyze__strip-move')).toContainText('4. Qxf7#');
    await strip.getByRole('button', { name: 'Previous move' }).click();
    await expect(strip.locator('.analyze__strip-move')).toContainText('3… Nf6');
  });
});

test.describe('analyze: import feedback', () => {
  test('a PGN with an illegal move names it and offers the legal prefix', async ({ page }) => {
    await seed(page);
    await page.goto('/analyze');
    await expectBoard(page);
    await importText(page, '1. e4 e5 2. Qh5 Nc6 3. Nf7 *');
    const alert = page.locator('.alert--danger').filter({ hasText: 'Illegal move' });
    await expect(alert).toContainText('Illegal move Nf7 after Nc6');
    await page.getByTestId('import-load-prefix').click();
    await expect(page.locator('.treemoves')).toContainText('Nc6');
    await expect(page.locator('.treemoves')).not.toContainText('Nf7');
  });

  test('a 4-field FEN loads', async ({ page }) => {
    await seed(page);
    await page.goto('/analyze');
    await expectBoard(page);
    await importText(page, '6k1/5ppp/8/8/8/8/8/R3K3 w - -');
    await expect(page.locator('cg-board piece.rook.white')).toHaveCount(1);
    await expect(page.locator('.alert--danger')).toHaveCount(0);
  });
});

test.describe('analyze: hand-off', () => {
  test('a game handed over from Play opens from the player’s colour', async ({ page }) => {
    await seed(page);
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'chess-trainer:handoff-pgn',
        JSON.stringify({
          pgn: '[White "Stockfish"]\n[Black "You"]\n\n1. e4 e5 2. Nf3 Nc6 *',
          orientation: 'black',
        }),
      );
    });
    await page.goto('/analyze?from=game');
    await expectBoard(page);
    await expect(page.locator('.treemoves')).toContainText('Nc6');
    await expect(page.locator('.cg-wrap.orientation-black').first()).toBeVisible();
    // The hand-off is consumed once the game is on the board, and the URL is clean.
    await expect(page).toHaveURL(/\/analyze$/);
    const left = await page.evaluate(() => sessionStorage.getItem('chess-trainer:handoff-pgn'));
    expect(left).toBeNull();
  });
});

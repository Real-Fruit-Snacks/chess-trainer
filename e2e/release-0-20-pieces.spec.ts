import { expect, type Page, test } from '@playwright/test';
import { expectBoard } from './helpers';

/**
 * 0.20: the piece sets come from other projects — Classic plus eight sets from the Lichess
 * collection. Each set's stylesheet loads the first time the set is shown, the chosen set is
 * credited in the footer and under the picker, and Chessnut's Apache licence ships with the site.
 */
async function seed(page: Page, settings: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([settingsJson]) => {
      localStorage.setItem(
        'chess-trainer:progress',
        JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
      );
      // Seeded once; later pages keep what the test changed.
      if (!localStorage.getItem('chess-trainer:settings')) {
        localStorage.setItem('chess-trainer:settings', settingsJson);
      }
    },
    [JSON.stringify({ state: { playCoach: false, ...settings }, version: 3 })] as const,
  );
}

function basePath(baseURL: string | undefined): string {
  return new URL(baseURL ?? 'http://127.0.0.1/').pathname;
}

/** The white king's picture on the board. Classic's are base64 data URIs, the other sets' plain SVG. */
function boardKing(page: Page) {
  return page
    .locator('cg-board piece.white.king')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundImage);
}

/** The piece sets whose stylesheets the page has loaded (the build names each after its set). */
function loadedSets(page: Page) {
  return page.evaluate(() =>
    [...document.styleSheets]
      .map((sheet) => /\/([a-z]+)-[\w-]+\.css$/.exec(sheet.href ?? '')?.[1] ?? '')
      .filter((name) =>
        [
          'merida',
          'chessnut',
          'mpchess',
          'celtic',
          'california',
          'maestro',
          'staunty',
          'cardinal',
        ].includes(name),
      )
      .sort(),
  );
}

test.describe('piece sets from other projects', () => {
  test('a chosen set loads only its own stylesheet, shows on the board and is credited', async ({
    page,
    baseURL,
  }) => {
    const base = basePath(baseURL);
    await seed(page, { pieceSet: 'chessnut' });
    await page.goto('/analyze');
    await expectBoard(page);
    await expect(page.locator('html')).toHaveAttribute('data-pieces', 'chessnut');
    await expect.poll(() => boardKing(page)).toContain('data:image/svg+xml,');
    // The other sets stay on the server until a picker shows them.
    expect(await loadedSets(page)).toEqual(['chessnut']);

    const credits = page.getByTestId('credits');
    await expect(credits).toContainText('Pieces (Chessnut): Alexis Luengas, Apache-2.0');
    await expect(credits.getByRole('link', { name: 'Apache-2.0' })).toHaveAttribute(
      'href',
      `${base}licence-apache.txt`,
    );
    const apache = await page.request.get(`${base}licence-apache.txt`);
    expect(apache.status()).toBe(200);
    expect(await apache.text()).toContain('Apache License');
  });

  test('the picker loads every set and credits the chosen one with its licence', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/settings');
    const picker = page.getByRole('group', { name: 'Piece set' });
    await expect(picker.getByRole('button')).toHaveCount(9);
    await expect
      .poll(() => loadedSets(page))
      .toEqual([
        'california',
        'cardinal',
        'celtic',
        'chessnut',
        'maestro',
        'merida',
        'mpchess',
        'staunty',
      ]);
    await page.getByTestId('pieces-maestro').click();
    await expect(page.locator('html')).toHaveAttribute('data-pieces', 'maestro');
    await expect(page.getByText(/Elegant shaded tournament pieces\. By sadsnake1/)).toBeVisible();
    await expect(
      page.locator('main').getByRole('link', { name: 'CC BY-NC-SA 4.0' }),
    ).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
    await expect(page.getByTestId('credits')).toContainText('Pieces (Maestro): sadsnake1');

    // Kept across a reload, and drawn on the board.
    await page.goto('/analyze');
    await expectBoard(page);
    await expect(page.locator('html')).toHaveAttribute('data-pieces', 'maestro');
    await expect.poll(() => boardKing(page)).toContain('data:image/svg+xml,');
  });

  test('a set that is gone (one of 0.19’s own) shows the Classic pieces', async ({ page }) => {
    await seed(page, { pieceSet: 'staunton' });
    await page.goto('/analyze');
    await expectBoard(page);
    await expect(page.locator('html')).toHaveAttribute('data-pieces', 'classic');
    await expect.poll(() => boardKing(page)).toContain('data:image/svg+xml;base64,');
    await expect(page.getByTestId('credits')).toContainText('Pieces (Classic): Colin M.L. Burnett');
    await page.goto('/settings');
    await expect(page.getByTestId('pieces-classic')).toHaveAttribute('aria-pressed', 'true');
  });
});

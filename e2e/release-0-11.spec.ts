import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { clickSquare, dismissToasts, playMove, revealBoard } from './helpers';

/**
 * 0.11: the Simul — several engines at once, each on its own board, and with
 * clocks, a clock per board for each side.
 */
async function seed(page: Page, scheme?: 'light' | 'dark') {
  await page.addInitScript(
    ([schemeJson]) => {
      // Seeded once; later pages keep what the test played.
      if (localStorage.getItem('chess-trainer:progress')) return;
      localStorage.setItem(
        'chess-trainer:progress',
        JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
      );
      if (schemeJson) localStorage.setItem('chess-trainer:settings', schemeJson);
    },
    [scheme ? JSON.stringify({ state: { colorScheme: scheme }, version: 3 }) : ''] as const,
  );
}

/** WCAG 2.1 A/AA violations on the page as it stands (boards and toasts aside, as in the sweep). */
async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('cg-board')
    .exclude('.toasts')
    .analyze();
  return results.violations.map((v) => ({
    id: v.id,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

/** Sets up and starts a simul from the setup screen. */
async function startSimul(
  page: Page,
  options: { boards: number; level: number; clock: string; color?: string; rising?: boolean },
) {
  await page.goto('/arcade/simul');
  await expect(page.getByTestId('simul-setup')).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Boards' })
    .getByRole('radio', { name: String(options.boards), exact: true })
    .click();
  await page.getByLabel('Engine level', { exact: true }).selectOption(String(options.level));
  await page.getByTestId('simul-clock').selectOption(options.clock);
  if (options.color) {
    await page
      .getByRole('radiogroup', { name: 'Your colour' })
      .getByRole('radio', { name: options.color })
      .click();
  }
  if (options.rising) await page.getByText('Rising strength', { exact: true }).click();
  await page.getByTestId('simul-start').click();
  await expect(page.getByTestId('simul-boards')).toBeVisible();
}

/** The big board (the small ones come later in the page). */
function mainBoard(page: Page): Locator {
  return page.locator('.trainer__board cg-board').first();
}

/** A clock's text in seconds ("4:58" → 298, "9.4" → 9.4). */
async function seconds(clock: Locator): Promise<number> {
  const text = (await clock.textContent()) ?? '';
  if (!text.includes(':')) return Number(text);
  const [m, s] = text.split(':');
  return Number(m) * 60 + Number(s);
}

test.describe('simul', () => {
  test('plays several boards: replies, moving on, resigning, the summary and the score', async ({
    page,
  }) => {
    await seed(page);
    await startSimul(page, { boards: 2, level: 1, clock: 'none' });
    const status = page.getByTestId('simul-status');
    await expect(status).toHaveText('Board 1: Your move.');
    await expect(page.locator('.simul-thumb')).toHaveCount(2);

    // A move on board 1 brings up board 2; the engine answers board 1 meanwhile.
    await playMove(mainBoard(page), 'e2', 'e4');
    await expect(status).toHaveText('Board 2: Your move.');
    await expect(page.getByTestId('simul-state-1')).toHaveText('Your move', { timeout: 30_000 });
    await playMove(mainBoard(page), 'd2', 'd4');
    await expect(status).toHaveText('Board 1: Your move.', { timeout: 30_000 });
    await expect(page.getByTestId('simul-moves')).toContainText('1.');
    await expect(page.getByTestId('simul-moves')).toContainText('e4');

    // Switching by hand, and with N.
    await page.getByRole('button', { name: /^Board 2, Newcomer/ }).click();
    await expect(status).toContainText('Board 2:');
    await dismissToasts(page);
    await page.locator('body').press('n');
    await expect(status).toContainText('Board 1:');

    // Resign board 1; board 2 plays on.
    await page.getByTestId('simul-resign').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
    await expect(page.getByTestId('simul-state-1')).toHaveText('Lost');
    await expect(status).toHaveText('Board 1: Resigned.');
    await expect(page.getByTestId('simul-summary')).toHaveCount(0);

    // End the simul: the summary, with every board and a way into the analysis.
    await page.getByTestId('simul-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resign every board' }).click();
    const summary = page.getByTestId('simul-summary');
    await expect(summary).toBeVisible();
    await expect(summary.getByRole('heading')).toHaveText('Simul over: 0 / 2');
    await expect(page.getByTestId('simul-result-1')).toContainText('Resigned');
    await expect(page.getByTestId('simul-best-line')).toHaveText(
      'Win a board to set a score to beat.',
    );
    await page.getByTestId('simul-result-2').getByRole('button', { name: 'Analyze' }).click();
    // The analysis board takes the game and tidies the address at once.
    await expect(page).toHaveURL(/\/analyze/);
    await expect(page.locator('.treemoves, .movelist').first()).toContainText('d4');

    // Both games are saved, and the hub keeps the result.
    await page.goto('/arcade');
    await expect(page.getByTestId('arcade-best-simul')).toHaveText(
      '0/2 · Newcomer · no clock · 1 play',
    );
  });

  test('every board has its own clock, and yours runs wherever it is your move', async ({
    page,
  }) => {
    await seed(page);
    await startSimul(page, { boards: 2, level: 1, clock: '5+3' });
    const clock1 = page.getByTestId('simul-clock-1');
    const clock2 = page.getByTestId('simul-clock-2');
    // Both of the player's clocks start at once.
    await expect(clock1).not.toHaveText('5:00', { timeout: 5_000 });
    await expect(clock2).not.toHaveText('5:00');

    // A move on board 1 earns its increment; board 2's clock never stopped.
    await playMove(mainBoard(page), 'e2', 'e4');
    await expect(page.getByTestId('simul-state-1')).toHaveText('Your move', { timeout: 30_000 });
    await page.waitForTimeout(1_200);
    expect(await seconds(clock2)).toBeLessThan(await seconds(clock1));

    // The engine's clock only runs while it thinks: still close to five minutes.
    await page.getByRole('button', { name: /^Board 1, Newcomer/ }).click();
    const engineClock = page.locator('.play__boardcol .playerbar').first().locator('.clock');
    expect(await seconds(engineClock)).toBeGreaterThan(299);
  });

  test('alternating colours and rising strength set up the room', async ({ page }) => {
    await seed(page);
    await startSimul(page, {
      boards: 3,
      level: 2,
      clock: 'none',
      color: 'Alternate',
      rising: true,
    });
    // Board 2 is played with Black: the engine opens there by itself.
    await expect(page.getByTestId('simul-state-2')).toHaveText('Your move', { timeout: 30_000 });
    await page.getByRole('button', { name: /^Board 2, Casual, you play black/ }).click();
    await expect(page.getByTestId('simul-status')).toHaveText('Board 2: Your move.');
    await expect(page.locator('.badge', { hasText: 'Level 3 · Casual' })).toBeVisible();
    const board = mainBoard(page);
    await revealBoard(board);
    await clickSquare(board, 'e7', 'black');
    await clickSquare(board, 'e5', 'black');
    // On to board 3, the strongest, played with White.
    await expect(page.getByTestId('simul-status')).toHaveText('Board 3: Your move.');
    await expect(page.locator('.badge', { hasText: 'Level 4 · Club' })).toBeVisible();
    await page.getByRole('button', { name: /^Board 2, Casual/ }).click();
    await expect(page.getByTestId('simul-moves')).toContainText('e5');
  });

  test('a flag fall loses the board, and the simul ends when every clock has run out', async ({
    page,
  }) => {
    await page.clock.install();
    await seed(page);
    await startSimul(page, { boards: 2, level: 1, clock: '5+3' });
    await playMove(mainBoard(page), 'e2', 'e4');
    await expect(page.getByTestId('simul-state-1')).toHaveText('Your move', { timeout: 30_000 });
    await page.clock.fastForward('05:10');
    await expect(page.getByTestId('simul-state-1')).toHaveText('Lost');
    await expect(page.getByTestId('simul-state-2')).toHaveText('Lost');
    const summary = page.getByTestId('simul-summary');
    await expect(summary).toBeVisible();
    await expect(page.getByTestId('simul-result-1')).toContainText('Lost on time');
    await expect(page.getByTestId('simul-result-2')).toContainText('Lost on time');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the game and the summary pass the accessibility sweep (${scheme})`, async ({ page }) => {
      await seed(page, scheme);
      await startSimul(page, { boards: 3, level: 1, clock: '5+3', color: 'Alternate' });
      await expect(page.getByTestId('simul-state-2')).toHaveText('Your move', { timeout: 30_000 });
      await page.waitForTimeout(400);
      expect(await violations(page)).toEqual([]);

      await page.getByTestId('simul-end').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Resign every board' }).click();
      await expect(page.getByTestId('simul-summary')).toBeVisible();
      await page.waitForTimeout(400);
      expect(await violations(page)).toEqual([]);
    });
  }
});

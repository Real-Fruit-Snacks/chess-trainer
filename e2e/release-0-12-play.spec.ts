import { expect, type Page, test } from '@playwright/test';
import { expectBoard, playMove } from './helpers';

/**
 * 0.12: Play, the coach, opening practice and the engine ladder — the fixes
 * from the 0.11 review (take-back after game over, the engine-level label,
 * "Play again" against "New game", blindfold lifting at the end, keyboard
 * entry focus, repeated deviations, refused hand-off positions, the ladder's
 * spoken rungs, analysis from the learner's side).
 */
const PROGRESS_KEY = 'chess-trainer:progress';

async function seedProgress(page: Page, state: Record<string, unknown>, version = 7) {
  await page.addInitScript(
    ([storageKey, value]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value);
    },
    [PROGRESS_KEY, JSON.stringify({ state, version })] as const,
  );
}

/** White mates in one with Qa8#. */
const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1';
/** Black mates in one with ...Qb1#. */
const BLACK_MATES_IN_ONE = '1q4k1/8/8/8/8/8/5PPP/6K1 b - - 0 1';

/** The games the progress store has recorded. */
async function recordedGames(page: Page) {
  return page.evaluate(
    (key) =>
      (
        JSON.parse(localStorage.getItem(key) ?? '{}') as {
          state?: { games?: { source: string; result: string }[] };
        }
      ).state?.games ?? [],
    PROGRESS_KEY,
  );
}

test.describe('play', () => {
  test('a finished game cannot be taken back; "Play again" repeats it and "New game" opens the setup', async ({
    page,
  }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    await page.goto(`/play?fen=${encodeURIComponent(MATE_IN_ONE)}&color=white`);
    const setup = page.getByRole('dialog', { name: 'New game' });
    const level = setup.getByLabel('Engine level');
    await expect(level).toBeVisible();
    // The ratings beside the levels are a guide, and the setup says so.
    await expect(setup).toContainText('rough guide');
    await level.selectOption('1');
    // Blindfold: the pieces are hidden while the game is on.
    await setup.getByText('Blindfold', { exact: true }).click();
    await setup.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    await expect(page.locator('.board--blindfold')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Take back' })).toBeDisabled();
    await playMove(board, 'a1', 'a8');
    const over = page.getByRole('dialog', { name: 'You won!' });
    await expect(over).toBeVisible();
    await expect(over).toContainText('by checkmate');
    await expect(over.getByRole('button', { name: 'New game' })).toBeVisible();

    // "Play again": the same game at once, without the setup dialog.
    await over.getByRole('button', { name: 'Play again' }).click();
    await expect(over).toBeHidden();
    await expect(setup).toBeHidden();
    await expect(page.getByLabel('Move list').locator('.movelist__move')).toHaveCount(0);
    await expect(page.locator('.board--blindfold')).toHaveCount(1);
    await playMove(board, 'a1', 'a8');
    await expect(over).toBeVisible();
    await over.getByRole('button', { name: 'Show the board' }).click();

    // Each game is recorded once and stays finished: no take-back into a recorded game, and the
    // blindfold lifts so the final position can be reviewed.
    await expect(page.getByRole('button', { name: 'Take back' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Resign' })).toBeDisabled();
    await expect(page.locator('.board--blindfold')).toHaveCount(0);
    const games = await recordedGames(page);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ source: 'play', result: '1-0' });

    // "New game" opens the setup, still offering the hand-off position.
    await page.getByRole('button', { name: 'New game' }).first().click();
    await expect(setup).toBeVisible();
    await expect(setup).toContainText('Starting from a custom position');
  });

  test('"Analyze game" opens the analysis board from the learner’s side', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    // Black to move: the learner plays Black.
    await page.goto(`/play?fen=${encodeURIComponent(BLACK_MATES_IN_ONE)}`);
    const setup = page.getByRole('dialog', { name: 'New game' });
    await setup.getByLabel('Engine level').selectOption('1');
    await setup.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    await playMove(board, 'b8', 'b1', 'black');
    const over = page.getByRole('dialog', { name: 'You won!' });
    await expect(over).toBeVisible();
    await over.getByRole('button', { name: 'Analyze game' }).click();
    await expect(page).toHaveURL(/\/analyze/);
    await expect(page.locator('.cg-wrap.orientation-black').first()).toBeVisible();
  });

  test('keyboard move entry keeps its focus while the engine replies', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    await page.goto('/play');
    await page.getByLabel('Engine level').selectOption('1');
    await page.getByText('Keyboard move entry', { exact: true }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expectBoard(page);
    const input = page.getByPlaceholder(/Type a move/);
    await input.fill('e4');
    await input.press('Enter');
    await expect(page.getByLabel('Move list')).toContainText('e4');
    // The engine's reply re-enables the field, and the focus comes back with it.
    await expect(page.getByLabel('Move list').locator('.movelist__move')).toHaveCount(2, {
      timeout: 30_000,
    });
    await expect(input).toBeEnabled();
    await expect(input).toBeFocused();
    await input.fill('Nf3');
    await input.press('Enter');
    await expect(page.getByLabel('Move list')).toContainText('Nf3');
  });

  test('refuses a hand-off position the engine cannot play', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    // Black is in check although it is White's move.
    await page.goto(`/play?fen=${encodeURIComponent('4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1')}`);
    await expect(page.getByTestId('toasts')).toContainText('Cannot play from that position');
    await expect(page.getByRole('dialog', { name: 'New game' })).not.toContainText(
      'Starting from a custom position',
    );
    // A game that is already over (bare kings) is refused too.
    await page.goto(`/play?fen=${encodeURIComponent('4k3/8/8/8/8/8/8/4K3 w - - 0 1')}`);
    await expect(page.getByTestId('toasts')).toContainText(/already over/);
  });

  test('the engine ladder describes every rung in words', async ({ page }) => {
    await seedProgress(page, {
      onboarded: true,
      puzzleRating: 1200,
      ladderHeight: 2,
      games: [],
    });
    await page.goto('/play');
    await page.getByRole('button', { name: 'Cancel' }).click();
    const ladder = page.getByTestId('engine-ladder');
    const rungs = ladder.getByRole('listitem');
    await expect(rungs).toHaveCount(8);
    // The remembered height survives an empty game list.
    await expect(rungs.nth(0)).toContainText('Level 1 · Newcomer: climbed, no games yet');
    await expect(rungs.nth(1)).toContainText('Level 2 · Beginner: climbed');
    await expect(rungs.nth(2)).toContainText('Level 3 · Casual: next to climb, no games yet');
    await expect(ladder.getByTestId('ladder-reason')).toContainText('Level 2 is beaten');
    await expect(ladder.getByRole('button', { name: /Play Level 3/ })).toBeVisible();
  });
});

test.describe('opening practice', () => {
  test('leaving the book twice at the same ply alerts twice but lapses the move once', async ({
    page,
  }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    await page.goto('/play?book=caro-kann');
    await expect(page.getByTestId('book-select')).toHaveValue('caro-kann');
    await page.getByLabel('Engine level').selectOption('1');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    await expect(page.locator('.movelist')).toContainText('e4', { timeout: 15_000 });

    const alert = page.getByTestId('book-alert');
    await playMove(board, 'e7', 'e5', 'black');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('1… e5 instead of c6');
    await page.getByRole('button', { name: 'Take it back' }).click();
    await expect(alert).toHaveCount(0);

    // The same slip again: the alert comes back…
    await playMove(board, 'e7', 'e5', 'black');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('1… e5 instead of c6');
    await page.getByRole('button', { name: 'Take it back' }).click();
    await expect(alert).toHaveCount(0);

    // …but the card was lapsed only once.
    const lapses = await page.evaluate(() => {
      const raw = localStorage.getItem('chess-trainer:repertoire');
      const cards = raw
        ? (JSON.parse(raw) as { state: { cards: Record<string, { lapses: number }> } }).state.cards
        : {};
      const key = Object.keys(cards).find((k) => k.startsWith('caro-kann|e2e4 c7c6'));
      return key ? cards[key]?.lapses : null;
    });
    expect(lapses).toBe(1);

    // The hint in book draws the repertoire's move, without asking the engine, and says it.
    // (A vertical arrow has an empty bounding box, so the check is for the shape, not its box.)
    await page.getByRole('button', { name: 'Hint' }).click();
    await expect(
      page.locator('cg-board').first().locator('..').locator('svg.cg-shapes line').first(),
    ).toBeAttached();
    await expect(page.getByTestId('hint-text')).toHaveText('Suggested move: c6');
    await playMove(board, 'c7', 'c6', 'black');
    await expect(page.getByTestId('book-status')).toContainText('follows your repertoire');
  });
});

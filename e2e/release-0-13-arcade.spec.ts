import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { clickSquare } from './helpers';

/**
 * 0.13: two arcade games built on the rules themselves — Arbiter (catch the
 * illegal move in a replayed classic) and Ghost Knight (hunt a knight you
 * only see every third move).
 */
const PROGRESS_KEY = 'chess-trainer:progress';

// No service worker: its "ready to work offline" toast must not land on a board mid-test.
test.use({ serviceWorkers: 'block' });

async function seed(page: Page) {
  await page.addInitScript(
    ([key, progress]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, progress);
    },
    [
      PROGRESS_KEY,
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 7 }),
    ] as const,
  );
}

async function storedArcade(page: Page): Promise<Record<string, { best: number; plays: number }>> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    const state = raw ? (JSON.parse(raw) as { state: { arcade?: object } }).state : {};
    return (state.arcade ?? {}) as Record<string, { best: number; plays: number }>;
  }, PROGRESS_KEY);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('cg-board')
    .exclude('.toasts')
    .analyze();
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
}

/**
 * Opens a game from the hub. The page scrolls smoothly, and a freshly loaded hub may still be
 * settling, so a click can land beside a link that is moving (seen in Firefox): click until the
 * page has changed.
 */
async function openFromHub(page: Page, name: string, path: RegExp) {
  const link = page.getByRole('link', { name, exact: true });
  await expect(async () => {
    if (!path.test(page.url())) await link.click({ timeout: 2_000 });
    await expect(page).toHaveURL(path, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe('arcade hub', () => {
  test('lists Arbiter and Ghost Knight with their Play links', async ({ page }) => {
    await seed(page);
    await page.goto('/arcade');
    await expect(page.getByTestId('arcade-best-arbiter')).toHaveText('Not played yet');
    await expect(page.getByTestId('arcade-best-ghost-knight')).toHaveText('Not played yet');
    await openFromHub(page, 'Play Ghost Knight', /\/arcade\/ghost-knight$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ghost Knight');
    await page.goto('/arcade');
    await openFromHub(page, 'Play Arbiter', /\/arcade\/arbiter$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arbiter');
  });
});

test.describe('arbiter', () => {
  test('a legal move called is a strike, a missed one is explained, three strikes end the run', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.goto('/arcade/arbiter');
    const start = page.getByTestId('arbiter-start');
    await expect(start).toBeEnabled();
    await start.click();
    const status = page.getByTestId('arbiter-status');
    // The first real move, then a call on it from the keyboard: Space.
    await expect(status).toHaveText(/^\d+\.(\.\.)?\S+$/, { timeout: 10_000 });
    await page.keyboard.press('Space');
    await expect(page.getByTestId('arbiter-false-alarm')).toContainText('was legal — a strike.');
    await expect(page.getByTestId('arbiter-strikes')).toContainText('1 of 3 strikes');
    // The axe sweep in the middle of a round.
    expect(await axe(page)).toEqual([]);
    // The illegal move goes by uncalled: a strike, explained.
    const verdict = page.getByTestId('arbiter-verdict');
    await expect(verdict).toContainText('Missed', { timeout: 30_000 });
    await expect(page.getByTestId('arbiter-reason')).not.toBeEmpty();
    await expect(page.getByTestId('arbiter-strikes')).toContainText('2 of 3 strikes');
    expect(await axe(page)).toEqual([]);
    await page.getByTestId('arbiter-next').click();
    await expect(page.getByText('Round 2')).toBeVisible();
    // Pausing covers the board until Resume.
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByTestId('arbiter-paused')).toBeVisible();
    await page.getByTestId('arbiter-resume').click();
    await expect(page.getByTestId('arbiter-paused')).toBeHidden();
    await expect(verdict).toContainText('Missed', { timeout: 30_000 });
    await expect(page.getByTestId('arbiter-next')).toHaveText('See the result');
    await page.getByTestId('arbiter-next').click();
    await expect(page.getByTestId('arbiter-card')).toContainText('Run over');
    const arcade = await storedArcade(page);
    expect(arcade.arbiter?.plays).toBe(1);
    expect(arcade.arbiter?.best).toBe(0);
    await page.goto('/arcade');
    await expect(page.getByTestId('arcade-best-arbiter')).toHaveText(
      '0 illegal moves caught · 1 play',
    );
  });
});

test.describe('ghost knight', () => {
  test('shows the knight, hides it once it moves and shades where it could be', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/arcade/ghost-knight');
    await page.getByTestId('ghost-start').click();
    const status = page.getByTestId('ghost-status');
    await expect(status).toContainText(/The knight is on [a-h][5-8]\./);
    const board = page.locator('cg-board');
    await expect(board.locator('piece.black.knight')).toHaveCount(1);
    await expect(page.getByTestId('ghost-moves')).toHaveText('Move 0 of 20');
    // A rook to the second rank: out of reach of a knight that starts in the far half.
    await clickSquare(board, 'h1');
    await clickSquare(board, 'h2');
    await expect(status).toContainText('Rook h1–h2. The knight moved, unseen.');
    await expect(page.getByTestId('ghost-moves')).toHaveText('Move 1 of 20');
    await expect(board.locator('piece.black')).toHaveCount(0);
    await expect(board.locator('square.ghost-last')).toHaveCount(1);
    expect(await board.locator('square.ghost-maybe').count()).toBeGreaterThan(0);
    await expect(page.getByTestId('ghost-whereabouts')).toContainText('It could be on');
    expect(await axe(page)).toEqual([]);
  });

  test('the unshaded mode leaves the tracking to you', async ({ page }) => {
    await seed(page);
    await page.goto('/arcade/ghost-knight');
    await page.getByRole('radio', { name: 'Unshaded' }).click();
    await page.getByTestId('ghost-start').click();
    const board = page.locator('cg-board');
    await clickSquare(board, 'h1');
    await clickSquare(board, 'h2');
    await expect(page.getByTestId('ghost-status')).toContainText('Rook h1–h2.');
    await expect(board.locator('square.ghost-maybe')).toHaveCount(0);
    await expect(board.locator('square.ghost-last')).toHaveCount(1);
    await expect(page.getByTestId('ghost-whereabouts')).not.toContainText('could be');
  });
});

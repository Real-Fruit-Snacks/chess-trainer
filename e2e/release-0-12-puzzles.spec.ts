import { expect, type Page, type Route, test } from '@playwright/test';
import { completeOnboarding, expectBoard, playMove } from './helpers';

/**
 * 0.12: puzzles, drills, patterns and studies — the vision drills accept every
 * target, puzzles load from whatever chunks arrive, "Show solution" leaves the
 * line on screen, underpromotions are solvable with auto-queen on, the
 * coordinates drill takes typed squares and unknown puzzle modes redirect.
 *
 * Several tests answer the puzzle files themselves; the service worker would
 * otherwise serve them from its own cache, so it is kept out of this file.
 */
test.use({ serviceWorkers: 'block' });

const PROGRESS_KEY = 'chess-trainer:progress';
const SETTINGS_KEY = 'chess-trainer:settings';

/** An onboarded learner at `rating`, with optional settings, seeded once per page. */
async function seed(page: Page, rating = 1250, settings: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([progressKey, progressJson, settingsKey, settingsJson]) => {
      if (localStorage.getItem(progressKey)) return;
      localStorage.setItem(progressKey, progressJson);
      localStorage.setItem(settingsKey, settingsJson);
    },
    [
      PROGRESS_KEY,
      JSON.stringify({
        state: { onboarded: true, puzzleRating: rating, puzzleRd: 60 },
        version: 7,
      }),
      SETTINGS_KEY,
      JSON.stringify({ state: settings, version: 4 }),
    ] as const,
  );
}

interface TestPuzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string;
}

/** Serves a one-band puzzle index whose only chunk holds `puzzles`. */
async function servePuzzles(page: Page, puzzles: TestPuzzle[]) {
  await page.route('**/puzzles/index.json', (route) =>
    route.fulfill({
      json: {
        source: 'test',
        license: 'CC0-1.0',
        generatedAt: '2026-01-01T00:00:00.000Z',
        chunk: 500,
        total: puzzles.length,
        buckets: [
          {
            id: 'b1100',
            label: 'Casual',
            min: 1100,
            max: 1399,
            count: puzzles.length,
            files: ['b1100-00.json'],
            ranges: [{ min: 1100, max: 1399 }],
          },
        ],
        themes: { fork: puzzles.length },
      },
    }),
  );
  await page.route('**/puzzles/b1100-00.json', (route) =>
    route.fulfill({
      json: puzzles.map((p) => ({
        ...p,
        rd: 75,
        popularity: 90,
        plays: 1000,
        url: `https://lichess.org/training/${p.id}`,
      })),
    }),
  );
}

test.describe('vision drills', () => {
  test('Find every capture takes both captures, then moves on to the next position', async ({
    page,
  }) => {
    // After Black's setup move, White has exactly two captures: Rxd5 and Rxh5.
    await servePuzzles(page, [
      {
        id: 'caps2',
        fen: 'k7/8/8/3n3p/8/8/8/3RK2R b - - 0 1',
        moves: 'a8b8 d1d5',
        rating: 1200,
        themes: 'short',
      },
    ]);
    await page.goto('/drills/vision?mode=captures');
    await page.getByRole('button', { name: /Start · / }).click();
    const status = page.getByTestId('vision-status');
    await expect(status).toContainText('2 to go');
    const board = page.locator('cg-board').first();
    await playMove(board, 'd1', 'd5');
    await expect(status).toContainText('1 to go');
    await playMove(board, 'h1', 'h5');
    await expect(page.locator('.drill__hud')).toContainText('2Found');
    await expect(page.getByText('Position 2', { exact: false })).toBeVisible();
    await expect(status).toContainText('2 to go');
  });

  test('Find every check takes a second check with the same rook', async ({ page }) => {
    // After ...Ka7, the rook on b1 checks on b7 and on a1.
    await servePuzzles(page, [
      {
        id: 'checks2',
        fen: 'k7/8/8/8/8/8/8/1R2K3 b - - 0 1',
        moves: 'a8a7 b1b7',
        rating: 1200,
        themes: 'short',
      },
    ]);
    await page.goto('/drills/vision?mode=checks');
    await page.getByRole('button', { name: /Start · / }).click();
    const status = page.getByTestId('vision-status');
    await expect(status).toContainText('2 to go');
    const board = page.locator('cg-board').first();
    await playMove(board, 'b1', 'b7');
    await expect(status).toContainText('1 to go');
    await playMove(board, 'b1', 'a1');
    await expect(page.locator('.drill__hud')).toContainText('2Found');
  });
});

test.describe('puzzles offline', () => {
  test('rated puzzles still load when the first chunk of the band cannot be loaded', async ({
    page,
  }) => {
    await seed(page, 1250);
    const requested: string[] = [];
    page.on('request', (request) => {
      const file = /\/puzzles\/(b\d{4}-\d{2}\.json)$/.exec(request.url())?.[1];
      if (file) requested.push(file);
    });
    // The window around 1250 starts with the first chunk of two bands: both are "not stored".
    const unreachable = (route: Route) => route.abort('internetdisconnected');
    await page.route('**/puzzles/b1100-00.json', unreachable);
    await page.route('**/puzzles/b1400-00.json', unreachable);
    await page.goto('/puzzles');
    await completeOnboarding(page);
    await expectBoard(page);
    await expect(page.locator('.puzzle-status')).toContainText(/Your move/i, { timeout: 30_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    // The puzzle came from the next chunks of the band instead.
    expect(requested).toContain('b1100-00.json');
    expect(requested).toContain('b1100-01.json');
  });

  test('with only the precached first chunks, rated puzzles and Rush both work', async ({
    page,
  }) => {
    await seed(page, 1250);
    // Every chunk but the first of each band is "not stored".
    await page.route(/\/puzzles\/b\d{4}-(0[1-9]|1\d)\.json$/, (route) =>
      route.abort('internetdisconnected'),
    );
    await page.goto('/puzzles');
    await completeOnboarding(page);
    await expect(page.locator('.puzzle-status')).toContainText(/Your move/i, { timeout: 30_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.goto('/puzzles/rush');
    await page.getByRole('button', { name: /3 minutes/ }).click();
    await expect(page.locator('.puzzle-status')).toContainText(/Your move|Watch/i, {
      timeout: 30_000,
    });
    await expect(page.locator('.rush__hud')).toContainText('Time left');
  });
});

test.describe('puzzle trainer', () => {
  test('"Show solution" leaves the line on the board even with auto-advance on', async ({
    page,
  }) => {
    await page.clock.install();
    await seed(page, 1250, { puzzleAutoNext: true });
    await page.goto('/puzzles');
    await completeOnboarding(page);
    const status = page.locator('.puzzle-status');
    await expect(status).toContainText(/Your move/i, { timeout: 30_000 });
    const board = page.getByRole('application', { name: /^Puzzle / });
    const label = await board.getAttribute('aria-label');
    await page.getByRole('button', { name: /^Solution/ }).click();
    await expect(status).toHaveText('That is the solution.', { timeout: 15_000 });
    // Auto-advance waits 1.2 s after a solve; nothing happens after a revealed solution.
    await page.clock.fastForward(5000);
    await expect(status).toHaveText('That is the solution.');
    await expect(board).toHaveAttribute('aria-label', label ?? '');
    await expect(page.getByRole('button', { name: /Next puzzle/ })).toBeVisible();
  });

  test('an underpromotion puzzle is solvable with auto-queen on: the piece is asked for', async ({
    page,
  }) => {
    await seed(page, 1250, { autoQueen: true });
    // Black's king steps to f6; e8=N+ forks it and the queen (a new queen would only draw).
    await servePuzzles(page, [
      {
        id: 'fork1',
        fen: '7K/2q1P3/8/1P3k2/8/8/8/8 b - - 0 1',
        moves: 'f5f6 e7e8n',
        rating: 1250,
        themes: 'fork underPromotion',
      },
    ]);
    await page.goto('/puzzles');
    await completeOnboarding(page);
    const board = await expectBoard(page);
    await expect(page.locator('.puzzle-status')).toContainText(/Your move/i, { timeout: 30_000 });
    await playMove(board, 'e7', 'e8', 'white');
    const picker = page.getByRole('dialog', { name: 'Choose a piece to promote to' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'Knight' }).click();
    await expect(page.locator('.puzzle-status')).toContainText('Puzzle solved!');
  });

  test('an unknown puzzle mode redirects to rated puzzles', async ({ page }) => {
    await seed(page, 1250);
    await page.goto('/puzzles/nonsense');
    await expect(page).toHaveURL(/\/puzzles$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Puzzles' })).toBeVisible();
    await expect(page).toHaveTitle(/^Rated puzzles · /);
  });
});

test.describe('coordinates drill', () => {
  test('is playable from the keyboard: typed squares answer', async ({ page }) => {
    await page.goto('/drills/coordinates');
    const start = page.getByRole('button', { name: /Start · 30 seconds/ });
    await start.focus();
    await page.keyboard.press('Enter');
    const field = page.getByLabel('Or type the square');
    await expect(field).toBeFocused();

    const target = ((await page.getByTestId('coordinates-prompt').textContent()) ?? '').trim();
    expect(target).toMatch(/^[a-h][1-8]$/);
    await page.keyboard.type(target.toUpperCase());
    await expect(page.locator('.stat', { hasText: 'Correct' })).toContainText('1');
    await expect(field).toHaveValue('');

    const next = ((await page.getByTestId('coordinates-prompt').textContent()) ?? '').trim();
    await page.keyboard.type(next === 'a1' ? 'h8' : 'a1');
    await expect(page.locator('.stat', { hasText: 'Mistakes' })).toContainText('1');
  });
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the coordinates prompt and the Rush clock sit above the board', async ({ page }) => {
    await page.goto('/drills/coordinates');
    const prompt = page.locator('.trainer__lead');
    const board = page.getByRole('group', { name: /Coordinates drill board/ });
    await expect(board).toBeVisible();
    const promptBox = await prompt.boundingBox();
    const boardBox = await board.boundingBox();
    expect(promptBox && boardBox && promptBox.y + promptBox.height <= boardBox.y + 1).toBe(true);

    await seed(page, 1250);
    await page.goto('/puzzles/rush');
    const hud = page.locator('.trainer__lead');
    await expect(hud).toContainText('Time left');
    const hudBox = await hud.boundingBox();
    const rushBoard = await page.locator('cg-board').first().boundingBox();
    expect(hudBox && rushBoard && hudBox.y + hudBox.height <= rushBoard.y + 1).toBe(true);
  });

  test('theme links under a puzzle are finger-sized', async ({ page }) => {
    await seed(page, 1250);
    await page.goto('/puzzles');
    await completeOnboarding(page);
    await expect(page.locator('.puzzle-status')).toContainText(/Your move/i, { timeout: 30_000 });
    const link = page.locator('.puzzle-themes__link').first();
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    // 40px on a touch screen; elsewhere still above the 24px minimum target.
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(coarse ? 40 : 28);
  });
});

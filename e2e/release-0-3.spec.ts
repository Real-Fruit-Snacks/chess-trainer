import { expect, type Page, test } from '@playwright/test';
import { completeOnboarding, expectBoard, playMove } from './helpers';

const PROGRESS_KEY = 'chess-trainer:progress';
const SETTINGS_KEY = 'chess-trainer:settings';

/**
 * Writes a persisted store state (version 3) before the app boots. Init scripts
 * run on every navigation, so the seed only applies while the key is absent.
 */
async function seed(page: Page, key: string, state: Record<string, unknown>) {
  await page.addInitScript(
    ([storageKey, value]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value);
    },
    [key, JSON.stringify({ state, version: 3 })] as const,
  );
}

const seedProgress = (page: Page, state: Record<string, unknown>) =>
  seed(page, PROGRESS_KEY, state);
const seedSettings = (page: Page, state: Record<string, unknown>) =>
  seed(page, SETTINGS_KEY, state);

const SHORT_GAME =
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. a3 Nxc2+ 10. Kd1 Nxa1 *';

test.describe('game review', () => {
  test('draws the evaluation graph and lists key moments that jump to the move', async ({
    page,
  }) => {
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page.locator('textarea').fill(SHORT_GAME);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('combobox', { name: 'Review depth' }).selectOption('fast');
    await page.getByRole('button', { name: 'Review game' }).click();

    const graph = page.locator('.evalgraph');
    await expect(graph).toBeVisible({ timeout: 120_000 });
    // Markers and key moments arrive when the whole review is done, which can take a while on a busy machine.
    await expect(page.locator('.evalgraph__marker').first()).toBeVisible({ timeout: 120_000 });
    const moments = page.locator('.moments__item');
    await expect(moments.first()).toBeVisible({ timeout: 120_000 });
    await moments.first().click();
    await expect(moments.first()).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.treemoves__move--current')).toBeVisible();
    // The graph is keyboard-navigable and every reviewed move offers a rematch.
    await expect(page.getByRole('link', { name: /Retry from here/ })).toBeVisible();
  });
});

test.describe('play from any position', () => {
  test('starts a game from a FEN with the side to move preselected', async ({ page }) => {
    const fen = '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1';
    await page.goto(`/play?fen=${encodeURIComponent(fen)}&level=2`);
    await expect(page.locator('.dialog .alert')).toContainText(/custom position/i);
    await expect(page.getByLabel('Your colour')).toHaveValue('black');
    await expect(page.getByLabel('Strength')).toHaveValue('2');
    // The query string is consumed so a reload does not restart the setup.
    await expect(page).toHaveURL(/\/play$/);

    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    await expect(page.getByText(/Custom starting position/)).toBeVisible();
    await playMove(board, 'e6', 'd6', 'black');
    await expect(page.locator('.movelist__move').first()).toContainText('Kd6', { timeout: 20_000 });
  });

  test('a solved lesson task can be played out against the engine', async ({ page }) => {
    await page.goto('/learn/how-pieces-move');
    await expect(page.getByRole('link', { name: /Play it vs the engine/ })).toHaveAttribute(
      'href',
      /\/play\?fen=/,
    );
  });
});

test.describe('game import', () => {
  const pgn = (white: string, site: string) =>
    `[Event "Rated blitz game"]\n[Site "${site}"]\n[White "${white}"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0\n`;

  test('fetches a Lichess player’s games and loads the chosen one', async ({ page }) => {
    await page.route('https://lichess.org/api/games/user/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-chess-pgn',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body:
          pgn('alice', 'https://lichess.org/abcd1234') +
          '\n' +
          pgn('carol', 'https://lichess.org/efgh5678'),
      }),
    );
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page
      .getByRole('group', { name: 'Import source' })
      .getByRole('button', { name: 'Lichess' })
      .click();
    await page.getByLabel('Lichess username').fill('alice');
    await page.getByRole('button', { name: 'Fetch recent games' }).click();
    const games = page.getByRole('list', { name: 'Games to import' }).getByRole('listitem');
    await expect(games).toHaveCount(2);
    await games.nth(1).click();
    await expect(page.locator('.treemoves__move').first()).toContainText('e4');
    // The username is remembered for next time.
    await page.reload();
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page
      .getByRole('group', { name: 'Import source' })
      .getByRole('button', { name: 'Lichess' })
      .click();
    await expect(page.getByLabel('Lichess username')).toHaveValue('alice');
  });

  test('fetches chess.com games from the newest archive', async ({ page }) => {
    await page.route('https://api.chess.com/pub/player/dave/games/archives', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          archives: [
            'https://api.chess.com/pub/player/dave/games/2024/01',
            'https://api.chess.com/pub/player/dave/games/2024/02',
          ],
        }),
      }),
    );
    await page.route('https://api.chess.com/pub/player/dave/games/2024/02', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          games: [
            {
              pgn: pgn('dave', 'Chess.com'),
              url: 'https://www.chess.com/game/live/1',
              end_time: 100,
            },
            {
              pgn: pgn('erin', 'Chess.com'),
              url: 'https://www.chess.com/game/live/2',
              end_time: 200,
            },
          ],
        }),
      }),
    );
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page
      .getByRole('group', { name: 'Import source' })
      .getByRole('button', { name: 'chess.com' })
      .click();
    await page.getByLabel('chess.com username').fill('dave');
    await page.getByRole('button', { name: 'Fetch recent games' }).click();
    const games = page.getByRole('list', { name: 'Games to import' }).getByRole('listitem');
    await expect(games).toHaveCount(2);
    // Newest first.
    await expect(games.first()).toContainText('erin');
  });

  test('reports an unknown player instead of failing silently', async ({ page }) => {
    await page.route('https://lichess.org/api/games/user/**', (route) =>
      route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' }),
    );
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page
      .getByRole('group', { name: 'Import source' })
      .getByRole('button', { name: 'Lichess' })
      .click();
    await page.getByLabel('Lichess username').fill('nobody');
    await page.getByRole('button', { name: 'Fetch recent games' }).click();
    await expect(page.locator('.alert')).toContainText(/No player with that username/i);
  });

  test('opens a multi-game PGN file and offers a picker', async ({ page }) => {
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open PGN file/ }).click();
    await (
      await chooser
    ).setFiles({
      name: 'games.pgn',
      mimeType: 'application/x-chess-pgn',
      buffer: Buffer.from(pgn('fay', 'x') + '\n' + pgn('gus', 'y')),
    });
    const games = page.getByRole('list', { name: 'Games to import' }).getByRole('listitem');
    await expect(games).toHaveCount(2);
  });
});

test.describe('puzzle review queue', () => {
  test('serves a due puzzle and reschedules a miss', async ({ page, request }) => {
    const index = (await (await request.get('/puzzles/b1100.json')).json()) as {
      id: string;
      rating: number;
    }[];
    const puzzle = index[0];
    if (!puzzle) throw new Error('No puzzles in the bundled set');
    await seedProgress(page, {
      onboarded: true,
      puzzleRating: 1200,
      puzzleReviews: {
        [puzzle.id]: {
          id: puzzle.id,
          rating: puzzle.rating,
          themes: 'fork',
          step: 0,
          due: Date.now() - 1000,
          lapses: 0,
          addedAt: Date.now() - 90_000_000,
        },
      },
    });
    await page.goto('/puzzles');
    await completeOnboarding(page);
    await expect(page.locator('.segmented__option', { hasText: 'Review' })).toContainText('1');

    await page.goto('/puzzles/review');
    await expectBoard(page);
    await expect(page.locator('.puzzle-status')).toContainText(/Your move/i, { timeout: 20_000 });
    await page.getByRole('button', { name: /Solution/ }).click();
    // The solution plays out on screen; the queue only empties on "Next".
    await expect(page.locator('.puzzle-status')).toContainText(/after a miss/i, {
      timeout: 20_000,
    });
    // Showing the solution counts as a miss: the card returns tomorrow with a lapse.
    await expect
      .poll(async () =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          const cards = raw
            ? (
                JSON.parse(raw) as {
                  state: { puzzleReviews: Record<string, { lapses: number; due: number }> };
                }
              ).state.puzzleReviews
            : {};
          const card = Object.values(cards)[0];
          return card ? { lapses: card.lapses, dueLater: card.due > Date.now() } : null;
        }, PROGRESS_KEY),
      )
      .toEqual({ lapses: 1, dueLater: true });

    await page.getByRole('button', { name: /Skip|Next puzzle/ }).click();
    await expect(page.getByText('Nothing to review right now')).toBeVisible();
    await page.goto('/puzzles/review');
    await expect(page.getByText('Nothing to review right now')).toBeVisible();
  });

  test('the Progress page counts due reviews', async ({ page }) => {
    await seedProgress(page, {
      onboarded: true,
      puzzleRating: 1200,
      puzzleReviews: {
        x1: {
          id: 'x1',
          rating: 1200,
          themes: 'pin',
          step: 0,
          due: Date.now() - 1,
          lapses: 0,
          addedAt: 1,
        },
        x2: {
          id: 'x2',
          rating: 1200,
          themes: 'pin',
          step: 1,
          due: Date.now() + 86_400_000,
          lapses: 0,
          addedAt: 1,
        },
      },
    });
    await page.goto('/progress');
    const stat = page.locator('.stat', { hasText: 'Puzzles to review' });
    await expect(stat).toContainText('1');
    await expect(page.getByRole('link', { name: 'Review queue' })).toHaveAttribute(
      'href',
      /\/puzzles\/review$/,
    );
  });
});

test.describe('home page', () => {
  test('welcomes new learners once', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('#welcome-title');
    await expect(welcome).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(welcome).toBeHidden();
    await page.reload();
    await expect(page.locator('#welcome-title')).toHaveCount(0);
  });

  test('shows today’s plan and the training streak', async ({ page }) => {
    const key = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    await seedSettings(page, { tourDismissed: true });
    await seedProgress(page, {
      onboarded: true,
      puzzleRating: 1200,
      trainingDays: [key(twoDaysAgo), key(yesterday)],
      attempts: [
        {
          id: 'a',
          puzzleRating: 1200,
          outcome: 'solved',
          hintUsed: false,
          ratingBefore: 1200,
          ratingAfter: 1210,
          themes: 'fork',
          at: Date.now() - 1000,
          durationMs: 3000,
        },
      ],
    });
    await page.goto('/');
    const today = page.locator('.home__today');
    await expect(today).toBeVisible();
    await expect(today).toContainText('Daily puzzle');
    await expect(today).toContainText('Solve 5 rated puzzles');
    await expect(today).toContainText('1 of 5 today');
    await expect(today).toContainText('2-day training streak');
    await expect(page.locator('.stat', { hasText: 'Training streak' })).toContainText('2');
  });
});

test.describe('new training content', () => {
  test('blindfold vision drill hides the pieces after the preview', async ({ page }) => {
    await page.goto('/drills/vision?mode=checks');
    await expectBoard(page);
    await page.getByText('Blindfold').click();
    await page.getByRole('button', { name: /Start/ }).click();
    await expect(page.locator('.board--blindfold')).toBeVisible({ timeout: 10_000 });
  });

  test('the new endgame drills, classic games, repertoires and lessons are listed', async ({
    page,
  }) => {
    await page.goto('/drills');
    await expect(page.getByRole('heading', { name: 'Queen endgames' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Minor pieces' })).toBeVisible();
    await expect(page.getByText('Vancura position')).toBeVisible();
    await expect(page.getByText('Queen vs rook')).toBeVisible();

    await page.goto('/classics');
    await expect(page.getByText('The Game of the Century')).toBeVisible();
    await expect(page.getByText('Kasparov’s Immortal')).toBeVisible();
    await expect(page.getByText('The Octopus Knight')).toBeVisible();
    await expect(page.getByText('Botvinnik’s Immortal')).toBeVisible();

    await page.goto('/openings');
    await expect(page.getByText("King's Indian Attack")).toBeVisible();
    await expect(page.getByText('Slav Defence')).toBeVisible();

    await page.goto('/learn');
    for (const title of [
      'The isolated queen’s pawn',
      'Outposts and weak squares',
      'The minority attack',
      'Fortresses and zugzwang',
      'Rook against a minor piece',
      'Queen endgames',
      'Attacking the uncastled king',
      'Visualisation',
    ]) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
  });

  test('a new lesson task accepts the engine-verified move', async ({ page }) => {
    await page.goto('/learn/visualisation');
    await page.getByRole('button', { name: /Continue/ }).click();
    const board = await expectBoard(page);
    // Step 2: the fork trick, Black to move — Nxe4.
    await playMove(board, 'f6', 'e4', 'black');
    await expect(page.locator('.lesson__feedback')).toContainText(/Nxe4/);
  });

  test('a capture-goal drill is playable', async ({ page }) => {
    await page.goto('/drills/endgame/queen-vs-rook');
    await expectBoard(page);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByText(/Win the rook/)).toBeVisible();
    // Let the pieces finish animating into the starting position before locating the queen.
    await page.waitForTimeout(500);
    // Every starting position is White to move: selecting the queen shows its moves.
    const queen = await page.locator('cg-board piece.white.queen').first().boundingBox();
    if (!queen) throw new Error('No white queen on the board');
    await page.mouse.click(queen.x + queen.width / 2, queen.y + queen.height / 2);
    await expect(page.locator('square.move-dest').first()).toBeVisible({ timeout: 20_000 });
  });
});

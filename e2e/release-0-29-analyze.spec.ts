import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { dismissToasts, expectBoard, playMove, waitForBoardIdle } from './helpers';

/**
 * 0.29, Analyze: human moves (what players of a rating play, with the
 * engine's verdict and the traps), time management (the review's time chart
 * and reading, and time findings in My games), "Fix your mistakes" (a guided
 * pass through the learner's mistakes), and position search ("In your games").
 */

const PROGRESS_KEY = 'chess-trainer:progress';
const SETTINGS_KEY = 'chess-trainer:settings';
const GAMES_KEY = 'chess-trainer:games';

/** Onboarded, with the given settings and stored games; set once, so reloads keep what the page saved. */
async function seed(
  page: Page,
  settings: Record<string, unknown> = {},
  games: { games: Record<string, unknown>; player: string } | null = null,
) {
  await page.addInitScript(
    ([progressKey, progress, settingsKey, settingsBlob, gamesKey, gamesBlob]) => {
      if (localStorage.getItem(progressKey)) return;
      localStorage.setItem(progressKey, progress);
      localStorage.setItem(settingsKey, settingsBlob);
      if (gamesBlob) localStorage.setItem(gamesKey, gamesBlob);
    },
    [
      PROGRESS_KEY,
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 8 }),
      SETTINGS_KEY,
      // A shallower analysis keeps the engine's turns short.
      JSON.stringify({
        state: { analysisDepth: 12, reviewDepth: 'fast', ...settings },
        version: 5,
      }),
      GAMES_KEY,
      games ? JSON.stringify({ state: games, version: 1 }) : '',
    ] as const,
  );
}

async function storedSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : {};
  }, SETTINGS_KEY);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('cg-board')
    .exclude('.toasts')
    .analyze();
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
}

/** Loads a PGN through the import panel. */
async function importPgn(page: Page, pgn: string) {
  await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
  await page.getByLabel('Paste a FEN or a PGN').fill(pgn);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

/** Reviews the game on the board (at the fast depth the seed sets) and waits for the result. */
async function reviewGame(page: Page) {
  await page.getByRole('button', { name: 'Review game' }).click();
  await expect(page.locator('.evalgraph')).toBeVisible({ timeout: 120_000 });
}

/* ------------------------------------------------------------------ */
/* Human moves                                                         */
/* ------------------------------------------------------------------ */

/** Legal's mate: Black to move, the knight has just taken on e5 and the queen hangs to Bxd1 — mate in two. */
const LEGAL_TRAP = 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P1b1/2N5/PPPP1PPP/R1BQK2R b KQkq - 0 5';

test.describe('human moves', () => {
  // No service worker: its "ready to work offline" toast must not land on the board mid-test.
  test.use({ serviceWorkers: 'block' });

  test('shows what players of a rating play, judged by the engine, and flags the trap', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await seed(page);
    await page.goto(`/analyze?fen=${encodeURIComponent(LEGAL_TRAP)}`);
    await expectBoard(page);
    const card = page.getByTestId('human-moves');
    await expect(card).toContainText('What players of a chosen rating play here');
    await card.getByRole('switch', { name: 'Human moves' }).click();
    await expect(card.getByRole('switch', { name: 'Human moves' })).toBeChecked();
    await expect(card).toContainText('a one-time download of about 25 MB');
    await card.getByRole('button', { name: 'Download (25 MB)' }).click();

    const rows = card.getByTestId('human-move');
    await expect(rows.first()).toBeVisible({ timeout: 120_000 });
    await expect(rows.first()).toContainText('Bxd1');
    // The engine looks at the moves once its own analysis is done: the favourite loses to mate.
    // (Black is already worse, so by the review's measure of winning chances it may be called a
    // mistake rather than a blunder.)
    await expect(card.getByTestId('human-moves-trap')).toContainText(
      /A trap at 1500: most players choose Bxd1 \(\d+%\), a (mistake|blunder)\. Allows a forced mate in 2 after Bxf7\+\./,
      { timeout: 90_000 },
    );
    await expect(rows.first().getByText(/^(Mistake|Blunder)$/)).toBeVisible();
    await expect(card.getByText('Best')).toBeVisible();
    expect(await axe(page)).toEqual([]);

    // Another rating, remembered.
    await card.getByLabel('Rating of the players').selectOption('1100');
    await expect(card.getByTestId('human-moves-trap')).toContainText('A trap at 1100', {
      timeout: 60_000,
    });
    expect(await storedSettings(page)).toMatchObject({
      analysisHumanMoves: true,
      analysisHumanRating: 1100,
    });

    // A move in the list goes on the board.
    await dismissToasts(page);
    await rows.first().getByRole('button').click();
    await expect(page.locator('.treemoves')).toContainText('Bxd1');
    await expect(card).toContainText('What players rated 1100 play here');
  });

  test('stays out of the way of self-analysis', async ({ page }) => {
    await seed(page, { analysisHumanMoves: true });
    await page.goto('/analyze');
    await importPgn(page, '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *');
    await expect(page.getByTestId('human-moves')).toBeVisible();
    await page.getByRole('button', { name: 'Analyze it yourself first' }).click();
    await expect(page.getByTestId('engine-hidden')).toBeVisible();
    await expect(page.getByTestId('human-moves')).toHaveCount(0);
    await expect(page.getByTestId('in-your-games')).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ */
/* Time management                                                     */
/* ------------------------------------------------------------------ */

/**
 * Legal's mate with the clocks of a 5-minute game: Black thinks four minutes
 * over 4…g6 and falls into the trap with 25 seconds left.
 */
function clockedGame(white: string, black: string): string {
  return `[Event "Rated blitz game"]
[White "${white}"]
[Black "${black}"]
[Result "1-0"]
[TimeControl "300+0"]

1. e4 { [%clk 0:05:00] } 1... e5 { [%clk 0:05:00] } 2. Nf3 { [%clk 0:04:58] } 2... d6 { [%clk 0:04:55] }
3. Bc4 { [%clk 0:04:57] } 3... Bg4 { [%clk 0:04:40] } 4. Nc3 { [%clk 0:04:55] } 4... g6 { [%clk 0:00:25] }
5. Nxe5 { [%clk 0:04:50] } 5... Bxd1 { [%clk 0:00:20] } 6. Bxf7+ { [%clk 0:04:48] } 6... Ke7 { [%clk 0:00:18] }
7. Nd5# { [%clk 0:04:47] } 1-0`;
}

test.describe('time management', () => {
  test('the review shows how the clock was used, in a chart, in words and in a table', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await seed(page);
    await page.goto('/analyze');
    await importPgn(page, clockedGame('Opponent', 'You'));
    await reviewGame(page);

    const chart = page.getByTestId('time-chart');
    await expect(chart).toBeVisible();
    const reading = chart.getByTestId('time-reading');
    // The review may or may not count 4…g6 as a mistake too; the blunder came short of time either way.
    await expect(reading).toContainText(
      /(Your only mistake|\d of your \d mistakes|Both of your mistakes) came with under 30 seconds left\./,
    );
    await expect(reading).toContainText('You spent 4 minutes 20 seconds on move 4, g6');
    const svg = chart.getByRole('img');
    await expect(svg).toHaveAccessibleName(/Time spent on each move: White above the line/);
    await expect(svg).toHaveAccessibleName(/Black used 4 min 42 s over 6 moves/);
    // 5…Bxd1 is a blunder at the review's usual depth, a mistake when a busy machine cuts it short.
    await expect(chart.getByRole('list', { name: 'Key' })).toContainText(/Blunder|Mistake/);
    await expect(chart.getByRole('list', { name: 'Key' })).toContainText('Under 30 seconds left');

    // Every time in a table; a move there goes to it on the board.
    await chart.getByText('The times move by move').click();
    const table = chart.getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(8);
    await expect(table.getByRole('row').nth(4)).toContainText('4 min 15 s, 0:25 left');
    await table.getByRole('button', { name: /B\s?xd1/ }).click();
    await expect(page.locator('.treemoves [aria-current="true"]')).toContainText('Bxd1');
    await expect(table.getByRole('button', { name: /B\s?xd1/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(await axe(page)).toEqual([]);
  });

  test('games without clock times have no time chart', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.goto('/analyze');
    await importPgn(
      page,
      '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0',
    );
    await reviewGame(page);
    await expect(page.getByTestId('moment-why').first()).toBeVisible();
    await expect(page.getByTestId('time-chart')).toHaveCount(0);
  });

  test('My games insights find the time trouble in reviewed games with clocks', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const pgn = clockedGame('Opponent', 'Me');
    await seed(
      page,
      {},
      {
        player: 'Me',
        games: {
          'pgn-clocks': {
            id: 'pgn-clocks',
            pgn,
            white: 'Opponent',
            black: 'Me',
            result: '1-0',
            date: '2026.10.01',
            event: 'Rated blitz game',
            url: null,
            plies: 13,
            speed: 'blitz',
            rated: true,
            timestamp: 1790000000000,
            source: 'pgn',
            importedAt: 1790000000000,
            review: null,
          },
        },
      },
    );
    await page.goto('/games');
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await expect(page.getByTestId('game-accuracy')).toContainText('accuracy', { timeout: 120_000 });
    const time = page.getByTestId('insights-time');
    await expect(time).toContainText('Short of time in 1 of 1 reviewed game with clock times.');
    await expect(time.getByTestId('insights-time-trouble')).toContainText(
      /Mistakes and blunders per 10 moves: 5\.0 when short of time \(2 moves\)/,
    );
    await expect(
      time.getByRole('link', { name: 'Lesson: Practical play and the clock' }),
    ).toBeVisible();
    // Kept with the review: there after a reload too.
    await page.reload();
    await expect(page.getByTestId('insights-time')).toContainText('Short of time in 1 of 1');
  });
});

/* ------------------------------------------------------------------ */
/* Fix your mistakes                                                   */
/* ------------------------------------------------------------------ */

/** "You" with White miss mate in one (4. Qxf7#) and lose the queen instead. */
const MISSED_MATE = `[White "You"]
[Black "Engine"]
[Result "0-1"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Nc3 Nxh5 0-1`;

test.describe('fix your mistakes', () => {
  test('steps through the learner’s mistakes, judges each try and puts the board back', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await seed(page);
    await page.goto('/analyze');
    await importPgn(page, MISSED_MATE);
    await reviewGame(page);

    await page.getByRole('button', { name: /^Fix your mistakes \(\d+\)$/ }).click();
    const panel = page.getByTestId('fix-mistakes');
    await expect(panel).toBeVisible();
    // Everything that could give the answer away is out of sight.
    await expect(page.locator('.treemoves')).toHaveCount(0);
    await expect(page.getByTestId('human-moves')).toHaveCount(0);
    await expect(page.getByTestId('explorer')).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Engine' })).toHaveCount(0);
    expect(await axe(page)).toEqual([]);

    // Any mistakes before the missed mate are shown and passed over.
    const prompt = panel.getByTestId('fix-prompt');
    for (let i = 0; i < 6 && !((await prompt.textContent()) ?? '').includes('Nc3'); i++) {
      await panel.getByRole('button', { name: 'Show the move' }).click();
      await panel.getByTestId('fix-next').click();
    }
    await expect(prompt).toContainText('You played Nc3, a blunder. Find a better move.');
    const board = await expectBoard(page);
    await expect(
      page.getByRole('application', { name: 'Fix your mistakes, white to move' }),
    ).toBeVisible();

    // The arrows do not walk on through the game.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('End');
    await expect(prompt).toContainText('You played Nc3');

    const feedback = panel.getByTestId('fix-feedback');
    await waitForBoardIdle(page);
    await playMove(board, 'd2', 'd3');
    await expect(feedback).toContainText('d3 is not good enough here. Try another move.', {
      timeout: 60_000,
    });
    await waitForBoardIdle(page);
    await playMove(board, 'b1', 'c3');
    await expect(feedback).toContainText(
      'Nc3 is the move you played in the game. Find a better one.',
    );
    await waitForBoardIdle(page);
    await playMove(board, 'h5', 'f7');
    await expect(feedback).toContainText('Yes: Qxf7# is the engine’s move.');
    await expect(panel.getByTestId('fix-why')).toContainText('Why Nc3 was a blunder');

    await panel.getByTestId('fix-next').click();
    await expect(panel.getByTestId('fix-summary')).toContainText(/You found/);
    await expect(panel).toContainText('Nc3 — you found Qxf7# after another try');
    await panel.getByRole('button', { name: 'Back to the game' }).click();

    // The game, the engine and the review are back as they were.
    await expect(page.getByTestId('fix-mistakes')).toHaveCount(0);
    await expect(page.locator('.treemoves')).toContainText('Nxh5');
    await expect(page.getByRole('switch', { name: 'Engine' })).toBeChecked();
    await expect(page.getByRole('application', { name: /^Analysis board/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Fix your mistakes/ })).toBeVisible();
  });

  test('asks which side was the learner’s when the game does not say, and shows a move on request', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await seed(page);
    await page.goto('/analyze');
    await importPgn(page, MISSED_MATE.replace('[White "You"]', '[White "alice"]'));
    await reviewGame(page);
    await page.getByRole('button', { name: 'Fix your mistakes', exact: true }).click();
    const question = page.getByRole('group', { name: 'Which side did you play?' });
    await question.getByRole('button', { name: /^White/ }).click();
    const panel = page.getByTestId('fix-mistakes');
    await expect(panel.getByTestId('fix-progress')).toContainText(/^1 of \d+$/);
    // Shown, every one of them: the misses can become puzzles.
    for (let i = 0; i < 6; i++) {
      if (await panel.getByTestId('fix-summary').isVisible()) break;
      await panel.getByRole('button', { name: 'Show the move' }).click();
      await expect(panel.getByTestId('fix-feedback')).toContainText('The move was');
      await panel.getByTestId('fix-next').click();
    }
    await expect(panel.getByTestId('fix-summary')).toContainText(/You were shown/);
    await panel.getByRole('button', { name: /^Save the .* as puzzles$/ }).click();
    await expect(page.getByText(/Added \d+ puzzles? — find/)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Saved as puzzles' })).toBeDisabled();
  });
});

/* ------------------------------------------------------------------ */
/* Position search                                                     */
/* ------------------------------------------------------------------ */

function storedGame(id: string, pgn: string, white: string, black: string, day: number) {
  return {
    id,
    pgn,
    white,
    black,
    result: '1-0',
    date: `2026.09.${String(day).padStart(2, '0')}`,
    event: '',
    url: null,
    plies: 6,
    speed: 'rapid',
    rated: null,
    timestamp: Date.UTC(2026, 8, day),
    source: 'pgn',
    importedAt: 1,
    review: null,
  };
}

const MY_GAMES = {
  player: 'Me',
  games: {
    ruy: storedGame(
      'ruy',
      '[White "Me"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
      'Me',
      'Bob',
      3,
    ),
    // The same position by another order of moves.
    italian: storedGame(
      'italian',
      '[White "Me"]\n[Black "Carol"]\n\n1. Nf3 Nc6 2. e4 e5 3. Bc4 Bc5 1-0',
      'Me',
      'Carol',
      5,
    ),
    queens: storedGame(
      'queens',
      '[White "Dave"]\n[Black "Me"]\n\n1. d4 d5 2. c4 1-0',
      'Dave',
      'Me',
      1,
    ),
  },
};

/** After 1. e4 e5 2. Nf3 Nc6. */
const TWO_KNIGHTS = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

test.describe('position search', () => {
  // No service worker: its "ready to work offline" toast comes up in the corner where the card's
  // link is, and on a slow WebKit runner the link's click went nowhere (as in "human moves").
  test.use({ serviceWorkers: 'block' });

  test('finds the games that reached the position and opens one at the move played', async ({
    page,
  }) => {
    await seed(page, {}, MY_GAMES);
    await page.goto(`/analyze?fen=${encodeURIComponent(TWO_KNIGHTS)}`);
    await expectBoard(page);
    const card = page.getByTestId('in-your-games');
    await expect(card.getByTestId('in-your-games-count')).toHaveText(
      '2 of your games reached this position.',
    );
    await expect(card.getByRole('list', { name: 'Played next' })).toContainText('Bc4 × 1');
    await expect(card.getByRole('list', { name: 'Played next' })).toContainText('Bb5 × 1');
    const rows = card.getByTestId('in-your-games-game');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('vs Carol');
    await expect(rows.first()).toContainText('then 3. Bc4');
    expect(await axe(page)).toEqual([]);

    // Opened on the move played next, from the learner's side.
    await rows.nth(1).click();
    await expect(page.getByText('Opened Me – Bob.')).toBeVisible();
    await expect(page.locator('.treemoves [aria-current="true"]')).toContainText('Bb5');
    await expect(page.locator('.treemoves')).toContainText('a6');
    await expect(card.getByTestId('in-your-games-count')).toHaveText(
      'One of your games reached this position.',
    );

    // Work of its own on the board: opening another game asks first.
    await dismissToasts(page);
    const board = await expectBoard(page);
    await waitForBoardIdle(page);
    await playMove(board, 'g8', 'f6', 'white');
    await expect(card.getByTestId('in-your-games-none')).toHaveText(
      'None of your 3 games reached this position.',
    );
    // Back a move (the board has the keyboard focus after a move, so by the button).
    await page.locator('button[aria-label="Previous move"]:visible').first().click();
    await expect(rows).toHaveCount(1);
    await rows.first().click();
    const confirm = page.getByRole('dialog', { name: 'Open Me – Bob?' });
    await expect(confirm).toBeVisible();
    await confirm.getByTestId('confirm-accept').click();
    await expect(page.locator('.treemoves')).not.toContainText('Nf6');
  });

  test('points to My games when there are none', async ({ page }) => {
    await seed(page);
    await page.goto('/analyze');
    const card = page.getByTestId('in-your-games');
    await expect(card).toContainText('Import your games in My games');
    await card.getByRole('link', { name: 'My games' }).click();
    await expect(page).toHaveURL(/\/games$/);
  });
});

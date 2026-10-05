import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { expectBoard, playMove, waitForBoardIdle } from './helpers';

/**
 * 0.15: the thinking skills — blind puzzles, the threat drill, the blunder
 * check in games, and analyzing a game yourself before the engine.
 */
const PROGRESS_KEY = 'chess-trainer:progress';
const SETTINGS_KEY = 'chess-trainer:settings';
const HANDOFF_KEY = 'chess-trainer:handoff-pgn';

// No service worker: its "ready to work offline" toast must not land on a board mid-test, and
// without isolation every browser lets the puzzle files be served from the test.
test.use({ serviceWorkers: 'block' });

/** 1.e4 e5 2.Bc4 Nc6 3.Qh5: Black to move, White threatens Qxf7#. */
const SCHOLAR = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';

async function seed(page: Page, progress: object = {}, settings: object = {}) {
  await page.addInitScript(
    ([progressKey, progressBlob, settingsKey, settingsBlob]) => {
      if (localStorage.getItem(progressKey)) return;
      localStorage.setItem(progressKey, progressBlob);
      localStorage.setItem(settingsKey, settingsBlob);
    },
    [
      PROGRESS_KEY,
      JSON.stringify({
        state: { onboarded: true, puzzleRating: 1200, ...progress },
        version: 8,
      }),
      SETTINGS_KEY,
      JSON.stringify({ state: settings, version: 5 }),
    ] as const,
  );
}

async function stored<T>(page: Page, field: string): Promise<T> {
  return page.evaluate(
    ([key, name]) => {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state[name] : undefined;
    },
    [PROGRESS_KEY, field] as const,
  ) as Promise<T>;
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('cg-board')
    .exclude('.toasts')
    .analyze();
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
}

/** Serves a puzzle set of one: 20...Bf6 21.Qh7+ Kf8 22.Qxf7#. */
async function onePuzzle(page: Page) {
  const puzzle = {
    id: 'ob6XZ',
    fen: 'r1bq2k1/pp3pb1/4p1n1/2p3NQ/4P3/2P3P1/PP3PBP/R5K1 b - - 1 20',
    moves: 'g7f6 h5h7 g8f8 h7f7',
    rating: 1104,
    rd: 75,
    popularity: 95,
    plays: 1000,
    themes: 'kingsideAttack mate mateIn2 middlegame short',
    url: 'https://lichess.org/training/ob6XZ',
  };
  await page.route('**/puzzles/index.json', (route) =>
    route.fulfill({
      json: {
        source: 'test',
        license: 'CC0',
        generatedAt: '2026-10-05',
        total: 1,
        chunk: 500,
        buckets: [
          {
            id: 'b0400',
            label: 'All',
            min: 0,
            max: 4000,
            count: 1,
            files: ['b-test-00.json'],
            ranges: [{ min: 1104, max: 1104 }],
          },
        ],
        themes: { short: 1, mateIn2: 1 },
        openings: {},
      },
    }),
  );
  await page.route('**/puzzles/b-test-00.json', (route) => route.fulfill({ json: [puzzle] }));
}

test.describe('blind puzzles', () => {
  test('the board stays put while the line is played by clicks and typing', async ({ page }) => {
    // Keyboard move entry on: phones show the typed-move field only then (desktops always do).
    await seed(page, {}, { moveInput: true });
    await onePuzzle(page);
    await page.goto('/puzzles/blind');
    await expect(page.getByRole('radio', { name: 'Blind' })).toBeChecked();
    const line = page.getByTestId('blind-line');
    await expect(line).toContainText('20...');
    await expect(page.getByRole('button', { name: /Peek/ })).toBeDisabled();

    await page.getByRole('button', { name: 'h5, white queen' }).click();
    await page.getByRole('button', { name: 'h7, empty' }).click();
    await expect(line).toContainText('Kf8');
    // The queen went to h7 in the line, and is still on h5 on the board.
    await expect(page.getByRole('button', { name: 'h5, white queen' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Your move' })).toContainText(
      'Black plays king g8 to f8',
    );
    expect(await axe(page)).toEqual([]);

    const input = page.getByRole('textbox', { name: 'Enter a move' });
    await input.fill('qxf7');
    await input.press('Enter');
    await expect(page.locator('.puzzle-status')).toContainText('Solved!');
    await expect(page.getByTestId('blind-level')).toHaveText('Level 900 → 940 (+40).');
    // The board now shows where the line ended.
    await expect(page.getByRole('button', { name: 'f7, white queen' })).toBeVisible();
    const blind = await stored<{ solved: number; levels: Record<string, number> }>(page, 'blind');
    expect(blind.solved).toBe(1);
    expect(blind.levels.short).toBe(940);
  });
});

test.describe('the threat drill', () => {
  test('names the threat on the board, then meets it', async ({ page }) => {
    // One of the learner's own threats is due: it comes first.
    const own = {
      id: 'threat-e2e',
      fen: SCHOLAR,
      threat: 'h5f7',
      line: ['h5f7'],
      defences: ['g7g6', 'd8e7', 'd8f6'],
      rating: 1200,
      kind: 'mate',
      source: { title: 'me – Bot, 2026-10-01', ply: 6, played: 'Nf6', byLearner: true },
      createdAt: 1,
      found: 0,
      missed: 0,
      streak: 0,
    };
    await seed(page, { ownThreats: { [own.id]: own } });
    await page.goto('/drills');
    await page.getByRole('link', { name: /What’s the threat\?/ }).click();
    await expect(page).toHaveURL(/\/drills\/threats$/);
    const status = page.getByTestId('threat-status');
    await expect(status).toContainText('What does White threaten?');
    await expect(page.getByText('From your game')).toBeVisible();
    expect(await axe(page)).toEqual([]);

    const board = await expectBoard(page);
    await playMove(board, 'h5', 'f7', 'black');
    await expect(status).toContainText('Right: Qxf7# mates.');
    await waitForBoardIdle(page);
    await playMove(board, 'g7', 'g6', 'black');
    await expect(status).toContainText('Held: g6 meets the threat.');
    await expect(page.getByTestId('threat-summary')).toContainText(
      'From me – Bot, 2026-10-01, move 3: you played Nf6',
    );
    const threats = await stored<{ found: number; defended: number }>(page, 'threatStats');
    expect(threats).toMatchObject({ found: 1, defended: 1 });
    // On to a bundled position: the drill keeps going without the learner's own.
    await page.getByRole('button', { name: /Next position/ }).click();
    await expect(status).toContainText(/What does (White|Black) threaten\?/);
    await expect(page.getByText('From your game')).toHaveCount(0);
  });
});

test.describe('the blunder check', () => {
  test('holds back a hanging move until the learner decides', async ({ page }) => {
    await seed(page, {}, { playBlunderCheck: true });
    // 1.e4 e5 2.Nf3 Nc6: 3.Ba6?? loses the bishop.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    await page.goto(`/play?fen=${encodeURIComponent(fen)}&color=white`);
    const setup = page.getByRole('dialog', { name: 'New game' });
    await expect(setup.getByRole('switch', { name: 'Blunder check' })).toBeChecked();
    await setup.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByText(/Blunder check on/)).toBeVisible();

    const board = await expectBoard(page);
    await playMove(board, 'f1', 'a6');
    const alert = page.getByTestId('blunder-alert');
    await expect(alert).toContainText(
      'Checks, captures, threats? Before you play Ba6: one of your opponent’s answers wins material.',
    );
    await alert.getByRole('button', { name: 'Show me' }).click();
    await expect(alert).toContainText('bxa6 takes your bishop, and you end up 3 pawns down.');
    await alert.getByRole('button', { name: 'Look again' }).click();
    await expect(alert).toHaveCount(0);

    await waitForBoardIdle(page);
    await playMove(board, 'f1', 'c4');
    // Played, and answered by the engine.
    await expect(page.getByLabel('Move list').locator('.movelist__move')).toHaveCount(2, {
      timeout: 30_000,
    });
    const checks = await stored<{ stopped: number }>(page, 'blunderChecks');
    expect(checks.stopped).toBe(1);
  });
});

test.describe('analyze it yourself', () => {
  test('marks and a move instead, then the engine’s verdict on them', async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page);
    await page.addInitScript(([key, value]) => sessionStorage.setItem(key, value), [
      HANDOFF_KEY,
      JSON.stringify({
        pgn: '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
        orientation: 'white',
      }),
    ] as const);
    await page.goto('/analyze?from=game&self=1');
    await expect(page.getByTestId('engine-hidden')).toBeVisible();
    await expect(page.getByTestId('self-review')).toBeVisible();

    // To 3...Nf6, and mark it with M.
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('m');
    const panel = page.getByTestId('self-review');
    await expect(panel.getByRole('button', { name: /Marked/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await panel.getByRole('button', { name: 'Your move instead' }).click();
    await expect(panel).toContainText('Play the move you would choose instead of');
    const board = await expectBoard(page);
    await waitForBoardIdle(page);
    await playMove(board, 'g7', 'g6');
    await expect(panel.getByRole('list', { name: 'Your turning points' })).toContainText(
      'instead: g6',
    );
    expect(await axe(page)).toEqual([]);

    await panel.getByRole('button', { name: 'Check with the engine' }).click();
    const result = page.getByTestId('self-review-result');
    await expect(result).toBeVisible({ timeout: 150_000 });
    await expect(result).toContainText(/You found 1 of \d+ turning points?/);
    await expect(result.getByRole('list', { name: 'The engine’s turning points' })).toContainText(
      'you found it',
    );
    await expect(result.getByRole('list', { name: 'Your moves instead' })).toContainText(
      /instead of Nf6: (as good as the engine’s move|a good move|playable)/,
    );
    const selfReview = await stored<{ games: number; found: number }>(page, 'selfReview');
    expect(selfReview).toMatchObject({ games: 1, found: 1 });
    // The engine is back once the comparison is in.
    await expect(page.getByTestId('engine-hidden')).toHaveCount(0);
  });
});

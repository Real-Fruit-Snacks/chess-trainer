import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { dismissToasts, expectBoard, playMove, waitForBoardIdle } from './helpers';

/**
 * 0.16: the human-like opponent — Maia-3, a model trained on people's games,
 * playing at a chosen rating. Downloaded on request (the model and the runtime
 * that plays it), kept on the device, run in a worker.
 */
const PROGRESS_KEY = 'chess-trainer:progress';
const SETTINGS_KEY = 'chess-trainer:settings';

async function seed(page: Page, settings: object = {}) {
  await page.addInitScript(
    ([progressKey, progressBlob, settingsKey, settingsBlob]) => {
      if (localStorage.getItem(progressKey)) return;
      localStorage.setItem(progressKey, progressBlob);
      localStorage.setItem(settingsKey, settingsBlob);
    },
    [
      PROGRESS_KEY,
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 8 }),
      SETTINGS_KEY,
      JSON.stringify({ state: settings, version: 5 }),
    ] as const,
  );
}

async function storedState(page: Page, key: string): Promise<Record<string, unknown>> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : {};
  }, key);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('cg-board')
    .exclude('.toasts')
    .analyze();
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
}

const setupDialog = (page: Page) => page.getByRole('dialog', { name: 'New game' });

/** Chooses the human-like opponent in the setup dialog and downloads it. */
async function downloadFromSetup(page: Page, rating: string) {
  const setup = setupDialog(page);
  await setup.getByLabel('Opponent').selectOption('humanlike');
  await setup.getByLabel('Rating').selectOption(rating);
  const status = setup.getByTestId('human-download-status');
  await expect(status).toContainText('A one-time download of about 25 MB');
  await expect(setup.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  await setup.getByRole('button', { name: 'Download (25 MB)' }).click();
  await expect(status).toContainText('On this device (25 MB), ready offline.', {
    timeout: 120_000,
  });
}

/** Plays 1.e4 and waits for the human-like opponent's answer. */
async function playAndAwaitReply(page: Page) {
  const board = await expectBoard(page);
  await waitForBoardIdle(page);
  await playMove(board, 'e2', 'e4');
  await expect(page.getByLabel('Move list').locator('.movelist__move')).toHaveCount(2, {
    timeout: 60_000,
  });
}

test.describe('the human-like opponent', () => {
  // No service worker: its "ready to work offline" toast must not land on the board mid-test.
  // The files are read from the page's own download all the same.
  test.use({ serviceWorkers: 'block' });

  test('is downloaded on request and answers like a player of the rating', async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page);
    await page.goto('/play');
    await downloadFromSetup(page, '1500');
    expect(await axe(page)).toEqual([]);
    await setupDialog(page).getByRole('button', { name: 'Start', exact: true }).click();

    await expect(page.getByText('Plays like a 1500-rated player.')).toBeVisible();
    await expect(page.getByText('Maia · 1500').first()).toBeVisible();
    await playAndAwaitReply(page);
    // Its answer is one of the replies people actually play. (A piece move is a figurine and its
    // square, which Firefox's innerText puts on two lines.)
    const reply = await page.getByLabel('Move list').locator('.movelist__move').nth(1).innerText();
    expect(reply.replace(/\s+/g, '')).toMatch(
      /^(e5|c5|e6|c6|d5|d6|Nf6|Nc6|g6|b6|a6|h6|Qh4|f5|g5|b5|a5|h5|Na6|Nh6|f6)$/,
    );

    // The choice is remembered for the next game.
    const settings = await storedState(page, SETTINGS_KEY);
    expect(settings).toMatchObject({ playOpponent: 'humanlike', playHumanRating: 1500 });

    await dismissToasts(page);
    await page.getByRole('button', { name: 'Resign' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
    await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible();
    const progress = await storedState(page, PROGRESS_KEY);
    const [last] = progress.games as { source: string; opponentRating: number; pgn: string }[];
    expect(last).toMatchObject({ source: 'humanlike', opponentRating: 1500 });
    expect(last?.pgn).toContain('Maia 1500 (human-like)');

    // Progress keeps its results by rating, next to the engine levels.
    await page.goto('/progress');
    const results = page.getByTestId('level-results');
    await expect(results).toContainText('Human-like · 1500');
    await expect(results).toContainText('0–0–1');
    await expect(page.getByRole('cell', { name: 'Human-like · 1500' })).toBeVisible();
  });
});

test.describe('the human-like opponent with the service worker', () => {
  // As in real use. (Playwright's WebKit also keeps a page's Cache Storage across page loads only
  // when service workers are allowed.)
  test('plays offline from the device’s own copy, and can be deleted in Settings', async ({
    page,
    context,
    browserName,
  }) => {
    test.setTimeout(180_000);
    await seed(page);
    await page.goto('/play');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await downloadFromSetup(page, '1100');

    // A fresh page and a fresh worker, then no network at all: the stored copy is what plays.
    // (Playwright's WebKit cannot start a worker while emulating offline, so there it plays
    // online — from the same copy, which the worker reads first.)
    await page.reload();
    await page.waitForLoadState('load');
    const setup = setupDialog(page);
    await setup.getByLabel('Opponent').selectOption('humanlike');
    await expect(setup.getByTestId('human-download-status')).toContainText('On this device');
    await dismissToasts(page);
    await context.setOffline(browserName !== 'webkit');
    try {
      await setup.getByRole('button', { name: 'Start', exact: true }).click();
      await playAndAwaitReply(page);
    } finally {
      await context.setOffline(false);
    }

    await page.goto('/settings');
    const section = page.getByTestId('human-opponent-setting');
    await expect(section.getByTestId('human-download-status')).toContainText('On this device');
    expect(await axe(page)).toEqual([]);
    await section.getByRole('button', { name: 'Delete' }).click();
    await expect(section.getByTestId('human-download-status')).toContainText(
      'A one-time download of about 25 MB',
    );
    await expect(section.getByRole('button', { name: 'Download (25 MB)' })).toBeVisible();
  });

  test('starts and plays once the service worker isolates the page', async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, { playOpponent: 'humanlike', playHumanRating: 1900 });
    await page.goto('/play');
    // The second load is cross-origin isolated (the threaded engine): the model must run there too.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.reload();
    await page.waitForLoadState('load');
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    const setup = setupDialog(page);
    await expect(setup.getByLabel('Rating')).toHaveValue('1900');
    await setup.getByRole('button', { name: 'Download (25 MB)' }).click();
    await expect(setup.getByTestId('human-download-status')).toContainText('On this device', {
      timeout: 120_000,
    });
    await dismissToasts(page);
    await setup.getByRole('button', { name: 'Start', exact: true }).click();
    await playAndAwaitReply(page);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { FakeLichess } from '../src/test/fakeLichess';
import { expectBoard, playMove, waitForBoardIdle } from './helpers';

/**
 * 0.17: the Lichess account sync, against a stand-in lichess.org (the one the
 * unit tests use, which answers as lila does) — the sign-in with its approval
 * page, puzzles solved offline going up once back online, another device's
 * repertoires, analyses, games and missed puzzles coming in, and Disconnect.
 *
 * The stand-in answers through page routes, which the service worker would
 * bypass, so it is kept out of this file.
 */
test.use({ serviceWorkers: 'block' });

const PROGRESS_KEY = 'chess-trainer:progress';
const LICHESS_KEY = 'chess-trainer:lichess';
const answers = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../src/lib/lichess/fixtures/puzzles.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, unknown>;

/** lichess.org answered by the stand-in; `offline()` makes it unreachable. */
async function standIn(page: Page): Promise<FakeLichess> {
  const fake = new FakeLichess();
  await page.route('https://lichess.org/**', async (route) => {
    const request = route.request();
    const res = await fake.handle({
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      body: request.postData() ?? '',
    });
    await route.fulfill({ status: res.status, headers: res.headers, body: res.body });
  });
  return fake;
}

/**
 * An onboarded learner, connected to the stand-in's account when a token is
 * given (`lichess`: more of the connection's stored state).
 */
async function seed(page: Page, token?: string, lichess: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([progressKey, progressBlob, lichessKey, lichessBlob]) => {
      if (localStorage.getItem(progressKey)) return;
      localStorage.setItem(progressKey, progressBlob);
      if (lichessBlob) localStorage.setItem(lichessKey, lichessBlob);
    },
    [
      PROGRESS_KEY,
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1250, puzzleRd: 60 }, version: 8 }),
      LICHESS_KEY,
      token
        ? JSON.stringify({
            state: {
              account: {
                id: 'learner',
                username: 'Learner',
                token,
                connectedAt: Date.now(),
                expiresAt: null,
              },
              syncedUser: 'Learner',
              backlog: 'done',
              ...lichess,
            },
            version: 1,
          })
        : '',
    ] as const,
  );
}

/** One band of puzzles holding only the Lichess puzzle 6Mhmf (mate in two after …Bxd1). */
async function serveOnePuzzle(page: Page) {
  await page.route('**/puzzles/index.json', (route) =>
    route.fulfill({
      json: {
        source: 'test',
        license: 'CC0-1.0',
        generatedAt: '2026-01-01T00:00:00.000Z',
        chunk: 500,
        total: 1,
        buckets: [
          {
            id: 'b1100',
            label: 'Casual',
            min: 1100,
            max: 1399,
            count: 1,
            files: ['b1100-00.json'],
            ranges: [{ min: 1369, max: 1369 }],
          },
        ],
        themes: { mateIn2: 1 },
      },
    }),
  );
  await page.route('**/puzzles/b1100-00.json', (route) =>
    route.fulfill({
      json: [
        {
          id: '6Mhmf',
          fen: 'r2qkbnr/ppp3pp/2np1p2/4N2b/2B1P3/2N4P/PPPP1PP1/R1BQ1RK1 b kq - 0 7',
          moves: 'h5d1 c4f7 e8e7 c3d5',
          rating: 1369,
          rd: 75,
          popularity: 95,
          plays: 30000,
          themes: 'mate mateIn2 opening short',
          url: 'https://lichess.org/fTVaffvr/black#14',
        },
      ],
    }),
  );
}

const lichessCard = (page: Page) => page.getByTestId('lichess-card');

test('connects through lichess.org, syncs at once, and disconnects', async ({ page }) => {
  const fake = await standIn(page);
  await seed(page);
  await page.goto('settings');
  await expect(lichessCard(page)).toContainText(
    'Keep this device in step with your Lichess account',
  );
  await page.getByTestId('lichess-connect').click();

  // lichess.org asks; the learner approves.
  await expect(page).toHaveURL(/^https:\/\/lichess\.org\/oauth\?/);
  const asked = new URL(page.url());
  expect(asked.searchParams.get('scope')).toBe('puzzle:read puzzle:write study:read study:write');
  expect(asked.searchParams.get('code_challenge_method')).toBe('S256');
  await page.locator('#approve').click();

  await expect(page).toHaveURL(/\/settings#lichess$/);
  await expect(page.getByText('Connected to Lichess as Learner.')).toBeVisible();
  await expect(page.getByTestId('lichess-username')).toHaveText('Learner');
  await expect(page.getByTestId('lichess-status')).toContainText('Synced just now.');
  expect(fake.requests).toContain('POST /api/token');
  expect(fake.requests).toContain('GET /api/account');
  // The token stays out of the address bar and the history.
  expect(page.url()).not.toContain('code=');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('[data-testid="lichess-card"]')
    .analyze();
  expect(results.violations).toEqual([]);

  await page.getByTestId('lichess-disconnect').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByTestId('lichess-connect')).toBeVisible();
  await expect.poll(() => fake.tokens.size).toBe(0);
});

test('connects with a personal token pasted from lichess.org', async ({ page }) => {
  const fake = await standIn(page);
  await seed(page);
  await page.goto('settings');
  await page.getByText('Connect with a personal token instead').click();
  const create = page.getByRole('link', { name: 'Create a token on Lichess' });
  await expect(create).toHaveAttribute('href', /account\/oauth\/token\/create\?scopes/);
  await page.getByLabel('Personal token').fill(fake.issueToken(['puzzle:read']));
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('does not allow everything');
  await page.getByLabel('Personal token').fill(fake.issueToken());
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByTestId('lichess-username')).toHaveText('Learner');
  await expect(page.getByTestId('lichess-status')).toContainText('Synced just now.');
});

test('says so when the connection is cancelled on lichess.org', async ({ page }) => {
  await standIn(page);
  await seed(page);
  await page.goto('settings');
  await page.getByTestId('lichess-connect').click();
  await page.locator('#deny').click();
  await expect(page.getByRole('alert')).toHaveText('The connection was cancelled on Lichess.');
  await page.getByRole('link', { name: 'Back to Settings' }).click();
  await expect(page.getByTestId('lichess-connect')).toBeVisible();
});

test('a puzzle solved offline goes to Lichess once the device is back online', async ({
  page,
  context,
}) => {
  const fake = await standIn(page);
  await seed(page, fake.issueToken());
  await serveOnePuzzle(page);
  await page.goto('puzzles');
  const board = await expectBoard(page);
  const status = page.locator('.puzzle-status');
  // The puzzle opens with the opponent's move (…Bxd1); then it is the learner's turn.
  await expect(status).toHaveText('Your move.');
  await waitForBoardIdle(page);

  await context.setOffline(true);
  await playMove(board, 'c4', 'f7');
  // The reply (…Ke7) comes, and it is the learner's turn again.
  await expect(page.getByRole('progressbar', { name: 'Moves found' })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await expect(status).toHaveText('Your move.');
  await waitForBoardIdle(page);
  await playMove(board, 'c3', 'd5');
  await expect(status).toHaveText('Puzzle solved!');
  await expect(page.getByTestId('lichess-pending')).toHaveText(
    'Offline: one puzzle result waits here and goes to Lichess when this device is back online.',
  );
  expect(fake.activity).toEqual([]);

  await context.setOffline(false);
  await expect(page.getByTestId('lichess-pending')).toBeHidden();
  await expect.poll(() => fake.activity.map((r) => [r.id, r.win])).toEqual([['6Mhmf', true]]);
  // The outbox empties once Lichess has confirmed.
  await expect
    .poll(async () => {
      const stored = await page.evaluate((key) => localStorage.getItem(key) ?? '{}', LICHESS_KEY);
      return (JSON.parse(stored) as { state?: { outbox?: { puzzles?: unknown[] } } }).state?.outbox
        ?.puzzles;
    })
    .toEqual([]);
});

test('another device’s repertoires, analyses, games and missed puzzles come in', async ({
  page,
}) => {
  const fake = await standIn(page);
  fake.addStudy('Chess Trainer · Repertoires', [
    { name: 'Caro-Kann', pgn: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 *', orientation: 'black' },
  ]);
  fake.addStudy('Chess Trainer · Analyses: Endgames', [
    {
      name: 'King and pawn',
      pgn: '[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n[SetUp "1"]\n\n1. Kd2 Kd5 2. Kd3 *',
    },
  ]);
  fake.imports.push({
    id: 'gm000777',
    userId: 'learner',
    at: 1,
    pgn: `[Event "Casual game"]\n[White "You"]\n[Black "Engine level 4"]\n[Result "0-1"]\n[ChessTrainer "v=1&id=g-elsewhere&at=1790000000000&level=4&color=white&result=0-1&reason=checkmate&plies=4&source=play"]\n\n1. f3 e5 2. g4 Qh4# 0-1`,
  });
  fake.puzzles.set('6Mhmf', answers['6Mhmf']);
  fake.addRounds([{ id: '6Mhmf', win: false, rating: 1369, themes: ['mateIn2'] }]);
  await seed(page, fake.issueToken());

  await page.goto('settings');
  await expect(page.getByTestId('lichess-status')).toContainText(
    'Synced just now. 1 puzzle from your Lichess history (1 to review), 1 game from other devices, 2 repertoires and analyses updated here.',
  );

  await page.goto('openings');
  await expect(page.getByText('Caro-Kann').first()).toBeVisible();
  await page.goto('analyze');
  await page.getByTestId('open-library').click();
  await expect(page.getByRole('dialog').getByText('King and pawn')).toBeVisible();
  await page.goto('progress');
  await expect(page.getByText('Level 4 ·').first()).toBeVisible();
  // The missed puzzle waits in the review queue (it comes back tomorrow), kept whole on this
  // device: it opens without the puzzle files.
  const progress = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as { state: Record<string, object> },
    PROGRESS_KEY,
  );
  expect(Object.keys(progress.state.puzzleReviews ?? {})).toEqual(['6Mhmf']);
  expect(Object.keys(progress.state.lichessPuzzles ?? {})).toEqual(['6Mhmf']);
  await page.route('**/puzzles/*.json', (route) => route.abort());
  await page.goto('puzzles?id=6Mhmf');
  await expectBoard(page);
  await expect(page.getByLabel('Puzzle 6Mhmf, white to move')).toBeVisible();
});

test('an account 0.17.0 signed out by mistake carries on, its study read all the same', async ({
  page,
}) => {
  const fake = await standIn(page);
  // 0.17.0 made its studies with sharing set to nobody: Lichess refuses even the owner's export.
  fake.addStudy(
    'Chess Trainer · Repertoires',
    [{ name: 'Caro-Kann', pgn: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 *', orientation: 'black' }],
    'private',
    'nobody',
  );
  // …and took that refusal for a lost sign-in.
  await seed(page, fake.issueToken(), { needsReconnect: true });

  await page.goto('settings');
  await expect(page.getByTestId('lichess-status')).toContainText('Synced just now.');
  await expect(lichessCard(page)).not.toContainText('no longer accepts');
  expect(fake.requests).toContain('POST /api/token/test');
  expect(fake.requests.some((r) => r.startsWith('GET /api/study/by/Learner/export.pgn'))).toBe(
    true,
  );
  await page.goto('openings');
  await expect(page.getByText('Caro-Kann').first()).toBeVisible();
});

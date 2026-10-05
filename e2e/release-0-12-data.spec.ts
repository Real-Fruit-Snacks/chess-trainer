import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

/** The 0.9-era export fixture the unit suite also imports. */
const backupV6 = readFileSync(
  fileURLToPath(new URL('../src/store/fixtures/backup-v6.json', import.meta.url)),
  'utf8',
);

/**
 * 0.12: data safety. Imports ask first, show what the file holds and can be
 * undone; a damaged file is refused and changes nothing; "Reset everything"
 * clears the imported games too; the rating reset is a button with a
 * confirmation; the lab's storage filler never outlives the lab.
 */
const PROGRESS = {
  state: { onboarded: true, puzzleRating: 1800, ratingHistory: [{ at: 1, rating: 1800 }] },
  version: 7,
};

const GAME = {
  id: 'pgn-seeded',
  pgn: '[Event "Club night"]\n[White "Me"]\n[Black "You"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',
  white: 'Me',
  black: 'You',
  result: '1-0',
  date: '2026.09.30',
  event: 'Club night',
  url: null,
  plies: 4,
  speed: null,
  rated: null,
  timestamp: 1790790000000,
  source: 'pgn',
  importedAt: 1790791000000,
  review: null,
};

async function seed(page: Page) {
  await page.addInitScript(
    ([progress, games]) => {
      if (localStorage.getItem('chess-trainer:progress')) return;
      localStorage.setItem('chess-trainer:progress', progress);
      localStorage.setItem('chess-trainer:games', games);
    },
    [
      JSON.stringify(PROGRESS),
      JSON.stringify({ state: { games: { [GAME.id]: GAME }, player: 'Me' }, version: 1 }),
    ] as const,
  );
}

/** The stored puzzle rating, read straight from storage. */
async function storedRating(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('chess-trainer:progress') ?? '{}';
    return (JSON.parse(raw) as { state: { puzzleRating: number } }).state.puzzleRating;
  });
}

async function pickBackup(page: Page, content: string, name = 'backup.json') {
  await page
    .getByTestId('import-file')
    .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
}

test.describe('backup import', () => {
  test('asks first, shows what the file holds, can be cancelled, applied and undone', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/settings');
    await expect(page.getByTestId('settings')).toBeVisible();
    expect(await storedRating(page)).toBe(1800);

    await pickBackup(page, backupV6);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Replace your data/ })).toBeVisible();
    const summary = page.getByTestId('import-summary');
    await expect(summary).toContainText('format 6');
    await expect(summary).toContainText('1 saved analysis');
    await expect(summary).toContainText('1 custom repertoire');
    await expect(page.getByTestId('import-export-first')).toBeVisible();

    // Cancel keeps everything.
    await page.getByTestId('import-cancel').click();
    await expect(dialog).toBeHidden();
    expect(await storedRating(page)).toBe(1800);

    // Confirm replaces; the imported games of this profile go with the rest.
    await pickBackup(page, backupV6);
    await page.getByTestId('import-confirm').click();
    await expect(page.getByText(/Backup imported/)).toBeVisible();
    expect(await storedRating(page)).toBe(1212);
    const stashed = await page.evaluate(() =>
      localStorage.getItem('chess-trainer:pre-import-backup'),
    );
    expect(stashed).toContain('"puzzleRating": 1800');

    // Undo from the toast puts the previous data back.
    await page.getByRole('button', { name: 'Undo import' }).click();
    await expect(page.getByText(/Import undone/)).toBeVisible();
    expect(await storedRating(page)).toBe(1800);
    await page.goto('/games');
    await expect(page.getByTestId('games-table')).toContainText('Me – You');
  });

  test('refuses a crafted file and changes nothing', async ({ page }) => {
    await seed(page);
    await page.goto('/settings');
    await expect(page.getByTestId('settings')).toBeVisible();

    // The shape that used to brick the app: a table where a list belongs.
    await pickBackup(
      page,
      JSON.stringify({
        app: 'chess-trainer',
        version: 6,
        progress: { onboarded: true, puzzleRating: 900, attempts: {}, puzzleReviews: null },
      }),
    );
    await expect(page.getByText(/The backup is damaged: progress\.attempts/)).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await storedRating(page)).toBe(1800);

    // A PGN is recognised for what it is.
    await pickBackup(page, '[Event "Casual"]\n\n1. e4 e5 *', 'game.pgn');
    await expect(page.getByText(/looks like a PGN/)).toBeVisible();
    expect(await storedRating(page)).toBe(1800);

    // The app still works: nothing was half-applied.
    await page.reload();
    await expect(page.getByTestId('settings')).toBeVisible();
    expect(await storedRating(page)).toBe(1800);
  });
});

test.describe('reset and rating', () => {
  test('"Reset everything" clears My games as well', async ({ page }) => {
    await seed(page);
    await page.goto('/games');
    await expect(page.getByTestId('games-table')).toContainText('Me – You');

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Reset everything' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('imported games');
    await expect(dialog).toContainText('Kept:');
    await page.getByTestId('reset-confirm').click();
    await expect(page.getByText(/were cleared/)).toBeVisible();

    await page.goto('/games');
    await expect(page.getByTestId('games-table')).toHaveCount(0);
    await expect(page.getByText(/Nothing imported yet/)).toBeVisible();
    const games = await page.evaluate(() => localStorage.getItem('chess-trainer:games'));
    expect(games).not.toContain('Club night');
  });

  test('the rating reset is a button with a confirmation and keeps the history', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/settings');
    const card = page.getByTestId('rating-settings');
    await card.getByLabel('Start again from').selectOption('casual');
    // Choosing alone changes nothing.
    expect(await storedRating(page)).toBe(1800);
    await page.getByTestId('rating-reset').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Reset your puzzle rating/ })).toBeVisible();
    await expect(dialog).toContainText('history are kept');
    await page.getByTestId('confirm-cancel').click();
    expect(await storedRating(page)).toBe(1800);

    await page.getByTestId('rating-reset').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByText(/Puzzle rating set to 1200/)).toBeVisible();
    expect(await storedRating(page)).toBe(1200);
    const history = await page.evaluate(() => {
      const raw = localStorage.getItem('chess-trainer:progress') ?? '{}';
      return (
        JSON.parse(raw) as { state: { ratingHistory: { rating: number }[] } }
      ).state.ratingHistory.map((p) => p.rating);
    });
    expect(history).toEqual([1800, 1200]);
  });
});

test.describe('the lab', () => {
  test('the storage filler is gone once the lab is left', async ({ page }) => {
    await seed(page);
    await page.goto('/settings/lab');
    await expect(page.getByTestId('lab-storage')).toBeVisible();
    await page.getByTestId('storage-fill').click();
    await expect(page.getByTestId('storage-clear')).toBeEnabled();
    const fillerKeys = () =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) => k.startsWith('chess-trainer:lab-filler-')).length,
      );
    expect(await fillerKeys()).toBeGreaterThan(0);

    // Navigate away within the app: the lab cleans up after itself … (as its page
    // unmounts, which can come a moment after the next page is drawn)
    await page.getByRole('link', { name: 'Settings' }).first().click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect.poll(fillerKeys).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('chess-trainer:lab-probe'))).toBeNull();

    // … and a save works again straight away.
    await page.getByRole('switch', { name: 'Show coordinates' }).click();
    const stored = await page.evaluate(() => localStorage.getItem('chess-trainer:settings'));
    expect(stored).toContain('"showCoordinates":false');
    await expect(page.getByTestId('storage-usage')).not.toContainText('Storage is full');
  });
});

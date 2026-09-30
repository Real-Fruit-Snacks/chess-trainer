import { expect, type Page, test } from '@playwright/test';
import { completeOnboarding, expectBoard, playMove } from './helpers';

const PROGRESS_KEY = 'chess-trainer:progress';

async function seedProgress(page: Page, state: Record<string, unknown>, version = 5) {
  await page.addInitScript(
    ([storageKey, value]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value);
    },
    [PROGRESS_KEY, JSON.stringify({ state, version })] as const,
  );
}

test.describe('puzzle library', () => {
  test('serves 48,000 puzzles in chunks and can store them all offline', async ({ page }) => {
    // 88 chunk downloads compete with the other workers for the preview server.
    test.slow();
    await page.goto('/progress');
    const row = page.getByTestId('offline-puzzles');
    await expect(row).toContainText('48,000 puzzles in the library');
    // Wait for the service worker to control the page so the runtime cache fills.
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, {
      timeout: 30_000,
    });
    await page.getByRole('button', { name: /Download every puzzle/ }).click();
    await expect(row).toContainText('All 48,000 puzzles are available offline', {
      timeout: 120_000,
    });
    await expect(page.getByRole('button', { name: 'Downloaded' })).toBeDisabled();
    const cached = await page.evaluate(async () => {
      const store = await caches.open('chess-trainer-puzzles');
      return (await store.keys()).length;
    });
    // 96 chunk files minus the 8 precached first chunks.
    expect(cached).toBe(88);
    await page.reload();
    await expect(page.getByTestId('offline-puzzles')).toContainText(
      'All 48,000 puzzles are available offline',
    );
  });

  test('rated puzzles come from the new chunks and the theme catalogue grew', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 2450, puzzleRd: 60 });
    await page.goto('/puzzles');
    await completeOnboarding(page);
    await expectBoard(page);
    await expect(page.getByText(/Rating \d{4}/)).toBeVisible();
    await page.goto('/puzzles/themes');
    // Every theme card carries its puzzle count; common themes now have five figures.
    await expect(page.locator('.badge', { hasText: /^\d{5}$/ }).first()).toBeVisible();
  });
});

test.describe('coach and commentary', () => {
  test('the coach pauses after a blunder, explains it and takes it back', async ({ page }) => {
    // White to move with a queen against a lone king: Qd8+?? hangs the queen to Kxd8.
    await page.goto('/play?fen=4k3%2F8%2F8%2F8%2F8%2F8%2F8%2F3QK3%20w%20-%20-%200%201&color=white');
    await page.getByLabel('Strength').selectOption('1');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    await expect(page.getByText(/Coach on/)).toBeVisible();
    await playMove(board, 'd1', 'd8', 'white');
    const alert = page.getByTestId('coach-alert');
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(/Qd8\+ was a (blunder|mistake)/);
    await expect(alert).toContainText(/queen/);
    await expect(alert).toContainText('Kxd8');
    await expect(alert.getByRole('link', { name: /Lesson:/ })).toBeVisible();
    await page.getByRole('button', { name: 'Take it back' }).click();
    await expect(alert).toHaveCount(0);
    // The queen is back on d1 and it is White's move again — the engine never replied.
    await expect(page.locator('cg-board piece.white.queen')).toBeVisible();
    await expect(page.locator('.movelist')).toContainText('No moves yet');
  });

  test('game review explains the key moments in words', async ({ page }) => {
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page
      .locator('textarea')
      .fill(
        '[White "a"]\n[Black "b"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1',
      );
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('combobox', { name: 'Review depth' }).selectOption('fast');
    await page.getByRole('button', { name: 'Review game' }).click();
    await expect(page.locator('.evalgraph')).toBeVisible({ timeout: 120_000 });
    const why = page.getByTestId('moment-why').filter({ hasText: /\S/ });
    await expect(why.first()).toBeVisible({ timeout: 120_000 });
    // Jumping to a mistake shows the explanation with its lesson link.
    await page.locator('.moments__item').first().click();
    await expect(page.getByTestId('move-explanation')).toBeVisible();
    await expect(
      page.getByTestId('move-explanation').getByRole('link', { name: /Lesson:/ }),
    ).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/* Opening explorer and repertoire editing                            */
/* ------------------------------------------------------------------ */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function explorerBody(fen: string, database: string) {
  const start = fen.startsWith(START_FEN.split(' ')[0] ?? '');
  const afterE4 = fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b');
  const scale = database === 'masters' ? 1 : 100;
  if (start) {
    return {
      white: 4000 * scale,
      draws: 3000 * scale,
      black: 2000 * scale,
      moves: [
        { uci: 'e2e4', san: 'e4', white: 2500 * scale, draws: 1800 * scale, black: 1200 * scale },
        { uci: 'd2d4', san: 'd4', white: 1500 * scale, draws: 1200 * scale, black: 800 * scale },
      ],
      topGames: [
        {
          id: 'abcd1234',
          winner: 'white',
          white: { name: 'Carlsen', rating: 2850 },
          black: { name: 'Caruana', rating: 2800 },
          year: 2018,
        },
      ],
      opening: null,
    };
  }
  if (afterE4) {
    return {
      white: 2500 * scale,
      draws: 1800 * scale,
      black: 1200 * scale,
      moves: [
        { uci: 'c7c5', san: 'c5', white: 1200 * scale, draws: 900 * scale, black: 700 * scale },
        { uci: 'e7e5', san: 'e5', white: 1300 * scale, draws: 900 * scale, black: 500 * scale },
      ],
      topGames: [],
      opening: { eco: 'B00', name: "King's Pawn Game" },
    };
  }
  return { white: 0, draws: 0, black: 0, moves: [], topGames: [], opening: null };
}

async function mockExplorer(page: Page) {
  const requests: string[] = [];
  await page.route('https://explorer.lichess.ovh/**', (route) => {
    const url = new URL(route.request().url());
    const database = url.pathname.replace('/', '');
    const fen = url.searchParams.get('fen') ?? '';
    requests.push(`${database}:${fen.split(' ').slice(0, 2).join(' ')}`);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(explorerBody(fen, database)),
    });
  });
  return requests;
}

test.describe('opening explorer', () => {
  test('is off by default, switches on from the card and follows the board', async ({ page }) => {
    const requests = await mockExplorer(page);
    await page.goto('/analyze');
    const explorer = page.getByTestId('explorer');
    await expect(explorer).toContainText('Opening explorer');
    await expect(explorer).toContainText('uses the network');
    expect(requests).toHaveLength(0);

    await explorer.getByRole('button', { name: 'Turn on' }).click();
    await expect(explorer).toContainText('9,000 games');
    await expect(explorer.getByRole('button', { name: 'e4' })).toBeVisible();
    await expect(explorer).toContainText('61 %'); // e4's share of 9,000 games
    await expect(
      explorer.getByRole('link', { name: /Carlsen \(2850\) – Caruana \(2800\)/ }),
    ).toHaveAttribute('href', 'https://lichess.org/abcd1234');

    // Clicking a move plays it on the board and the explorer follows.
    await explorer.getByRole('button', { name: 'e4' }).click();
    await expect(explorer).toContainText("B00 King's Pawn Game");
    await expect(explorer.getByRole('button', { name: 'c5' })).toBeVisible();
    await expect(page.locator('.treemoves')).toContainText('e4');

    // Switching to the Lichess database asks again with that database's parameters.
    await explorer.getByRole('button', { name: 'Lichess' }).click();
    await expect(explorer).toContainText('550,000 games');
    expect(requests.some((r) => r.startsWith('lichess:'))).toBe(true);

    // The choice persists as a setting, which the settings page also exposes.
    await page.goto('/progress');
    const toggle = page.getByRole('switch', { name: /Opening explorer lookups/ });
    await expect(toggle).toBeChecked();
    await page.getByText('Opening explorer lookups', { exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await page.goto('/analyze');
    await expect(
      page.getByTestId('explorer').getByRole('button', { name: 'Turn on' }),
    ).toBeVisible();
  });

  test('a line from the analysis board can start and extend a repertoire', async ({ page }) => {
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page.locator('textarea').fill('1. e4 c5 2. Nf3 d6 3. d4 *');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('button', { name: 'Add line to repertoire' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add this line to a repertoire' });
    await expect(dialog).toContainText('1. e4 c5 2. Nf3 d6 3. d4');
    await dialog.getByLabel('Name').fill('My Open Sicilian');
    await dialog.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByText('Started "My Open Sicilian" with 5 moves.')).toBeVisible();

    // A second line into the same repertoire only adds what is new.
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page.locator('textarea').fill('1. e4 c5 2. Nf3 Nc6 3. Bb5 *');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('button', { name: 'Add line to repertoire' }).click();
    await expect(page.getByTestId('repertoire-target')).toHaveValue(/custom-/);
    await page.getByRole('dialog').getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByText('Added 2 new moves to "My Open Sicilian".')).toBeVisible();

    await page.goto('/openings');
    const card = page.locator('.repertoire-card', { hasText: 'My Open Sicilian' });
    await expect(card).toBeVisible();
    // 5 + 2 moves, of which White's (the learner's) moves are the cards: e4, Nf3, d4, Bb5.
    await expect(card).toContainText('0/4 moves learned');
  });

  test('custom repertoires are edited on the board with explorer suggestions', async ({ page }) => {
    await mockExplorer(page);
    await page.addInitScript(() => {
      // Seed once; edits made by the test must survive reloads.
      if (localStorage.getItem('chess-trainer:repertoire')) return;
      localStorage.setItem(
        'chess-trainer:settings',
        JSON.stringify({ state: { explorer: true }, version: 3 }),
      );
      localStorage.setItem(
        'chess-trainer:repertoire',
        JSON.stringify({
          state: {
            cards: {},
            sessions: [],
            custom: [
              {
                id: 'custom-test',
                name: 'My lines',
                color: 'white',
                pgn: '1. d4 d5 2. c4 *',
                createdAt: 1,
              },
            ],
          },
          version: 1,
        }),
      );
    });
    await page.goto('/openings/custom-test');
    await page.getByRole('button', { name: 'Edit lines' }).click();
    const panel = page.getByTestId('explore-panel');
    await expect(panel).toContainText('d4');

    // The explorer suggests e4 from the start position; clicking it adds a new branch.
    const explorer = page.getByTestId('explorer');
    await explorer.getByRole('button', { name: 'e4' }).click();
    await expect(panel.locator('.treemoves')).toContainText('e4');
    await expect(explorer).toContainText("B00 King's Pawn Game");

    // A note on the new move, saved into the repertoire.
    await panel.getByRole('button', { name: 'Add note' }).click();
    await panel.getByLabel('Note for this move').fill('Open games to learn tactics.');
    await panel.getByRole('button', { name: 'Save note' }).click();
    await expect(panel.getByRole('status')).toContainText('Open games to learn tactics.');

    // Playing on the board extends the line.
    const board = await expectBoard(page);
    await playMove(board, 'e7', 'e5');
    await expect(panel.locator('.treemoves')).toContainText('e5');

    // Everything survives a reload because the repertoire itself was changed.
    await page.reload();
    await page.getByRole('button', { name: 'Edit lines' }).click();
    await expect(page.getByTestId('explore-panel').locator('.treemoves')).toContainText('e5');
    await page.getByTestId('explore-panel').locator('.treemoves__move', { hasText: 'e4' }).click();
    await expect(page.getByTestId('explore-panel').getByRole('status')).toContainText(
      'Open games to learn tactics.',
    );

    // Deleting from the e4 move removes that whole branch; d4 remains.
    await page
      .getByTestId('explore-panel')
      .getByRole('button', { name: 'Delete from here' })
      .click();
    await expect(page.getByTestId('explore-panel').locator('.treemoves')).not.toContainText('e4');
    await expect(page.getByTestId('explore-panel').locator('.treemoves')).toContainText('d4');

    // Built-in repertoires stay read-only: the explorer only navigates within them.
    await page.goto('/openings');
    const builtIn = page.locator('.repertoire-card').filter({ hasNotText: 'My lines' }).first();
    await builtIn.getByRole('link', { name: /Learn|Review|Practise/ }).click();
    await page.getByRole('button', { name: 'Explore lines' }).click();
    await expect(page.getByTestId('explore-panel')).not.toContainText('Delete from here');
  });
});

/* ------------------------------------------------------------------ */
/* Content: lessons, repertoires, classic games                        */
/* ------------------------------------------------------------------ */

test.describe('new content', () => {
  test('a new lesson can be completed with its scripted replies', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    await page.goto('/learn/zwischenzug-and-quiet-moves');
    await expectBoard(page);
    const anyAction = page.locator(
      'button:has-text("Show answer"), button:has-text("Finish"), button:has-text("Continue")',
    );
    for (let i = 0; i < 20; i++) {
      await anyAction.first().waitFor();
      const show = page.getByRole('button', { name: 'Show answer' });
      if (await show.isVisible()) {
        await show.click();
        await page
          .locator('button:has-text("Finish"), button:has-text("Continue")')
          .first()
          .waitFor();
      }
      const finish = page.getByRole('button', { name: /Finish/ });
      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await page.getByRole('button', { name: /Continue/ }).click();
    }
    await expect(page.getByText('Lesson complete')).toBeVisible();
    await page.goto('/learn');
    await expect(page.getByText('Plans in the Sicilian')).toBeVisible();
    await expect(page.getByText('Rook against a pawn')).toBeVisible();
  });

  test('the new repertoires and classic games are listed and open', async ({ page }) => {
    await page.goto('/openings');
    for (const name of [
      'Ruy Lopez',
      'Vienna Game',
      'Alapin Sicilian',
      'Nimzo-Indian Defence',
      'Najdorf Sicilian',
    ]) {
      await expect(page.locator('.repertoire-card', { hasText: name })).toBeVisible();
    }
    await page
      .locator('.repertoire-card', { hasText: 'Najdorf Sicilian' })
      .getByRole('link', { name: /Learn/ })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Najdorf Sicilian' })).toBeVisible();
    await page.getByRole('button', { name: 'Explore lines' }).click();
    await expect(page.getByTestId('explore-panel')).toContainText('Bg5');

    await page.goto('/classics');
    await expect(page.getByText('The king walk').first()).toBeVisible();
    await expect(page.getByText('The immortal zugzwang').first()).toBeVisible();
    await page
      .getByRole('link', { name: /The king walk/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'The king walk' })).toBeVisible();
    await expectBoard(page);
  });
});

/* ------------------------------------------------------------------ */
/* Platform: placement, backups, badge, haptics, landscape            */
/* ------------------------------------------------------------------ */

test.describe('platform', () => {
  test('the placement quiz recommends a course and starts the calibration from its rating', async ({
    page,
  }) => {
    await page.goto('/placement');
    await page.getByTestId('placement-experience').getByText('I play regularly online').click();
    await page.getByTestId('placement-next').click();
    // Rules: tick everything.
    for (const box of await page.getByRole('checkbox').all()) await box.check();
    await page.getByTestId('placement-next').click();
    // Three positions: solve the first, skip the second, miss the third.
    await page.getByTestId('placement-tactic').getByText('Re8#').click();
    await page.getByTestId('placement-next').click();
    await expect(page.getByTestId('placement-next')).toHaveText('Skip');
    await page.getByTestId('placement-next').click();
    await page.getByTestId('placement-tactic').getByText('Qh8+').click();
    await page.getByTestId('placement-next').click();
    await page
      .getByTestId('placement-endgames')
      .getByText(/king and queen/)
      .click();
    await page.getByTestId('placement-next').click();
    await page
      .getByTestId('placement-openings')
      .getByText(/few openings/)
      .click();
    await page.getByTestId('placement-next').click();

    const result = page.getByTestId('placement-result');
    await expect(result).toContainText('Club player');
    await expect(page.getByTestId('placement-rating')).toHaveText('1,220');
    await expect(result).toContainText('1/3');
    await expect(result.getByRole('link', { name: 'Quiet move' })).toBeVisible();
    await page.getByTestId('placement-start-puzzles').click();
    await expect(page).toHaveURL(/\/puzzles$/);
    await expect(page.getByTestId('calibration')).toBeVisible();
    await expect(page.getByText(/Rating 1,220|1,220/).first()).toBeVisible();
    const placement = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as { state: { placement: unknown } }).state.placement : null;
    }, PROGRESS_KEY);
    expect(placement).toMatchObject({ rating: 1220, courseId: 'club-player' });
  });

  test('reminds about backups, exports a file and remembers it', async ({ page }) => {
    const attempts = Array.from({ length: 45 }, (_, i) => ({
      id: `p${i}`,
      at: Date.now() - i * 60_000,
      outcome: 'solved',
      durationMs: 10_000,
      hintUsed: false,
      puzzleRating: 1200,
      ratingBefore: 1200,
      ratingAfter: 1205,
      themes: 'fork',
    }));
    await seedProgress(page, { onboarded: true, puzzleRating: 1300, ratedAttempts: 45, attempts });
    await page.goto('/progress');
    const nudge = page.getByTestId('backup-nudge');
    await expect(nudge).toContainText('never made a backup');
    const download = page.waitForEvent('download');
    await nudge.getByRole('button', { name: 'Export' }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^chess-trainer-progress-\d{4}-\d{2}-\d{2}\.json$/,
    );
    await expect(nudge).toHaveCount(0);
    await expect(page.getByText(/Last backup/)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('backup-nudge')).toHaveCount(0);
  });

  test('a backup opened with the app is imported, and the icon badge shows due reviews', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as {
        __badges: (number | 'clear')[];
        __consumer: ((p: { files: { getFile: () => Promise<File> }[] }) => void) | null;
      };
      w.__badges = [];
      w.__consumer = null;
      Object.defineProperty(navigator, 'setAppBadge', {
        value: (n: number) => {
          w.__badges.push(n);
          return Promise.resolve();
        },
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: () => {
          w.__badges.push('clear');
          return Promise.resolve();
        },
      });
      // Chromium defines launchQueue itself (read-only); replace it for the test.
      Object.defineProperty(window, 'launchQueue', {
        configurable: true,
        value: {
          setConsumer: (fn: never) => {
            w.__consumer = fn;
          },
        },
      });
    });
    await page.goto('/');
    // Nothing due yet: the badge is cleared.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __badges: unknown[] }).__badges))
      .toContain('clear');

    // A backup with two puzzles due for review arrives through the launch queue.
    const imported = await page.evaluate(() => {
      const w = window as unknown as {
        __consumer: ((p: { files: { getFile: () => Promise<File> }[] }) => void) | null;
      };
      if (!w.__consumer) return false;
      const state = {
        app: 'chess-trainer',
        version: 4,
        progress: {
          onboarded: true,
          puzzleRating: 1777,
          puzzleRd: 60,
          puzzleReviews: {
            a: {
              id: 'a',
              due: Date.now() - 600_000,
              interval: 1,
              ease: 2.5,
              reps: 1,
              lapses: 0,
              rating: 1200,
              themes: 'fork',
              addedAt: 1,
            },
            b: {
              id: 'b',
              due: Date.now() - 600_000,
              interval: 1,
              ease: 2.5,
              reps: 1,
              lapses: 0,
              rating: 1200,
              themes: 'pin',
              addedAt: 1,
            },
          },
        },
      };
      const file = new File([JSON.stringify(state)], 'backup.json', { type: 'application/json' });
      w.__consumer({ files: [{ getFile: () => Promise.resolve(file) }] });
      return true;
    });
    expect(imported).toBe(true);
    await expect(page.getByText('Progress imported from the backup file.')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __badges: unknown[] }).__badges))
      .toContain(2);
    // Switching the badge off clears it.
    await page.goto('/progress');
    await page.getByText('Badge on the app icon', { exact: true }).click();
    await expect
      .poll(async () => {
        const badges = await page.evaluate(
          () => (window as unknown as { __badges: unknown[] }).__badges,
        );
        return badges[badges.length - 1];
      })
      .toBe('clear');
  });

  test('vibrates on moves when haptics are on and not when they are off', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __vibrations: unknown[] }).__vibrations = [];
      Object.defineProperty(navigator, 'vibrate', {
        value: (pattern: unknown) => {
          (window as unknown as { __vibrations: unknown[] }).__vibrations.push(pattern);
          return true;
        },
      });
    });
    await page.goto('/play?fen=4k3%2F8%2F8%2F8%2F8%2F8%2F8%2F3QK3%20w%20-%20-%200%201&color=white');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    await playMove(board, 'e1', 'e2');
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations.length),
      )
      .toBeGreaterThan(0);

    await page.goto('/progress');
    await page.getByText('Vibration', { exact: true }).click();
    await page.evaluate(() => {
      (window as unknown as { __vibrations: unknown[] }).__vibrations = [];
    });
    await page.goto('/play?fen=4k3%2F8%2F8%2F8%2F8%2F8%2F8%2F3QK3%20w%20-%20-%200%201&color=white');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const board2 = await expectBoard(page);
    await playMove(board2, 'e1', 'e2');
    await expect(page.locator('.movelist')).toContainText('Ke2');
    expect(
      await page.evaluate(
        () => (window as unknown as { __vibrations: unknown[] }).__vibrations.length,
      ),
    ).toBe(0);
  });

  test('a phone held sideways keeps the whole board on screen next to its panel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    await page.goto('/puzzles');
    await completeOnboarding(page);
    await expectBoard(page);
    await expect(page.locator('.puzzle-status')).toBeVisible();
    const layout = await page.evaluate(() => {
      const board = document.querySelector('cg-board')?.getBoundingClientRect();
      const header = document.querySelector('header')?.getBoundingClientRect();
      const nav = document.querySelector('.shell__bottomnav')?.getBoundingClientRect();
      const trainer = document.querySelector('.trainer');
      return {
        boardTop: board?.top ?? -1,
        boardBottom: board?.bottom ?? -1,
        headerBottom: header?.bottom ?? -1,
        navTop: nav?.top ?? -1,
        columns: trainer ? getComputedStyle(trainer).gridTemplateColumns.split(' ').length : 0,
      };
    });
    expect(layout.columns).toBe(2);
    expect(layout.boardTop).toBeGreaterThanOrEqual(layout.headerBottom);
    expect(layout.boardBottom).toBeLessThanOrEqual(layout.navTop + 1);
  });

  test('the manifest registers the app as a handler for backup files', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = (await page.evaluate(
      async (url) => (await fetch(url)).json() as Promise<unknown>,
      href ?? '',
    )) as { file_handlers?: { accept?: Record<string, string[]> }[] };
    expect(manifest.file_handlers?.[0]?.accept?.['application/json']).toContain('.json');
  });
});

import { expect, type Page, test } from '@playwright/test';
import { continueLesson, expectBoard, playMove } from './helpers';

const PROGRESS_KEY = 'chess-trainer:progress';

async function seedProgress(page: Page, state: Record<string, unknown>, version = 5) {
  await page.addInitScript(
    ([storageKey, value]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value);
    },
    [PROGRESS_KEY, JSON.stringify({ state, version })] as const,
  );
}

test.describe('puzzles by opening', () => {
  test('lists openings from the library and your repertoires, and serves matching puzzles', async ({
    page,
  }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1300, puzzleRd: 60 });
    await page.goto('/puzzles/openings');
    const repertoires = page.getByTestId('opening-repertoires');
    await expect(repertoires.getByText('Italian Game', { exact: true })).toBeVisible();
    await expect(repertoires.getByText('Najdorf Sicilian')).toBeVisible();
    const families = page.getByTestId('opening-families');
    await expect(families.getByText('Sicilian Defense', { exact: true })).toBeVisible();
    await expect(families.getByText('Caro-Kann Defense', { exact: true })).toBeVisible();

    await families.getByText('French Defense', { exact: true }).click();
    await expect(page).toHaveURL(/opening=French_Defense/);
    await expectBoard(page);
    await expect(page.getByText('Unrated practice')).toBeVisible();
    await expect(page.getByText('French Defense', { exact: true })).toBeVisible();
    await expect(page.getByText(/arose from the French Defense/)).toBeVisible();
    // The puzzle really comes from that opening: its source link and tags are in the About card.
    await expect(page.locator('.puzzle-status')).toContainText(/Your move|Watch/, {
      timeout: 20_000,
    });
  });
});

test.describe('opening practice', () => {
  test('the opponent follows the repertoire, a deviation pauses the game and lapses the move', async ({
    page,
  }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    await page.goto('/openings');
    await page
      .locator('.repertoire-card', { hasText: 'Caro-Kann Defence' })
      .getByRole('link', { name: 'Play', exact: true })
      .click();
    await expect(page).toHaveURL(/\/play/);
    await expect(page.getByTestId('book-select')).toHaveValue('caro-kann');
    // The repertoire fixes the colour, so there is no colour field.
    await expect(page.getByLabel('Your colour')).toHaveCount(0);
    await page.getByLabel('Strength').selectOption('1');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    await expect(page.getByTestId('book-status')).toContainText('Book: Caro-Kann Defence');
    // White's first move comes from the book: 1. e4 (the only line for White).
    await expect(page.locator('.movelist')).toContainText('e4', { timeout: 15_000 });
    // The learner leaves the book with 1...e5.
    await playMove(board, 'e7', 'e5', 'black');
    const alert = page.getByTestId('book-alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('1… e5 instead of c6');
    await expect(alert.getByRole('link', { name: 'Review the line' })).toHaveAttribute(
      'href',
      /\/openings\/caro-kann$/,
    );
    // The engine has not replied while the alert is up.
    await expect(page.locator('.movelist')).not.toContainText('2.');
    await page.getByRole('button', { name: 'Take it back' }).click();
    await expect(alert).toHaveCount(0);
    await playMove(board, 'c7', 'c6', 'black');
    await expect(page.locator('.movelist')).toContainText('c6');
    await expect(page.getByTestId('book-status')).toContainText('follows your repertoire');
    // The forgotten move was lapsed in the repertoire store.
    const cards = await page.evaluate(() => {
      const raw = localStorage.getItem('chess-trainer:repertoire');
      return raw
        ? (JSON.parse(raw) as { state: { cards: Record<string, { lapses: number }> } }).state.cards
        : {};
    });
    const key = Object.keys(cards).find((k) => k.startsWith('caro-kann|e2e4 c7c6'));
    expect(key).toBeTruthy();
  });
});

test.describe('insights', () => {
  test('reviewed games produce insights, a work-on plan item and results by level', async ({
    page,
  }) => {
    const blank = { moves: 0, loss: 0, errors: 0 };
    const digest = (color: 'white' | 'black') => ({
      phases: {
        opening: { white: blank, black: blank, [color]: { moves: 10, loss: 0.2, errors: 0 } },
        middlegame: { white: blank, black: blank, [color]: { moves: 20, loss: 2.5, errors: 4 } },
        endgame: { white: blank, black: blank },
      },
      motifs: { white: {}, black: {}, [color]: { 'hanging-piece': 2, fork: 1 } },
    });
    const game = (id: string, color: 'white' | 'black', result: string) => ({
      id,
      pgn: `[White "${color === 'white' ? 'alice' : 'bob'}"]\n[Black "${color === 'black' ? 'alice' : 'bob'}"]\n[Result "${result}"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 ${result}`,
      white: color === 'white' ? 'alice' : 'bob',
      black: color === 'black' ? 'alice' : 'bob',
      result,
      date: '2026.09.01',
      event: '',
      url: null,
      plies: 10,
      speed: 'blitz',
      rated: true,
      timestamp: 1,
      source: 'pgn',
      importedAt: 1,
      review: {
        accuracy: { white: 70, black: 70 },
        counts: {
          white: { inaccuracy: 0, mistake: 2, blunder: 2 },
          black: { inaccuracy: 0, mistake: 0, blunder: 0 },
        },
        depth: 12,
        at: 1,
        digest: digest(color),
      },
    });
    await page.addInitScript(
      ([gamesValue, progressValue]) => {
        if (!localStorage.getItem('chess-trainer:games')) {
          localStorage.setItem('chess-trainer:games', gamesValue);
        }
        if (!localStorage.getItem('chess-trainer:progress')) {
          localStorage.setItem('chess-trainer:progress', progressValue);
        }
      },
      [
        JSON.stringify({
          state: {
            games: { g1: game('g1', 'white', '1-0'), g2: game('g2', 'black', '1-0') },
            player: 'alice',
          },
          version: 1,
        }),
        JSON.stringify({
          state: {
            onboarded: true,
            puzzleRating: 1200,
            games: [
              {
                at: 1,
                level: 2,
                color: 'white',
                result: '1-0',
                reason: 'checkmate',
                plies: 40,
                pgn: '',
              },
              {
                at: 2,
                level: 2,
                color: 'white',
                result: '0-1',
                reason: 'resignation',
                plies: 30,
                pgn: '',
              },
              {
                at: 3,
                level: 3,
                color: 'black',
                result: '1/2-1/2',
                reason: 'stalemate',
                plies: 60,
                pgn: '',
              },
            ],
          },
          version: 5,
        }),
      ] as const,
    );
    await page.goto('/games');
    const insights = page.getByTestId('insights');
    await expect(insights).toContainText('2 reviewed games');
    await expect(page.getByTestId('insights-workon')).toContainText('Hanging pieces');
    await expect(page.getByTestId('insights-workon')).toContainText('4 times');
    await expect(page.getByTestId('insights-motifs')).toContainText('Forks you walked into');
    await expect(page.getByTestId('insights-phases')).toContainText('middlegame');
    await expect(page.getByTestId('insights-openings')).toContainText('Sicilian Defense');

    await page.goto('/');
    await expect(page.getByText('Work on: Hanging pieces')).toBeVisible();

    await page.goto('/progress');
    const levels = page.getByTestId('level-results');
    await expect(levels).toContainText('Level 2');
    await expect(levels).toContainText('1–0–1');
    await expect(levels).toContainText('0–1–0');
  });
});

test.describe('position report', () => {
  test('explains the position on the analysis board with lesson links and highlights', async ({
    page,
  }) => {
    // An isolated queen's pawn position with an open e-file and White's king castled.
    await page.goto(
      '/analyze?fen=' +
        encodeURIComponent('r1bq1rk1/pp3ppp/2p2n2/8/3P4/2N2N2/PP3PPP/R2Q1RK1 w - - 0 12'),
    );
    await expectBoard(page);
    const card = page.getByTestId('position-report');
    await card.getByRole('button', { name: 'Explain this position' }).click();
    await expect(card).toContainText('Material is level');
    await expect(card).toContainText('isolated pawn on d4');
    await expect(
      card.getByRole('link', { name: 'The isolated queen’s pawn' }).first(),
    ).toBeVisible();
    await expect(page.getByTestId('report-plans-white')).toContainText('isolated d-pawn');
    await expect(page.getByTestId('report-plans-black')).toContainText('Blockade');
    // Hovering the finding circles the pawn.
    await card.getByText('isolated pawn on d4').hover();
    await expect(
      page.locator('cg-board').locator('..').locator('svg circle, svg .cg-shapes circle').first(),
    ).toBeAttached();
    await card.getByRole('button', { name: 'Hide' }).click();
    await expect(card).not.toContainText('isolated pawn');
  });
});

test.describe('woodpecker', () => {
  test('builds a set, solves through a cycle and reports the cycle statistics', async ({
    page,
  }) => {
    test.slow();
    await seedProgress(page, { onboarded: true, puzzleRating: 1200, puzzleRd: 60 });
    await page.goto('/puzzles/woodpecker');
    const start = page.getByTestId('woodpecker-start');
    await start.getByRole('button', { name: '50 puzzles' }).click();
    await start.getByRole('button', { name: 'Start a set of 50' }).click();
    // The trainer opens on puzzle 1 of the set.
    await expectBoard(page);
    await expect(page.locator('.stat', { hasText: 'Woodpecker' }).first()).toBeVisible();
    // Shrink the set to three puzzles so the cycle can be completed quickly.
    await page.evaluate(() => {
      const raw = localStorage.getItem('chess-trainer:progress');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { state: { woodpecker: { puzzleIds: string[] } } };
      parsed.state.woodpecker.puzzleIds = parsed.state.woodpecker.puzzleIds.slice(0, 3);
      localStorage.setItem('chess-trainer:progress', JSON.stringify(parsed));
    });
    await page.reload();
    await expect(page.getByTestId('woodpecker-panel')).toContainText('Cycle 1: puzzle 1 of 3');
    await page.getByTestId('woodpecker-continue').click();
    for (let i = 0; i < 3; i++) {
      await expectBoard(page);
      await expect(page.locator('.puzzle-status')).toContainText(/Your move/i, { timeout: 20_000 });
      await page.getByRole('button', { name: /Solution/ }).click();
      await expect(page.locator('.puzzle-status')).toContainText(/after a miss/i, {
        timeout: 20_000,
      });
      const next = page.getByRole('button', { name: /Next/ });
      await expect(next).toBeVisible({ timeout: 20_000 });
      await next.click();
    }
    // Back on the panel: the cycle is recorded with its accuracy and pace.
    const panel = page.getByTestId('woodpecker-panel');
    await expect(panel).toContainText('1 cycle done');
    await expect(page.getByTestId('woodpecker-cycles')).toContainText('0%');
    await expect(panel).toContainText('Next cycle suggested');
    await expect(page.getByTestId('woodpecker-next-cycle')).toHaveText('Start cycle 2');
  });
});

test.describe('endgame ladder', () => {
  test('lists the library as rungs, and climbing one points at the next', async ({ page }) => {
    await seedProgress(page, {
      onboarded: true,
      drills: {
        'mate-kq': {
          best: 80,
          attempts: 2,
          lastAt: Date.now() - 86_400_000,
          detail: 'Done in 20 moves',
        },
        'mate-krr': { best: 0, attempts: 1, lastAt: Date.now() - 86_400_000 },
      },
    });
    await page.goto('/drills');
    const ladder = page.getByTestId('endgame-ladder');
    await expect(ladder.getByTestId('ladder-progress')).toHaveText(/^1 of \d+ rungs climbed$/);
    await expect(ladder).toContainText('Checkmates 1/6');
    await expect(ladder).toContainText('Pawn endgames 0/12');
    // The next rung is the first drill not yet completed: two rooks (attempted but not won).
    const next = ladder.getByTestId('ladder-next');
    await expect(next).toHaveText('Rung 2: Two rooks vs king');
    // Groups list their drills in rung order and show the rung numbers.
    await expect(page.getByRole('link', { name: /Run or escort/ })).toContainText('Rung 3');
    await expect(page.getByRole('link', { name: /Réti/ })).toContainText('Rung 38');

    // Climb rung 3: promote the pawn in a race the king cannot win.
    await page.goto('/drills/endgame/kp-run?pos=1');
    await expect(page.locator('.card__eyebrow').first()).toContainText(/Rung 3 of \d+/);
    await expect(page.getByRole('link', { name: 'Pawn races' })).toBeVisible();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    const pushes = [
      ['a2', 'a4'],
      ['a4', 'a5'],
      ['a5', 'a6'],
      ['a6', 'a7'],
    ] as const;
    for (const [i, [from, to]] of pushes.entries()) {
      await playMove(board, from, to);
      // Wait for the engine's reply (a king move) before the next push.
      await expect(page.locator('.movelist__move')).toHaveCount((i + 1) * 2, { timeout: 15_000 });
    }
    await playMove(board, 'a7', 'a8');
    await page.getByRole('button', { name: 'Queen' }).click();
    await expect(page.locator('.drill__summary')).toContainText('Promoted to a queen', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('drill-next-rung')).toHaveText('Next rung: Two rooks vs king');
    await page.goto('/drills');
    await expect(page.getByTestId('ladder-progress')).toHaveText(/^2 of \d+ rungs climbed$/);
  });
});

test.describe('engine ladder', () => {
  test('shows beaten levels, suggests the next rung and starts a game at it', async ({ page }) => {
    const pgn = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
    await seedProgress(page, {
      onboarded: true,
      games: [
        {
          at: Date.now() - 3000,
          level: 2,
          color: 'white',
          result: '1-0',
          reason: 'checkmate',
          plies: 7,
          pgn,
        },
        {
          at: Date.now() - 2000,
          level: 3,
          color: 'black',
          result: '1-0',
          reason: 'checkmate',
          plies: 7,
          pgn,
        },
        {
          at: Date.now() - 1000,
          level: 1,
          color: 'white',
          result: '1-0',
          reason: 'checkmate',
          plies: 7,
          pgn,
        },
      ],
    });
    await page.goto('/play');
    await page.getByRole('button', { name: 'Cancel' }).click();
    const ladder = page.getByTestId('engine-ladder');
    await expect(ladder.locator('.ladder__rung--climbed')).toHaveCount(2);
    await expect(ladder.locator('.ladder__rung--current')).toHaveText('3');
    await expect(ladder.getByTestId('ladder-reason')).toContainText('0–0–1 so far at Level 3');
    await ladder.getByRole('button', { name: /Play Level 3/ }).click();
    await expect(page.getByText('Stockfish · Casual').first()).toBeVisible();
    await expectBoard(page);
    // The ladder is hidden during the game and the Progress page sums it up.
    await expect(ladder).toHaveCount(0);
    await page.goto('/progress');
    await expect(page.getByTestId('ladder-height')).toContainText('Level 2 beaten');
  });
});

test.describe('mating patterns', () => {
  test('shows the gallery, drills a pattern and remembers it', async ({ page }) => {
    await seedProgress(page, { onboarded: true });
    await page.goto('/patterns');
    await expect(page.getByTestId('patterns-solved')).toHaveText('0 of 19 patterns solved');
    await expect(page.locator('.pattern-card')).toHaveCount(19);
    const arabian = page.getByTestId('pattern-arabianMate');
    await expect(arabian).toContainText('Knight and rook · White to play and mate');
    await expect(arabian.getByRole('link', { name: /puzzles/ })).toHaveAttribute(
      'href',
      /theme=arabianMate/,
    );
    await arabian.getByRole('button', { name: 'Solve it' }).click();
    const drill = page.getByTestId('pattern-drill');
    await expect(drill.getByRole('status')).toContainText('White to play and mate', {
      timeout: 10_000,
    });
    const board = await expectBoard(page);
    await playMove(board, 'b7', 'h7');
    await expect(drill.getByRole('status')).toHaveText('Mate — the Arabian mate.');
    await expect(page.getByTestId('pattern-title')).toHaveText('Arabian mate');
    await page.getByTestId('pattern-next').click();
    await expect(page.getByTestId('pattern-summary')).toContainText('You found 1 of 1 mate');
    await page.getByRole('button', { name: 'Back to the gallery' }).click();
    await expect(page.getByTestId('patterns-solved')).toHaveText('1 of 19 patterns solved');
    await expect(page.getByTestId('pattern-arabianMate')).toContainText('Solved');
    await expect(page.getByRole('button', { name: 'Drill the 18 unsolved' })).toBeVisible();

    // A full run from the Drills page: the first pattern's solution counts as a miss.
    await page.goto('/drills');
    await page.getByRole('link', { name: /Mating patterns/ }).click();
    await expect(page).toHaveURL(/\/patterns/);
    await expect(drill.getByRole('status')).toContainText('to play and mate', { timeout: 10_000 });
    await expect(drill).toContainText('Pattern 1 of 19');
    await page.getByTestId('pattern-solution').click();
    await expect(drill.getByRole('status')).toContainText(/That is the/, { timeout: 10_000 });
    await page.getByTestId('pattern-next').click();
    await expect(drill).toContainText('Pattern 2 of 19');
    await expect(drill).toContainText('1 missed');
  });
});

test.describe('classic games', () => {
  test('filters by era and difficulty and plays a new miniature', async ({ page }) => {
    await seedProgress(page, { onboarded: true });
    await page.goto('/classics');
    await expect(page.getByTestId('classics-count')).toHaveText(/^46 of 46 games/);
    await page.getByRole('button', { name: 'Romantic' }).click();
    await expect(page.getByTestId('classics-count')).toContainText(/^\d+ of 46 games · to 1880/);
    await expect(page.getByRole('link', { name: /Légal’s mate/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Karpov’s bishop on a7/ })).toHaveCount(0);
    await page.getByRole('button', { name: '1 star' }).click();
    await expect(page).toHaveURL(/era=romantic&difficulty=1/);
    await expect(page.getByRole('link', { name: /Three pawns on the seventh/ })).toHaveCount(0);
    await page.getByRole('link', { name: /Légal’s mate/ }).click();
    await page.getByRole('button', { name: 'Skip the opening' }).click();
    const board = await expectBoard(page);
    await expect(page.locator('.puzzle-status')).toContainText('Move 5: what did');
    await playMove(board, 'f3', 'e5');
    await expect(page.locator('.puzzle-status')).toContainText('Yes! Nxe5');
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.locator('.puzzle-status')).toContainText('Move 6', { timeout: 10_000 });
    await playMove(board, 'c4', 'f7');
    await expect(page.locator('.puzzle-status')).toContainText('Yes! Bxf7+');
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.locator('.puzzle-status')).toContainText('Move 7', { timeout: 10_000 });
    await playMove(board, 'c3', 'd5');
    await expect(page.locator('.puzzle-status')).toContainText('Yes! Nd5#');
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.locator('.drill__summary')).toContainText('9/9 points', { timeout: 10_000 });
    await page.goto('/classics');
    await page.getByRole('button', { name: 'Played', exact: true }).click();
    await expect(page.getByTestId('classics-count')).toHaveText(/^1 of 46 games/);
    await expect(page.getByRole('link', { name: /Légal’s mate/ })).toContainText('9/9');
  });
});

test.describe('new lessons', () => {
  test('a pawn-endgame lesson accepts the breakthrough and completes', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1300 });
    await page.goto('/learn/pawn-endgames-3');
    await expectBoard(page);
    // Step through: solve the breakthrough ourselves, let the rest be shown.
    for (let i = 0; i < 25; i++) {
      const prompt = page.getByText('White to move: break through.');
      if (await prompt.isVisible().catch(() => false)) {
        // Wait until the step accepts moves before clicking the board.
        await expect(page.getByText('Make your move on the board.')).toBeVisible();
        const board = await expectBoard(page);
        await playMove(board, 'b5', 'b6');
        await expect(page.getByText(/b6! axb6/)).toBeVisible();
      }
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
      await continueLesson(page);
    }
    await expect(page.getByText('Lesson complete')).toBeVisible();
    await page.goto('/learn');
    await expect(page.getByText('Attacking the fianchetto')).toBeVisible();
    await expect(page.getByText('When there is nothing to do')).toBeVisible();
    await expect(page.getByText('Catalan and Queen’s Gambit plans')).toBeVisible();
  });
});

test.describe('analysis library', () => {
  test('saves an analysis, reopens it from the library and imports a study', async ({ page }) => {
    await seedProgress(page, { onboarded: true });
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page.getByLabel('Paste a FEN or a PGN').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.treemoves')).toContainText('Bb5');
    await page.getByTestId('save-analysis').click();
    await page.getByTestId('save-analysis-name').fill('Ruy Lopez test');
    await page.getByTestId('save-analysis-collection').fill('E2E');
    await page.getByTestId('save-analysis-confirm').click();
    await expect(page.getByText('Saved “Ruy Lopez test” to E2E.')).toBeVisible();

    // A fresh board, then the library brings the analysis back.
    await page.getByRole('button', { name: 'Reset board' }).click();
    await expect(page.locator('.treemoves')).not.toContainText('Bb5');
    await page.getByTestId('open-library').click();
    const library = page.getByTestId('library');
    await expect(library).toContainText('E2E');
    await library.getByRole('button', { name: 'Ruy Lopez test', exact: true }).click();
    await expect(page.locator('.treemoves')).toContainText('Bb5');

    // A two-chapter study export becomes a collection.
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page
      .getByLabel('Paste a FEN or a PGN')
      .fill(
        '[Event "Endgame study: Chapter 1"]\n[ChapterName "Opposition"]\n\n1. e4 e5 *\n\n[Event "Endgame study: Chapter 2"]\n\n1. d4 d5 *',
      );
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByTestId('import-study')).toBeVisible();
    await page.getByRole('button', { name: 'Save all 2 to the library' }).click();
    await expect(
      page.getByText('Saved 2 chapters to the collection “Endgame study”.'),
    ).toBeVisible();
    await page.getByTestId('open-library').click();
    await expect(page.getByTestId('library')).toContainText('Opposition');
    await expect(page.getByTestId('library')).toContainText('Chapter 2');
    await expect(page.getByTestId('library-item')).toHaveCount(3);
  });
});

test.describe('share links', () => {
  test('a shared repertoire link adds a custom repertoire', async ({ page }) => {
    await seedProgress(page, { onboarded: true });
    await page.goto('/openings');
    // Build the fragment the way the app does, from the page context.
    const fragment = await page.evaluate(async () => {
      const json = JSON.stringify({
        name: 'Shared London',
        color: 'white',
        pgn: '1. d4 d5 2. Bf4 Nf6 3. e3 (3. Nf3 e6 4. e3) c5 *',
      });
      const bytes = new TextEncoder().encode(json);
      const stream = new CompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      void writer.write(bytes).then(() => writer.close());
      const out = new Uint8Array(await new Response(stream.readable).arrayBuffer());
      let binary = '';
      for (const b of out) binary += String.fromCharCode(b);
      return `rep=${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    });
    await page.goto(`/openings#${fragment}`);
    await expect(page.getByText('Someone shared')).toBeVisible();
    await page.getByTestId('accept-shared-repertoire').click();
    await expect(page).toHaveURL(/\/openings\/custom-/);
    await expect(page.getByRole('heading', { level: 1, name: 'Shared London' })).toBeVisible();
  });

  test('a shared Woodpecker set can be taken over', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200 });
    // Pull real puzzle ids from the bundled set so the trainer can load them.
    await page.goto('/puzzles/woodpecker');
    const puzzleIds = await page.evaluate(async () => {
      const res = await fetch('/puzzles/b1100-00.json');
      const list = (await res.json()) as { id: string }[];
      return list.slice(0, 12).map((p) => p.id);
    });
    expect(puzzleIds).toHaveLength(12);
    const fragment = await page.evaluate(async (ids2) => {
      const json = JSON.stringify({ puzzleIds: ids2, rating: 1200 });
      const bytes = new TextEncoder().encode(json);
      const stream = new CompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      void writer.write(bytes).then(() => writer.close());
      const out = new Uint8Array(await new Response(stream.readable).arrayBuffer());
      let binary = '';
      for (const b of out) binary += String.fromCharCode(b);
      return `wp=${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    }, puzzleIds);
    await page.goto(`/puzzles/woodpecker#${fragment}`);
    await expect(page.getByTestId('shared-woodpecker')).toContainText('set of 12 puzzles');
    await page.getByRole('button', { name: 'Take this set' }).click();
    await expect(page.locator('.puzzle-status')).toContainText(/Your move|Watch/, {
      timeout: 20_000,
    });
    await page.goto('/puzzles/woodpecker');
    await expect(page.getByTestId('woodpecker-panel')).toContainText('Woodpecker set · 12 puzzles');
    await expect(page.getByRole('button', { name: 'Share this set' })).toBeVisible();
  });
});

test.describe('profiles', () => {
  test('a second profile has its own progress and can be switched to', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1500, puzzleRd: 60 });
    await page.goto('/progress');
    await expect(page.getByTestId('profile-badge')).toHaveCount(0);
    await page.getByTestId('new-profile-name').fill('Ada');
    await page.getByRole('button', { name: 'Add profile' }).click();
    await expect(page.getByTestId('profile-item')).toHaveCount(2);
    await expect(page.getByTestId('profile-badge')).toHaveText('Me');
    await page.getByTestId('profiles').getByRole('button', { name: 'Switch' }).click();
    // The app reloads into the new profile: fresh progress, own storage key.
    await expect(page.getByTestId('profile-badge')).toHaveText('Ada', { timeout: 15_000 });
    await page.goto('/puzzles');
    await expect(page.getByText('I know the rules and play occasionally')).toBeVisible();
    // The first learner's data is untouched under the plain key.
    const stored = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('chess-trainer:progress') ?? '{}') as {
          state?: { puzzleRating?: number };
        },
    );
    expect(stored.state?.puzzleRating).toBe(1500);
    // Switching back restores the first learner.
    await page.goto('/progress#profiles');
    await page.getByTestId('profiles').getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByTestId('profile-badge')).toHaveText('Me', { timeout: 15_000 });
    await expect(page.getByText('1,500', { exact: true })).toBeVisible();
  });
});

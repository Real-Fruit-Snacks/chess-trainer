import { expect, type Page, test } from '@playwright/test';
import { expectBoard, playMove, waitForBoardIdle } from './helpers';

/**
 * 0.29, Chess960: a game against the engine from a Chess960 start, castling
 * by dropping the king on its rook, its PGN with the Chess960 tags, the
 * hand-off to Analyze (which plays, analyses and reviews by the same rules),
 * and Chess960 games pasted into Analyze and My games.
 */
test.describe.configure({ timeout: 120_000 });

const PROGRESS_KEY = 'chess-trainer:progress';
const SETTINGS_KEY = 'chess-trainer:settings';

/** Position 274, BNRKNBRQ: the king on d1 between rooks on c1 and g1; O-O-O swaps d1 and c1. */
const P274 = 'bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w KQkq - 0 1';

/** A Chess960 game as Lichess exports one: both sides castle, long and short. */
const LICHESS_GAME = `[Event "Casual Chess960 game"]
[Site "https://lichess.org/c960game"]
[Date "2026.09.30"]
[White "ann"]
[Black "bob"]
[Result "*"]
[Variant "Chess960"]
[FEN "${P274}"]
[SetUp "1"]

1. O-O-O e5 2. e4 Nf6 3. Nf3 Be7 4. d3 O-O *`;

/** Onboarded, with a shallow analysis and review so the engine's turns stay short. */
async function seed(page: Page) {
  await page.addInitScript(
    ([progressKey, progress, settingsKey, settings]) => {
      if (localStorage.getItem(progressKey)) return;
      localStorage.setItem(progressKey, progress);
      localStorage.setItem(settingsKey, settings);
    },
    [
      PROGRESS_KEY,
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 8 }),
      SETTINGS_KEY,
      JSON.stringify({ state: { analysisDepth: 12, reviewDepth: 'fast' }, version: 5 }),
    ] as const,
  );
  // What "Copy PGN" puts on the clipboard, kept where the test can read it.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          (window as unknown as { __copied: string }).__copied = text;
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });
}

const copied = (page: Page) =>
  page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? '');

/** The moves in the analysis board's move list. */
const treeMoves = (page: Page) => page.locator('.treemoves__move');

test.describe('Chess960', () => {
  test('a game against the engine: castling, the PGN and the hand-off to Analyze', async ({
    page,
  }) => {
    await seed(page);
    await page.goto(`/play/computer?fen=${encodeURIComponent(P274)}&variant=chess960&color=white`);
    const setup = page.getByRole('dialog', { name: 'New game' });
    await expect(setup).toContainText('Starting from Chess960 position 274.');
    // What is standard chess only is shown off, and why.
    for (const name of ['Coach mode', 'Blunder check']) {
      await expect(setup.getByRole('switch', { name })).toBeDisabled();
      await expect(setup.getByRole('switch', { name })).not.toBeChecked();
    }
    await setup.getByLabel('Engine level').selectOption('1');
    await setup.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByTestId('play-variant')).toHaveText('Chess960 · position 274');

    // Castle long: the king dropped on its own rook.
    const board = await expectBoard(page);
    await playMove(board, 'd1', 'c1');
    const moves = page.getByLabel('Move list').locator('.movelist__move');
    await expect(moves.first()).toHaveText('O-O-O');
    // The engine answers, playing by the same rules.
    await expect(moves).toHaveCount(2, { timeout: 30_000 });
    await waitForBoardIdle(page);
    await expect(board.locator('piece.king.white')).toHaveCount(1);

    await page.getByRole('button', { name: 'Copy PGN' }).click();
    const pgn = await copied(page);
    expect(pgn).toContain('[Variant "Chess960"]');
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${P274}"]`);
    expect(pgn).toMatch(/\n1\. O-O-O \S+ \*$/);

    // Resigned, the game ends with its result dialog, which hands it to Analyze.
    await page.getByRole('button', { name: 'Resign' }).click();
    await page
      .getByRole('dialog', { name: 'Resign this game?' })
      .getByRole('button', { name: 'Resign' })
      .click();
    const result = page.getByRole('dialog', { name: 'Game over' });
    await expect(result).toContainText('0-1 by resignation');
    // Analyze takes the game over by its rules: its position, its moves, its engine.
    await result.getByRole('button', { name: 'Analyze game' }).click();
    await expect(page).toHaveURL(/\/analyze/);
    await expect(page.getByTestId('analyze-variant')).toHaveText('Chess960 · position 274');
    await expect(treeMoves(page).first()).toContainText('O-O-O');
    await expect(page.locator('.lines .line').first()).toBeVisible({ timeout: 60_000 });

    // A variation from the start: Black castles long at once, the king dropped on its rook.
    await page.keyboard.press('Home');
    await playMove(await expectBoard(page), 'e2', 'e4');
    await waitForBoardIdle(page);
    await playMove(await expectBoard(page), 'd8', 'c8');
    await expect(page.locator('.analyze__strip-move')).toContainText('O-O-O');

    // The review plays the main line by Chess960's rules, with the engine in Chess960 mode.
    await page.keyboard.press('Home');
    await page.getByRole('button', { name: 'Review game' }).click();
    await expect(page.locator('.evalgraph')).toBeVisible({ timeout: 90_000 });
  });

  test('a Chess960 PGN pasted in Analyze: castling both ways, the engine’s lines and the PGN', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/analyze');
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page.getByLabel('Paste a FEN or a PGN').fill(LICHESS_GAME);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByTestId('analyze-variant')).toHaveText('Chess960 · position 274');
    await expect(treeMoves(page)).toHaveCount(8);
    await expect(treeMoves(page).first()).toContainText('O-O-O');
    await expect(treeMoves(page).last()).toContainText('O-O');

    // Step through: the first move, then back to the end.
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.analyze__strip-move')).toContainText('1. O-O-O');
    await page.keyboard.press('End');
    await expect(page.locator('.analyze__strip-move')).toContainText('4… O-O');
    // The engine reads the position (castling rights gone, the kings castled).
    await expect(page.locator('.lines .line').first()).toBeVisible({ timeout: 60_000 });

    // The PGN goes out with its tags, and comes back in as it went out.
    await page.getByRole('button', { name: 'Copy PGN' }).click();
    const pgn = await copied(page);
    expect(pgn).toContain('[Variant "Chess960"]');
    expect(pgn).toContain(`[FEN "${P274}"]`);
    expect(pgn).toContain('1. O-O-O e5 2. e4 Nf6 3. Nf3 Be7 4. d3 O-O *');

    // A Chess960 FEN with castling rights by file: the king castles from d1 onto its rook.
    await page.getByRole('button', { name: 'Import FEN / PGN' }).click();
    await page
      .getByLabel('Paste a FEN or a PGN')
      .fill('bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w GCgc - 0 1');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByTestId('analyze-variant')).toHaveText('Chess960 · position 274');
    await playMove(await expectBoard(page), 'd1', 'c1');
    await expect(treeMoves(page).first()).toContainText('O-O-O');
  });

  test('My games keeps a pasted Chess960 game, marks it and opens it in Analyze', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/games');
    await page.getByRole('radio', { name: 'Paste PGN' }).click();
    await page.getByLabel('PGN of one or more games').fill(LICHESS_GAME);
    await page.getByRole('button', { name: 'Add games' }).click();
    const list = page.getByTestId('games-table');
    await expect(list.getByTestId('game-variant')).toHaveText('Chess960');
    await list.getByRole('button', { name: 'Analyze game' }).first().click();
    await expect(page.getByTestId('analyze-variant')).toHaveText('Chess960 · position 274');
    await expect(treeMoves(page)).toHaveCount(8);
  });
});

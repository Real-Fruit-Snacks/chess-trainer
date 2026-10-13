import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { clickSquare, expectBoard, playMove, waitForBoardIdle } from './helpers';
import { type LiveRelay, livePlayer, startLiveRelay } from './live';

/**
 * 0.29: analyse together. A shared analysis board for up to eight, through the
 * relay's own rules (e2e/live.ts): two players finish a live game and both
 * open its analysis room from the end of the game; one plays a variation the
 * other sees, one browses alone and comes back, arrows drawn on one board show
 * on the other. And a room made from Analyze, joined by a second browser from
 * its link.
 *
 * Service workers are blocked: they would answer requests the routes must see.
 */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 150_000 });

const GAME_URL = /\/play\/online\/[A-Za-z0-9_-]{22}$/;
const ROOM_URL = /\/analyze\/together\/[A-Za-z0-9_-]{22}$/;
/** The arrows and circles drawn in green (the engine's own arrow is pale blue). */
const GREEN = 'svg.cg-shapes line[stroke="#15781B"]';

let relay: LiveRelay | null = null;
test.afterEach(async () => {
  await relay?.stop();
  relay = null;
});

/** Opens Play and waits for the waiting room to be connected. */
async function openPlay(page: Page) {
  await page.goto('/play');
  await expect(page.getByTestId('live-players')).toBeVisible();
}

/** Two players in a 5+3 game: White posted it, Black joined from the list. */
async function pairedGame(white: Page, black: Page) {
  await openPlay(white);
  await white.getByRole('radio', { name: 'White' }).click();
  await white
    .getByTestId('live-post')
    .getByRole('button', { name: /^5\+3 / })
    .click();
  await expect(white.getByTestId('live-waiting')).toBeVisible();
  await openPlay(black);
  await black.getByRole('button', { name: /^Join Patient Bishop’s 5\+3 game$/ }).click();
  await expect(white).toHaveURL(GAME_URL);
  await expect(black).toHaveURL(GAME_URL);
}

/** Plays `from`-`to` in the live game, seen from `side`, once it is that side's move. */
async function move(page: Page, from: string, to: string, side: 'white' | 'black') {
  const board = await expectBoard(page);
  await expect(page.getByTestId('live-status')).toHaveText('Your move');
  await waitForBoardIdle(page);
  await playMove(board, from, to, side);
}

/** The move the page's move list marks as the position shown. */
const current = (page: Page) =>
  page.getByRole('group', { name: 'Moves' }).locator('[aria-current="true"]');

/** Waits until the page is in the room, connected, with `count` people here. */
async function inRoom(page: Page, count: number) {
  await expect(page).toHaveURL(ROOM_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'Analyse together' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible();
  await expect(
    page.getByTestId('together-members').getByRole('listitem').filter({ hasText: 'Here' }),
  ).toHaveCount(count);
}

/** What axe finds on the page (WCAG 2.1 A and AA), the board left out as in axe.spec.ts. */
async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('cg-board')
    .exclude('.toasts')
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
}

/** Whether the page fits its width, with nothing to scroll sideways. */
const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('analyse together, 0.29', () => {
  test('after a live game: both players in one room, a variation, following and browsing alone, arrows', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const white = await livePlayer(browser, relay, 'Patient Bishop');
    const black = await livePlayer(browser, relay, 'Swift Knight');
    await pairedGame(white, black);
    await move(white, 'e2', 'e4', 'white');
    await move(black, 'e7', 'e5', 'black');
    await move(white, 'g1', 'f3', 'white');
    await expect(black.getByTestId('live-status')).toHaveText('Your move');
    await black.getByRole('button', { name: 'Resign' }).click();
    await black
      .getByRole('dialog', { name: 'Resign this game?' })
      .getByRole('button', { name: 'Resign' })
      .click();

    // White opens the game's analysis room from the end of the game; Black hears of it, and joins.
    await white.getByRole('dialog').getByTestId('analyse-together').click();
    await inRoom(white, 1);
    const room = new URL(white.url()).pathname;
    const blackEnd = black.getByRole('dialog');
    await expect(blackEnd).toContainText('Patient Bishop is analysing the game: join them.');
    await blackEnd.getByRole('button', { name: 'Join the analysis' }).click();
    await inRoom(black, 2);
    expect(new URL(black.url()).pathname).toBe(room);
    await inRoom(white, 2);
    for (const page of [white, black]) {
      await expect(page.getByTestId('together-game')).toHaveText(
        'Patient Bishop v Swift Knight · White won',
      );
      await expect(page.getByRole('group', { name: 'Moves' })).toContainText('Nf3');
    }
    // Each sees the game from their own side.
    await expect(white.locator('.board')).toHaveAttribute('data-orientation', 'white');
    await expect(black.locator('.board')).toHaveAttribute('data-orientation', 'black');
    expect(await axeViolations(black)).toEqual([]);

    // White steps to 1. e4: Black, following, goes there too. White plays 1… c5 there instead.
    await white.keyboard.press('ArrowRight');
    await expect(current(black)).toContainText('e4');
    const whiteBoard = await expectBoard(white);
    await waitForBoardIdle(white);
    await playMove(whiteBoard, 'c7', 'c5', 'white');
    await expect(black.getByTestId('together-news')).toHaveText('Patient Bishop played 1… c5.');
    await expect(current(black)).toContainText('c5');
    await expect(black.getByRole('group', { name: 'Moves' })).toContainText('c5');

    // Black browses alone, back to the start; White plays on, and Black stays where they are.
    await black.getByRole('switch', { name: 'Follow' }).click();
    await expect(black.getByRole('button', { name: 'Back to the shared position' })).toBeVisible();
    await black.getByRole('button', { name: 'Start of game' }).click();
    await expect(current(black)).toHaveCount(0);
    await waitForBoardIdle(white);
    await playMove(whiteBoard, 'g1', 'f3', 'white');
    await expect(black.getByTestId('together-news')).toHaveText('Patient Bishop played 2. Nf3.');
    await expect(current(black)).toHaveCount(0);
    await expect(black.getByTestId('together-follow')).toContainText('Now at 2. Nf3');
    await black.getByRole('button', { name: 'Back to the shared position' }).click();
    await expect(current(black)).toContainText('Nf3');
    await expect(black.getByRole('switch', { name: 'Follow' })).toBeChecked();

    // White draws an arrow on the shared position, by squares: Black's board shows it.
    await white.getByRole('button', { name: 'Draw', exact: true }).click();
    await clickSquare(whiteBoard, 'b8', 'white');
    await clickSquare(whiteBoard, 'c6', 'white');
    await expect(white.getByTestId('together-draw')).toContainText('Drew an arrow from b8 to c6.');
    await expect(black.locator(GREEN)).toHaveCount(1);
    await expect(black.getByTestId('together-news')).toHaveText(
      'Patient Bishop drew on the position after 2. Nf3.',
    );
    await white.getByRole('button', { name: 'Clear drawing' }).click();
    await expect(black.locator(GREEN)).toHaveCount(0);

    // On the smallest phone the room fits, and the bar leads back to it from elsewhere.
    await black.setViewportSize({ width: 320, height: 680 });
    expect(await fitsWidth(black)).toBe(true);
    await black.goto('/puzzles');
    await expect(black.getByTestId('live-bar-room')).toHaveText('You are in an analysis room.');
    await black.getByRole('link', { name: 'Back to the analysis' }).click();
    await inRoom(black, 2);
    await expect(current(black)).toContainText('Nf3');
  });

  test('a room made from Analyze, joined by a friend from its link', async ({ browser }) => {
    relay = startLiveRelay();
    const host = await livePlayer(browser, relay, 'Patient Bishop');
    const friend = await livePlayer(browser, relay, 'Quiet Rook');
    const pgn = '1. d4 d5 2. c4 (2. Nf3 Nf6) 2... e6';
    await host.goto(`/analyze?pgn=${encodeURIComponent(pgn)}`);
    await expect(host.getByRole('group', { name: 'Moves' })).toContainText('e6');
    expect(await axeViolations(host)).toEqual([]);
    await host.getByRole('button', { name: 'Analyse with a friend' }).click();
    const dialog = host.getByRole('dialog', { name: 'Analyse with a friend' });
    await dialog.getByRole('button', { name: 'Make the room' }).click();
    await inRoom(host, 1);
    const link = (await host.getByTestId('together-link').textContent()) ?? '';
    expect(link).toBe(new URL(host.url()).href);
    await expect(host.getByTestId('together-game')).toHaveText('One board for everyone here.');

    await friend.goto(link);
    await inRoom(friend, 2);
    const moves = friend.getByRole('group', { name: 'Moves' });
    await expect(moves).toContainText('c4');
    await expect(moves).toContainText('Nf6');
    expect(await axeViolations(friend)).toEqual([]);

    // The friend plays on from the end of the main line; the host's board follows.
    await friend.keyboard.press('End');
    await expect(current(host)).toContainText('e6');
    const board = await expectBoard(friend);
    await waitForBoardIdle(friend);
    await playMove(board, 'b1', 'c3', 'white');
    await expect(host.getByTestId('together-news')).toHaveText('Quiet Rook played 3. Nc3.');
    await expect(current(host)).toContainText('Nc3');

    // Only the host deletes moves (0.31.2): the friend is told so, the host has the button.
    await expect(friend.getByTestId('together-host-note')).toHaveText(
      'Only the host can delete moves.',
    );
    await expect(friend.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
    await expect(host.getByRole('button', { name: 'Delete from here' })).toBeVisible();
    await expect(host.getByTestId('together-host-note')).toHaveCount(0);

    // The room's tree goes on to the friend's own analysis board.
    await friend.getByTestId('together-open-analyze').click();
    await expect(friend).toHaveURL(/\/analyze$/);
    const copied = friend.getByRole('group', { name: 'Moves' });
    await expect(copied).toContainText('Nc3');
    await expect(copied).toContainText('Nf6');
  });
});

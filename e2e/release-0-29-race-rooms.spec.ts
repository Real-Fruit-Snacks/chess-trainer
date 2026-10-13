import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { Chess } from 'chess.js';
import { RACE_ROOM } from '../relay/src/live/shared.mjs';
import { describeMove } from '../src/components/board/announce';
import { expectBoard, playMove, waitForBoardIdle } from './helpers';
import { type LiveRelay, livePlayer, startLiveRelay } from './live';

/**
 * 0.29: puzzle race rooms for up to eight. Three players in three browser
 * contexts, through the relay's own rules (e2e/live.ts): the host makes a room
 * from Play, the others open its link and join under their names, they race a
 * round by the order of their clean solves and the rest by the clock, see the
 * places, and race again with new puzzles.
 *
 * Service workers are blocked: they would answer requests the routes must see.
 */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 180_000 });

const ROOM_URL = /\/play\/race\/[A-Za-z0-9_-]{22}$/;

let relay: LiveRelay | null = null;
test.afterEach(async () => {
  await relay?.stop();
  relay = null;
});

interface RacePuzzle {
  id: string;
  fen: string;
  moves: string;
}

/** Plays a UCI move on `chess`. */
function playUci(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

/** A puzzle after its first move (the opponent's), and the side that solves it. */
function setUp(puzzle: RacePuzzle): { chess: Chess; side: 'white' | 'black'; moves: string[] } {
  const moves = puzzle.moves.split(' ');
  const chess = new Chess(puzzle.fen);
  playUci(chess, moves[0]);
  return { chess, side: chess.turn() === 'w' ? 'white' : 'black', moves };
}

/** Waits until the race board waits for this player's move. */
async function toMove(page: Page) {
  await expect(page.getByTestId('race-status')).toContainText('to play: find the best line', {
    timeout: 30_000,
  });
  await waitForBoardIdle(page);
}

const PROMOTION_NAMES: Record<string, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };

/** Plays a race puzzle's solution on the page's board, each reply waited for as announced. */
async function solve(page: Page, puzzle: RacePuzzle) {
  const { chess, side, moves } = setUp(puzzle);
  for (let i = 1; i < moves.length; i += 2) {
    await toMove(page);
    const uci = moves[i];
    await playMove(await expectBoard(page), uci.slice(0, 2), uci.slice(2, 4), side);
    if (uci.length > 4) {
      await page
        .getByLabel('Choose a piece to promote to')
        .getByRole('button', { name: PROMOTION_NAMES[uci[4]] })
        .click();
    }
    playUci(chess, uci);
    const reply = moves[i + 1];
    if (!reply) continue;
    const before = chess.fen();
    playUci(chess, reply);
    const words = describeMove(before, chess.fen(), [reply.slice(0, 2), reply.slice(2, 4)]);
    await expect(page.locator('.board__announce')).toHaveText(words!);
  }
}

/** Plays a legal move that is neither the puzzle's answer nor a mate (a mate also solves it). */
async function missPuzzle(page: Page, puzzle: RacePuzzle) {
  const { chess, side, moves } = setUp(puzzle);
  const answer = moves[1].slice(0, 4);
  const wrong = chess.moves({ verbose: true }).find((move) => {
    if (`${move.from}${move.to}` === answer || move.promotion) return false;
    const after = new Chess(chess.fen());
    after.move(move.san);
    return !after.isCheckmate();
  });
  await toMove(page);
  await playMove(await expectBoard(page), wrong!.from, wrong!.to, side);
}

/** The puzzles of race `number`, as the host's device dealt them. */
async function puzzlesOf(number: number): Promise<RacePuzzle[]> {
  interface RaceMessage {
    state?: { race?: { number?: number; items?: RacePuzzle[] } };
  }
  const dealt = () =>
    relay!
      .sent('race')
      .map((m) => (m as RaceMessage).state?.race)
      .find((race) => race?.number === number && race.items);
  await expect.poll(() => dealt() !== undefined).toBe(true);
  return dealt()!.items!;
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

/** The standings' lines, as one page shows them. */
const standings = (page: Page) => page.getByTestId('race-standings').getByRole('listitem');

test('a race room: made from Play, joined by its link, raced by three, and raced again', async ({
  browser,
}) => {
  relay = startLiveRelay();
  const host = await livePlayer(browser, relay, 'Patient Bishop', 1420);
  const second = await livePlayer(browser, relay, 'Swift Knight', 1610);
  const third = await livePlayer(browser, relay, 'Quiet Rook', 1300);

  // The host sets up a puzzle race on Play: a room for up to eight, rather than one opponent.
  await host.goto('/play');
  await expect(host.getByTestId('live-players')).toBeVisible();
  await host.getByRole('button', { name: 'Play Puzzle race' }).click();
  const dialog = host.getByRole('dialog', { name: 'Puzzle race' });
  await dialog.getByRole('radio', { name: 'A room for up to eight' }).click();
  await expect(dialog.getByLabel('Format')).toHaveValue('rounds');
  await dialog.getByRole('button', { name: 'Make the room' }).click();
  await expect(host).toHaveURL(ROOM_URL);
  await expect(host.getByRole('heading', { level: 1, name: 'Puzzle race room' })).toBeVisible();
  const start = host.getByTestId('race-room-start');
  await expect(start).toHaveText('Start with 1 player');
  await expect(start).toBeDisabled();
  const link = (await host.getByTestId('race-room-link').textContent())!;
  expect(link).toBe(new URL(host.url()).href);

  // The others open the link, see who is there, and join under their names. Quiet Rook's
  // phone is a small one.
  await third.setViewportSize({ width: 320, height: 680 });
  for (const [page, name] of [
    [second, 'Swift Knight'],
    [third, 'Quiet Rook'],
  ] as const) {
    await page.goto(link);
    const players = page.getByTestId('race-room-members');
    await expect(players).toContainText('Patient Bishop');
    await expect(players).toContainText(`Join under your name, ${name}`);
    await page.getByRole('button', { name: 'Join the room' }).click();
    await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible();
    await expect(page.getByText('Waiting for Patient Bishop to start the race.')).toBeVisible();
  }
  await expect(host.getByTestId('race-room-members').getByRole('listitem')).toHaveCount(3);
  await expect(start).toHaveText('Start with 3 players');
  expect(await axeViolations(host)).toEqual([]);
  expect(await fitsWidth(third)).toBe(true);

  // The host's device deals five puzzles, the same for everyone.
  await start.click();
  const first = await puzzlesOf(1);
  expect(first).toHaveLength(RACE_ROOM.rounds);
  // The board beside the standings: for everyone, on the smallest phone too.
  await toMove(host);
  expect(await axeViolations(host)).toEqual([]);
  await toMove(third);
  expect(await fitsWidth(third)).toBe(true);

  // Round 1: Swift Knight solves first, then the host; Quiet Rook misses. Once everyone is in,
  // the round is over: 5 points for the fastest, 4 for the next.
  await solve(second, first[0]);
  await expect(second.getByTestId('race-status')).toContainText('Solved in');
  await solve(host, first[0]);
  await missPuzzle(third, first[0]);
  await expect(standings(host)).toHaveText([
    /^1stSwift Knight.*5 points$/,
    /^2ndPatient Bishop \(you\).*4 points$/,
    /^3rdQuiet Rook.*0 points$/,
  ]);

  // The other rounds run to their limit with nobody answering: the relay's clock decides.
  await expect(async () => {
    relay!.advance(10_000);
    await expect(host.getByTestId('race-room-places')).toBeVisible({ timeout: 250 });
  }).toPass({ timeout: 90_000, intervals: [100] });

  // The places, for everyone.
  for (const page of [host, second, third]) {
    await expect(page.getByTestId('race-room-places').getByRole('listitem')).toHaveText([
      /^1stSwift Knight/,
      /^2ndPatient Bishop/,
      /^3rdQuiet Rook/,
    ]);
  }
  await expect(host.getByTestId('race-room-verdict')).toHaveText('You came 2nd with 4 points.');
  expect(await axeViolations(host)).toEqual([]);
  expect(await fitsWidth(third)).toBe(true);
  await expect(third.getByTestId('race-room-verdict')).toHaveText('You came 3rd with 0 points.');
  await expect(second.getByText('Waiting for Patient Bishop to start another race.')).toBeVisible();

  // Race again, with new puzzles. Quiet Rook is elsewhere in the app: the bar leads back.
  await third.goto('/puzzles');
  await expect(third.getByTestId('live-bar-room')).toHaveText('You are in a puzzle race room.');
  await expect(start).toHaveText('Race again');
  await start.click();
  const again = await puzzlesOf(2);
  expect(again.map((p) => p.id).filter((id) => first.some((p) => p.id === id))).toEqual([]);
  await expect(third.getByTestId('live-bar-room')).toHaveText(
    'A race is on in your puzzle race room.',
  );
  await third.getByRole('link', { name: 'Back to the race' }).click();
  await expect(third).toHaveURL(ROOM_URL);
  expect(await fitsWidth(third)).toBe(true);
  await solve(third, again[0]);
  await expect(third.getByTestId('race-status')).toContainText('Solved in');
  await expect(standings(host).filter({ hasText: 'Quiet Rook' })).toContainText('Solved in');
});

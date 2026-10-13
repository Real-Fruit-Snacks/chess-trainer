import { expect, type Locator, type Page, test } from '@playwright/test';
import { Chess } from 'chess.js';
import { SCALE_MAX, toScale } from '../relay/src/live/duelRules.mjs';
import { describeMove } from '../src/components/board/announce';
import { expectBoard, playMove, waitForBoardIdle } from './helpers';
import { type LiveRelay, livePlayer, startLiveRelay } from './live';

/**
 * 0.28: Play, one place for every game, and the games made for two people —
 * a puzzle race, Arbiter and Who Stands Better? duels, Army Draft and
 * blindfold games — played through the relay's own rules (e2e/live.ts) by two
 * players in two browser contexts.
 *
 * Service workers are blocked: they would answer requests the routes must see.
 */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const DUEL_URL = /\/play\/duel\/[A-Za-z0-9_-]{22}$/;
const GAME_URL = /\/play\/online\/[A-Za-z0-9_-]{22}$/;

let relay: LiveRelay | null = null;
test.afterEach(async () => {
  await relay?.stop();
  relay = null;
});

/** Opens Play and waits until it is connected to the relay's waiting room. */
async function openPlay(page: Page) {
  await page.goto('/play');
  await expect(page.getByTestId('live-players')).toBeVisible();
}

/** Posts one of the games for two from its tile, its options set by `set`. */
async function postGame(page: Page, name: string, set?: (dialog: Locator) => Promise<void>) {
  await openPlay(page);
  await page.getByRole('button', { name: `Play ${name}` }).click();
  const dialog = page.getByRole('dialog', { name });
  if (set) await set(dialog);
  await dialog.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByTestId('live-waiting')).toBeVisible();
}

/** Joins the open game whose Join button matches `name`. */
async function join(page: Page, name: RegExp) {
  await openPlay(page);
  await page.getByRole('region', { name: 'Open games' }).getByRole('button', { name }).click();
}

interface RacePuzzle {
  fen: string;
  moves: string;
}

const PROMOTION_NAMES: Record<string, string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
};

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

/**
 * Plays a race puzzle's solution on the page's board, move by move. Each
 * reply is waited for through the board's announcement of it: the reply comes
 * a moment after the move, and a click before it would be lost.
 */
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

test.describe('Play', () => {
  test('leads to the computer, and old links still lead where they did', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByRole('heading', { level: 1, name: 'Play' })).toBeVisible();
    await page
      .getByRole('region', { name: 'Play the computer' })
      .getByRole('link', { name: 'Pass and play' })
      .click();
    await expect(page).toHaveURL(/\/play\/computer$/);
    const setup = page.getByRole('region', { name: 'New game' });
    await expect(setup.getByRole('radio', { name: 'Two players' })).toBeChecked();

    // A link to a position, from before Play was a page of its own.
    await page.goto(`/play?fen=${encodeURIComponent('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')}`);
    await expect(page).toHaveURL(/\/play\/computer$/);
    await expect(setup).toContainText('Starting from a custom position');
    // The old waiting room is Play now.
    await page.goto('/play/online');
    await expect(page).toHaveURL(/\/play$/);

    // An arcade game leads to the same game against a person.
    await page.goto('/arcade/arbiter');
    await page.getByRole('link', { name: 'Play a person' }).click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole('dialog', { name: 'Arbiter duel' })).toBeVisible();
  });

  test('asks before a game against the computer is left half-played', async ({ page }) => {
    await page.goto('/play/computer');
    await page.getByLabel('Engine level').selectOption('1');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const board = await expectBoard(page);
    await playMove(board, 'e2', 'e4');
    await expect(page.getByLabel('Move list').locator('.movelist__move')).toHaveCount(2, {
      timeout: 30_000,
    });
    await page.getByRole('main').getByRole('link', { name: 'Play', exact: true }).click();
    const ask = page.getByRole('dialog', { name: 'Leave this game?' });
    await ask.getByRole('button', { name: 'Keep playing' }).click();
    await expect(page).toHaveURL(/\/play\/computer$/);
    await page.getByRole('main').getByRole('link', { name: 'Play', exact: true }).click();
    await ask.getByRole('button', { name: 'Leave' }).click();
    await expect(page).toHaveURL(/\/play$/);
  });
});

test.describe('games for two', () => {
  test('a puzzle race: the same puzzle on both boards, the first clean solve takes the round', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const host = await livePlayer(browser, relay, 'Patient Bishop', 1420);
    const guest = await livePlayer(browser, relay, 'Swift Knight', 1610);

    await postGame(host, 'Puzzle race');
    await expect(host.getByTestId('live-waiting')).toContainText('Puzzle race · Best of three');
    await join(guest, /^Join Patient Bishop’s puzzle race$/);
    await expect(host).toHaveURL(DUEL_URL);
    await expect(guest).toHaveURL(DUEL_URL);
    expect(new URL(host.url()).pathname).toBe(new URL(guest.url()).pathname);

    // The poster's device dealt five puzzles, the same for both.
    await expect.poll(() => relay!.sent('content').length).toBeGreaterThan(0);
    const puzzles = relay.sent('content')[0].items as RacePuzzle[];
    expect(puzzles).toHaveLength(5);

    // The score shows once: on a phone in the line above the board, elsewhere in the panel.
    const phone = (host.viewportSize()?.width ?? 1280) < 600;
    await expect(host.getByTestId('duel-score')).toHaveCount(phone ? 0 : 1);
    await expect(host.getByTestId('duel-strip')).toHaveCount(phone ? 1 : 0);
    await expect(host.getByTestId('duel-score-mine')).toHaveCount(1);

    // Round 1: the host solves it; the guest never moves.
    await solve(host, puzzles[0]);
    await expect(host.getByTestId('race-status')).toContainText('Solved in');
    await expect(guest.getByTestId('duel-round-result')).toContainText('Patient Bishop’s round');
    await expect(host.getByTestId('duel-score-mine')).toHaveText('1');

    // Round 2: a wrong move is out of the round; the clean solve takes it, and the race.
    await missPuzzle(guest, puzzles[1]);
    await expect(guest.getByTestId('race-status')).toContainText('Missed');
    await solve(host, puzzles[1]);
    const won = host.getByRole('dialog', { name: 'You won!' });
    await expect(won).toBeVisible();
    await expect(host.getByTestId('duel-end-sentence')).toHaveText('2 rounds to 0.');
    // The ways on in even rows (0.30.1): two side by side and the rematch the full width under
    // them, or on a phone one to a row; the rematch, the main one, last.
    const box = async (control: Locator) => {
      const b = await control.boundingBox();
      if (!b) throw new Error('no box');
      return b;
    };
    const show = await box(won.getByRole('button', { name: 'Show the board' }));
    const other = await box(won.getByRole('link', { name: 'New opponent' }));
    const rematch = await box(won.getByRole('button', { name: 'Rematch' }));
    if (phone) {
      expect(other.y).toBeGreaterThanOrEqual(show.y + show.height);
      expect(Math.abs(other.width - rematch.width)).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(show.y - other.y)).toBeLessThanOrEqual(1);
    }
    expect(rematch.y).toBeGreaterThanOrEqual(other.y + other.height);
    expect(Math.abs(rematch.x - show.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(rematch.x + rematch.width - (other.x + other.width))).toBeLessThanOrEqual(1);
    await expect(guest.getByRole('dialog', { name: 'You lost' })).toBeVisible();
    await expect(guest.getByTestId('duel-rounds')).toContainText('Round 2');
  });

  test('Who Stands Better?: both judge the same position, and the closer call scores more', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const host = await livePlayer(browser, relay, 'Calm Castle', 1300);
    const guest = await livePlayer(browser, relay, 'Daring Fork', 1300);

    await postGame(host, 'Who Stands Better? duel');
    await join(guest, /^Join Calm Castle’s Who Stands Better\? duel$/);
    await expect(guest).toHaveURL(DUEL_URL);
    await expect.poll(() => relay!.sent('content').length).toBeGreaterThan(0);
    const positions = relay.sent('content')[0].items as { cp: number }[];
    const cp = positions[0].cp;

    // The host calls it as the engine does; the guest calls the other side winning.
    await expect(host.getByTestId('judge-lock')).toBeEnabled({ timeout: 30_000 });
    await host.getByTestId('judge-slider').fill(String(toScale(cp)));
    await host.getByTestId('judge-lock').click();
    await expect(host.getByTestId('judge-lock')).toHaveText('Locked in');
    await expect(guest.getByTestId('judge-round')).toContainText('Calm Castle has locked in.');
    await guest.getByTestId('judge-slider').fill(String(cp >= 0 ? -SCALE_MAX : SCALE_MAX));
    await guest.getByTestId('judge-lock').click();

    const reveal = host.getByTestId('judge-reveal');
    await expect(reveal).toContainText('The engine says');
    await expect(reveal).toContainText('You:');
    await expect(reveal).toContainText('Daring Fork:');
    const rounds = host.getByTestId('duel-rounds');
    await expect(rounds).toContainText('Position 1 of 5');
    await expect(rounds.locator('.duel__round-winner')).toHaveText('You');
    await expect(guest.getByTestId('duel-rounds').locator('.duel__round-winner')).toHaveText(
      'Calm Castle',
    );

    await guest.getByRole('button', { name: 'Resign' }).click();
    await guest
      .getByRole('dialog', { name: 'Resign this duel?' })
      .getByRole('button', { name: 'Resign' })
      .click();
    await expect(host.getByTestId('duel-end-sentence')).toHaveText('Daring Fork resigned.');
  });

  test('an Arbiter duel: the call on the illegal move takes the round', async ({ browser }) => {
    relay = startLiveRelay();
    const host = await livePlayer(browser, relay, 'Sharp Pin', 1300);
    const guest = await livePlayer(browser, relay, 'Witty Rook', 1300);

    await postGame(host, 'Arbiter duel', async (dialog) => {
      await dialog.getByRole('radio', { name: 'Slow pace' }).click();
    });
    await join(guest, /^Join Sharp Pin’s Arbiter duel$/);
    await expect.poll(() => relay!.sent('content').length).toBeGreaterThan(0);
    const rounds = relay.sent('content')[0].items as { ply: number; lead: string[] }[];
    // The illegal move's number, as the status shows it: "13." for White, "12..." for Black.
    // The moves before it have lower numbers, so the status starts with it only then.
    const ply = rounds[0].ply + rounds[0].lead.length;
    const label = `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}`;
    const shown = new RegExp(`^${label.replace(/\./g, '\\.')}`);

    // The call has to come within a few seconds of the move: watch for it closely.
    await host.getByTestId('arbiter-move').filter({ hasText: shown }).waitFor({ timeout: 60_000 });
    await host.getByTestId('duel-call').click();
    await expect(host.getByTestId('arbiter-move')).toContainText('Called in');
    await expect(guest.getByTestId('duel-round-result')).toContainText('Sharp Pin’s round', {
      timeout: 15_000,
    });
    await expect(guest.getByTestId('arbiter-explain')).toBeVisible();
    await expect(host.getByTestId('duel-score-mine')).toHaveText('1');
  });

  test('Army Draft: each buys an army unseen, and the game starts from both', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const host = await livePlayer(browser, relay, 'Royal Knight', 1300);
    const guest = await livePlayer(browser, relay, 'Humble Pawn', 1300);

    await postGame(host, 'Army Draft', async (dialog) => {
      await dialog.getByRole('radio', { name: 'White' }).click();
    });
    await join(guest, /^Join Royal Knight’s Army Draft game$/);
    await expect(host).toHaveURL(GAME_URL);
    await expect(host.getByRole('heading', { level: 1, name: 'Army Draft' })).toBeVisible();

    // The host takes three queens; the guest the balanced army offered.
    await host.getByRole('button', { name: 'Three queens' }).click();
    await host.getByTestId('draft-ready').click();
    await expect(guest.getByTestId('draft-theirs')).toHaveText('Royal Knight’s army is in.');
    await guest.getByTestId('draft-ready').click();

    await expect(host.getByTestId('live-armies')).toContainText('You: 3 queens, 3 pawns.');
    const board = await expectBoard(host);
    await expect(host.getByTestId('live-status')).toHaveText('Your move');
    await waitForBoardIdle(host);
    await playMove(board, 'e2', 'e4');
    await expect(guest.getByTestId('live-status')).toHaveText('Your move');
  });

  test('blindfold: the pieces stay hidden, and each side sees the other’s peeks', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const host = await livePlayer(browser, relay, 'Silent Square', 1300);
    const guest = await livePlayer(browser, relay, 'Vivid File', 1300);

    await postGame(host, 'Blindfold', async (dialog) => {
      await dialog.getByRole('radio', { name: 'White' }).click();
    });
    await join(guest, /^Join Silent Square’s blindfold game$/);
    await expect(host).toHaveURL(GAME_URL);
    await expect(host.locator('.board--blindfold')).toHaveCount(1);
    await host.getByPlaceholder(/Type a move/).fill('e4');
    await host.getByPlaceholder(/Type a move/).press('Enter');
    await expect(guest.getByTestId('blindfold-bar')).toContainText('Last move: 1. e4');
    await guest.getByRole('button', { name: 'Peek' }).click();
    await expect(guest.locator('.board--blindfold')).toHaveCount(0);
    await expect(host.getByTestId('blindfold-peeks')).toContainText('Vivid File has used 1.');
    await expect(guest.locator('.board--blindfold')).toHaveCount(1, { timeout: 5000 });
  });
});

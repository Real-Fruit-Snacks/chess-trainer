import { expect, type Page, test } from '@playwright/test';
import { expectBoard, playMove, waitForBoardIdle } from './helpers';
import { type LiveRelay, livePlayer, startLiveRelay } from './live';

/**
 * 0.29: Chess960 online. Two players in two browser contexts post and join a
 * Chess960 game through the relay's own rules (e2e/live.ts); the room draws
 * the start position, here fixed to position 192 (BBQNRKNR: each king beside
 * a knight and a rook, so both castle in two moves) and then 500. White
 * premoves castling as the king onto its rook, Black castles by hand, a third
 * context watches, the game ends, a rematch keeps the position with the
 * colours swapped, and the game reaches My games with its Chess960 tags.
 *
 * Service workers are blocked: they would answer requests the routes must see.
 */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const GAME_URL = /\/play\/online\/[A-Za-z0-9_-]{22}$/;
const P192 = 'bbqnrknr/pppppppp/8/8/8/8/PPPPPPPP/BBQNRKNR w KQkq - 0 1';
/** The squares of the premove waiting (chessground hides the square elements it is not using). */
const PREMOVE = 'cg-board square.current-premove:visible';

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

/** Plays `from`-`to` on the page's board, seen from `side`, once it is that side's move. */
async function move(page: Page, from: string, to: string, side: 'white' | 'black') {
  const board = await expectBoard(page);
  await expect(page.getByTestId('live-status')).toHaveText('Your move');
  await waitForBoardIdle(page);
  await playMove(board, from, to, side);
}

/** The game's moves as the relay has passed them on, in UCI, by ply (the latest game's). */
function relayed(): string[] {
  const moves: string[] = [];
  for (const message of relay?.sent('move') ?? []) moves[Number(message.ply)] = String(message.uci);
  return moves;
}

/** The PGNs of the games kept in My games on this page's device. */
async function keptPgns(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('chess-trainer:games');
    const games = raw
      ? (JSON.parse(raw) as { state: { games: Record<string, { pgn: string }> } }).state.games
      : {};
    return Object.values(games).map((game) => game.pgn);
  });
}

test.describe('Chess960 online', () => {
  test('two players post and join a Chess960 game, castle onto their rooks, and keep it', async ({
    browser,
  }) => {
    const positions = [192, 500];
    relay = startLiveRelay({ chess960Position: () => positions.shift() ?? 0 });
    const host = await livePlayer(browser, relay, 'Royal Knight', 1300);
    const guest = await livePlayer(browser, relay, 'Humble Pawn', 1300);

    // The host posts it from its tile, as White.
    await openPlay(host);
    await host.getByRole('button', { name: 'Play Chess960' }).click();
    const dialog = host.getByRole('dialog', { name: 'Chess960' });
    await expect(dialog).toContainText('one of 960 orders');
    await dialog.getByLabel('Time control').selectOption('10+0');
    await dialog.getByRole('radio', { name: 'White' }).click();
    await dialog.getByRole('button', { name: 'Post' }).click();
    await expect(host.getByTestId('live-waiting')).toContainText('Chess960 · 10+0 · Plays white');

    // The guest finds it in the open games, and joins.
    await openPlay(guest);
    const open = guest.getByRole('region', { name: 'Open games' });
    await expect(open).toContainText('Chess960 · 10+0 · Plays white');
    await open.getByRole('button', { name: 'Join Royal Knight’s 10+0 Chess960 game' }).click();
    await expect(host).toHaveURL(GAME_URL);
    await expect(guest).toHaveURL(GAME_URL);
    for (const page of [host, guest]) {
      await expect(page.getByRole('heading', { level: 1, name: 'Chess960' })).toBeVisible();
      await expect(page.getByTestId('live-variant')).toHaveText('Chess960 · position 192');
      // Named once on screen: in the header's line, or beside the board on a phone held upright.
      await expect(page.getByText(/Chess960 · position 192/).filter({ visible: true })).toHaveCount(
        1,
      );
    }
    const game = new URL(host.url()).pathname.split('/').at(-1) ?? '';

    // Someone watches from the watch link.
    const watcher = await livePlayer(browser, relay, 'Quiet Rook', 1300);
    await watcher.goto(`/play/watch/${game}`);
    await expect(watcher.getByTestId('watch-variant')).toHaveText('Chess960 · position 192');

    // White's knight out; while Black thinks, White premoves castling: the king onto its rook.
    await move(host, 'g1', 'h3', 'white');
    await expect(host.getByTestId('live-status')).toHaveText('Humble Pawn to move');
    await waitForBoardIdle(host);
    await playMove(await expectBoard(host), 'f1', 'h1', 'white');
    await expect(host.locator(PREMOVE)).toHaveCount(2);
    await move(guest, 'g8', 'h6', 'black');
    // Played the moment Black's move came, as the king taking its rook.
    await expect.poll(relayed).toEqual(['g1h3', 'g8h6', 'f1h1']);
    await expect(host.locator(PREMOVE)).toHaveCount(0);

    // Black castles by hand, the king dropped on its rook.
    await move(guest, 'f8', 'h8', 'black');
    await expect.poll(relayed).toEqual(['g1h3', 'g8h6', 'f1h1', 'f8h8']);
    for (const page of [host, guest, watcher]) {
      await expect(page.getByRole('region', { name: 'Move list' })).toContainText(
        '1.Nh3Nh62.O-OO-O',
      );
    }

    // Black resigns: the game is over, and the result says so.
    await guest.getByRole('button', { name: 'Resign' }).click();
    await guest
      .getByRole('dialog', { name: 'Resign this game?' })
      .getByRole('button', { name: 'Resign' })
      .click();
    const won = host.getByRole('dialog', { name: 'You won!' });
    await expect(won).toContainText('Humble Pawn resigned.');
    await expect(watcher.getByTestId('live-status')).toHaveText(
      'Royal Knight won: Humble Pawn resigned.',
    );

    // My games keeps it as a Chess960 game, from its start.
    await expect.poll(() => keptPgns(host)).toHaveLength(1);
    const [pgn] = await keptPgns(host);
    expect(pgn).toContain('[Event "Chess960 · position 192 · 10+0"]');
    expect(pgn).toContain(`[Variant "Chess960"]\n[SetUp "1"]\n[FEN "${P192}"]`);
    expect(pgn).toMatch(/1\. Nh3 .*1\.\.\. Nh6 .*2\. O-O .*2\.\.\. O-O .*1-0$/s);

    // A rematch: the same position, the colours swapped.
    await won.getByRole('button', { name: 'Rematch' }).click();
    await guest
      .getByRole('dialog', { name: 'You lost' })
      .getByRole('button', { name: 'Accept the rematch' })
      .click();
    await guest
      .getByRole('dialog', { name: 'You lost' })
      .getByRole('button', { name: 'Play the rematch' })
      .click();
    await host
      .getByRole('dialog', { name: 'You won!' })
      .getByRole('button', { name: 'Play the rematch' })
      .click();
    await expect(host).not.toHaveURL(new RegExp(`${game}$`));
    for (const page of [host, guest]) {
      await expect(page.getByTestId('live-variant')).toHaveText('Chess960 · position 192');
    }
    await expect(guest.getByTestId('live-status')).toHaveText('Your move');
    await move(guest, 'g1', 'h3', 'white');
    await expect(host.getByTestId('live-status')).toHaveText('Your move');

    // My games, on the page: the game is there, marked Chess960.
    await host.goto('/games');
    await expect(host.getByTestId('game-variant').first()).toHaveText('Chess960');
  });
});

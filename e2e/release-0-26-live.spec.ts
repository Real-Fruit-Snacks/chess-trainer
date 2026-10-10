import { expect, type Page, test } from '@playwright/test';
import { FakeLichess } from '../src/test/fakeLichess';
import { expectBoard, playMove, waitForBoardIdle } from './helpers';
import { type LiveRelay, livePlayer, startLiveRelay } from './live';

/**
 * 0.26: live games against people. Two players on two devices (two browser
 * contexts) meet in the waiting room and play through the relay's own rules,
 * which run in this process behind Playwright's WebSocket routes (e2e/live.ts):
 * posting and joining, a game posted while the player does something else,
 * offers and takebacks, resigning and the rematch, a private game joined by its
 * link, an opponent who leaves; and a game found on Lichess (the stand-in
 * lichess.org) while the same game waits in the app's own room.
 *
 * Service workers are blocked: they would answer requests the routes must see.
 */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const GAME_URL = /\/play\/online\/[A-Za-z0-9_-]{22}$/;

let relay: LiveRelay | null = null;
test.afterEach(async () => {
  await relay?.stop();
  relay = null;
});

/** Opens the waiting room and waits for it to be connected. */
async function waitingRoom(page: Page) {
  await page.goto('/play/online');
  await expect(page.getByTestId('live-post')).toBeVisible();
  await expect(page.getByTestId('live-players')).toBeVisible();
}

/**
 * Posts a game from the open waiting room: the colour, then the time control's
 * tile. The game then waits — unless someone was waiting for the same, when the
 * board opens at once (`paired`).
 */
async function post(
  page: Page,
  tc: string,
  color: 'Random' | 'White' | 'Black' = 'Random',
  { paired = false } = {},
) {
  await page.getByRole('radio', { name: color }).click();
  await page
    .getByTestId('live-post')
    .getByRole('button', { name: new RegExp(`^${tc.replace('+', '\\+')} `) })
    .click();
  if (paired) await expect(page).toHaveURL(GAME_URL);
  else await expect(page.getByTestId('live-waiting')).toBeVisible();
}

/**
 * Goes to another page the way a link inside the app does: no reload, so the
 * app (and the game it has posted) carries on.
 */
async function inApp(page: Page, path: string) {
  await page.evaluate((to) => {
    history.pushState({}, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

/** Plays `from`-`to` on the page's board, seen from `side`, once it is that side's move. */
async function move(page: Page, from: string, to: string, side: 'white' | 'black') {
  const board = await expectBoard(page);
  await expect(page.getByTestId('live-status')).toHaveText('Your move');
  await waitForBoardIdle(page);
  await playMove(board, from, to, side);
}

test.describe('live games', () => {
  test('two players meet in the waiting room and play to mate; the game lands in My games', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const white = await livePlayer(browser, relay, 'Patient Bishop', 1420);
    const black = await livePlayer(browser, relay, 'Swift Knight', 1610);

    await waitingRoom(white);
    await post(white, '1+0', 'White');
    await waitingRoom(black);
    const listed = black.getByRole('listitem').filter({ hasText: 'Patient Bishop' });
    await expect(listed).toContainText('1420');
    await expect(listed).toContainText('Plays white');
    await black.getByRole('button', { name: 'Join Patient Bishop’s 1+0 game' }).click();

    // Both boards open: the poster's from the waiting room, the joiner's at once.
    await expect(white).toHaveURL(GAME_URL);
    await expect(black).toHaveURL(GAME_URL);
    expect(new URL(white.url()).pathname).toBe(new URL(black.url()).pathname);
    await expect(white.getByRole('heading', { name: 'Swift Knight · 1+0' })).toBeVisible();
    await expect(white.getByTestId('live-first-move')).toContainText('White must move within');

    // The fool's mate: White walks into it.
    await move(white, 'f2', 'f3', 'white');
    await move(black, 'e7', 'e5', 'black');
    await move(white, 'g2', 'g4', 'white');
    await move(black, 'd8', 'h4', 'black');

    const won = black.getByRole('dialog', { name: 'You won!' });
    await expect(won).toBeVisible();
    await expect(black.getByTestId('live-end-sentence')).toContainText('checkmate');
    await expect(white.getByRole('dialog', { name: 'You lost' })).toBeVisible();

    await won.getByRole('link', { name: 'Review in My games' }).click();
    await expect(black).toHaveURL(/\/games$/);
    await expect(black.getByText('played online').first()).toBeVisible();
    await expect(black.getByText('Patient Bishop').first()).toBeVisible();
  });

  test('a posted game waits while the player does something else, and the bar leads to the board', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const poster = await livePlayer(browser, relay, 'Quiet Rook');
    const joiner = await livePlayer(browser, relay, 'Bold Pawn');

    await waitingRoom(poster);
    await post(poster, '5+3');
    await inApp(poster, '/learn');
    const bar = poster.getByTestId('live-bar');
    await expect(bar).toContainText('Waiting for an opponent · 5+3');

    // The same time control, tapped by someone else: paired at once.
    await waitingRoom(joiner);
    await post(joiner, '5+3', 'Random', { paired: true });
    await expect(bar).toContainText('Bold Pawn joined your 5+3 game.');
    await bar.getByRole('button', { name: 'Go to the board' }).click();
    await expect(poster).toHaveURL(joiner.url());
    await expect(poster.getByTestId('live-bar')).toHaveCount(0);

    // Nobody has moved: either side may abort.
    await poster.getByRole('button', { name: 'Abort' }).click();
    await expect(poster.getByRole('dialog', { name: 'Game aborted' })).toBeVisible();
    await expect(joiner.getByRole('dialog', { name: 'Game aborted' })).toBeVisible();
  });

  test('a game in progress survives the app starting again on another page', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const white = await livePlayer(browser, relay, 'Lucky Knight');
    const black = await livePlayer(browser, relay, 'Merry Square');

    await waitingRoom(white);
    await post(white, '15+10', 'White');
    await waitingRoom(black);
    await black.getByRole('button', { name: 'Join Lucky Knight’s 15+10 game' }).click();
    await expect(white).toHaveURL(GAME_URL);
    const game = new URL(white.url()).pathname;
    await move(white, 'c2', 'c4', 'white');
    await move(black, 'e7', 'e5', 'black');

    // White wanders off in the app, and the app starts again there (a reload, or the phone closing it).
    await inApp(white, '/learn');
    await expect(white.getByTestId('live-bar')).toContainText(
      'Your game against Merry Square is on.',
    );
    await white.reload();
    const bar = white.getByTestId('live-bar');
    await expect(bar).toContainText('Your game against Merry Square is on.');
    await bar.getByRole('link', { name: 'Back to the board' }).click();
    await expect(white).toHaveURL(new RegExp(`${game}$`));
    await move(white, 'b1', 'c3', 'white');
    await expect(black.getByTestId('live-status')).toHaveText('Your move');

    // Once the game is over, a fresh start has nothing to go back to.
    await black.getByRole('button', { name: 'Resign' }).click();
    await black
      .getByRole('dialog', { name: 'Resign this game?' })
      .getByRole('button', { name: 'Resign' })
      .click();
    await expect(white.getByRole('dialog', { name: 'You won!' })).toBeVisible();
    await inApp(white, '/learn');
    await white.reload();
    await expect(white.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
    await expect(white.getByTestId('live-bar')).toHaveCount(0);
  });

  test('offers, a takeback, resigning and a rematch with the colours swapped', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const white = await livePlayer(browser, relay, 'Calm Castle');
    const black = await livePlayer(browser, relay, 'Daring Fork');

    await waitingRoom(white);
    await post(white, '10+0', 'White');
    await waitingRoom(black);
    await black.getByRole('button', { name: 'Join Calm Castle’s 10+0 game' }).click();
    await expect(white).toHaveURL(GAME_URL);

    await move(white, 'e2', 'e4', 'white');
    await move(black, 'e7', 'e5', 'black');

    // A draw offered and declined.
    await white.getByRole('button', { name: 'Offer draw' }).click();
    await expect(white.getByRole('button', { name: 'Draw offered' })).toBeDisabled();
    const offer = black.getByTestId('live-draw-offer');
    await expect(offer).toContainText('Calm Castle offers a draw.');
    await offer.getByRole('button', { name: 'Decline' }).click();
    await expect(white.getByRole('button', { name: 'Offer draw' })).toBeEnabled();

    // White plays on; Black asks to take back its reply, and White agrees.
    await move(white, 'g1', 'f3', 'white');
    await move(black, 'b8', 'c6', 'black');
    await black.getByRole('button', { name: 'Takeback' }).click();
    const ask = white.getByTestId('live-takeback-offer');
    await expect(ask).toContainText('Daring Fork asks to take back a move.');
    await ask.getByRole('button', { name: 'Accept' }).click();
    await move(black, 'g8', 'f6', 'black');

    // White resigns.
    await white.getByRole('button', { name: 'Resign' }).click();
    await white
      .getByRole('dialog', { name: 'Resign this game?' })
      .getByRole('button', { name: 'Resign' })
      .click();
    await expect(black.getByRole('dialog', { name: 'You won!' })).toBeVisible();
    await expect(black.getByTestId('live-end-sentence')).toContainText('Calm Castle resigned');

    // The rematch: offered, accepted, and played with the colours swapped.
    await white
      .getByRole('dialog', { name: 'You lost' })
      .getByRole('button', { name: 'Rematch' })
      .click();
    await black
      .getByRole('dialog', { name: 'You won!' })
      .getByRole('button', { name: 'Accept the rematch' })
      .click();
    for (const page of [white, black]) {
      await page.getByRole('dialog').getByRole('button', { name: 'Play the rematch' }).click();
    }
    await expect(white).toHaveURL(GAME_URL);
    expect(new URL(white.url()).pathname).toBe(new URL(black.url()).pathname);
    await expect(black.getByTestId('live-first-move')).toContainText('White must move within');
    await expect(black.getByTestId('live-status')).toHaveText('Your move');
    await expect(white.getByTestId('live-status')).toHaveText('Daring Fork to move');
  });

  test('a private game stays out of the list and is joined by its link', async ({ browser }) => {
    relay = startLiveRelay();
    const host = await livePlayer(browser, relay, 'Witty Gambit');
    const friend = await livePlayer(browser, relay, 'Loyal Queen');
    await host.addInitScript(() => {
      // The share link, as the clipboard would get it (no share sheet here).
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (text: string) => {
            (window as unknown as { copied: string }).copied = text;
            return Promise.resolve();
          },
        },
        configurable: true,
      });
    });

    await waitingRoom(host);
    await host.getByRole('switch', { name: 'Only people with the link' }).click();
    await post(host, '15+10');
    await expect(host.getByTestId('live-waiting')).toContainText('Only people with the link');
    await host.getByRole('button', { name: 'Share link' }).click();
    const link = await host.evaluate(() => (window as unknown as { copied: string }).copied);
    expect(link).toMatch(/\/play\/online\?join=[A-Za-z0-9_-]{22}$/);

    await waitingRoom(friend);
    await expect(friend.getByTestId('live-players')).toContainText('1 other player here');
    await expect(friend.getByText('No open games right now')).toBeVisible();
    await friend.goto(link);
    await expect(friend).toHaveURL(GAME_URL);
    await expect(host).toHaveURL(friend.url());
  });

  test('an opponent who leaves can be claimed against', async ({ browser }) => {
    relay = startLiveRelay();
    const stayer = await livePlayer(browser, relay, 'Steady Plan');
    const leaver = await livePlayer(browser, relay, 'Sleepy Tempo');

    await waitingRoom(stayer);
    await post(stayer, '3+2', 'White');
    await waitingRoom(leaver);
    await leaver.getByRole('button', { name: 'Join Steady Plan’s 3+2 game' }).click();
    await expect(stayer).toHaveURL(GAME_URL);
    await move(stayer, 'd2', 'd4', 'white');
    await move(leaver, 'd7', 'd5', 'black');

    await leaver.context().close();
    const left = stayer.getByTestId('live-left');
    await expect(left).toContainText('Sleepy Tempo has left the game.');
    await expect(left).toContainText('You can claim the game in');
    // Thirty seconds on the relay's clock; the page catches up when it reconnects.
    relay.advance(30_000);
    await stayer.reload();
    await stayer.getByTestId('live-left').getByRole('button', { name: 'Claim the win' }).click();
    await expect(stayer.getByRole('dialog', { name: 'You won!' })).toBeVisible();
    await expect(stayer.getByTestId('live-end-sentence')).toContainText(
      'Sleepy Tempo left the game',
    );
  });

  test('with Lichess on, a game found there first is played on the board here', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const fake = new FakeLichess();
    fake.board.runClockInRealTime();
    const token = fake.issueToken();
    const player = await livePlayer(browser, relay, 'Brave Bishop');
    const watcher = await livePlayer(browser, relay, 'Gentle Rook');
    await player.context().route('https://lichess.org/**', async (route) => {
      const request = route.request();
      const res = await fake.handle({
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        body: request.postData() ?? '',
      });
      await route.fulfill({ status: res.status, headers: res.headers, body: res.body });
    });
    await player.addInitScript(
      ([key, blob]) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, blob);
      },
      [
        'chess-trainer:lichess',
        JSON.stringify({
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
            options: { puzzles: false, rating: false, games: false, studies: false },
          },
          version: 1,
        }),
      ] as const,
    );

    await waitingRoom(player);
    await player.getByRole('switch', { name: 'Also look on Lichess' }).click();
    await post(player, '10+0', 'Black');
    const waiting = player.getByTestId('live-waiting');
    await expect(waiting).toContainText('On Lichess: posted');

    // The same game waits in the app's own room meanwhile.
    await waitingRoom(watcher);
    await expect(
      watcher.getByRole('button', { name: 'Join Brave Bishop’s 10+0 game' }),
    ).toBeVisible();

    // Someone on Lichess takes it first: the board here plays it, and the post here goes.
    await expect.poll(() => fake.board.seeks.length).toBe(1);
    const game = fake.board.pairSeek({
      color: 'black',
      opponent: { id: 'stranger', name: 'Stranger', rating: 1702 },
    });
    await expect(player).toHaveURL(new RegExp(`/play/online/lichess/${game.id}$`));
    await expect(watcher.getByText('No open games right now')).toBeVisible();
    await expect(player.getByRole('heading', { name: 'Stranger · 10+0' })).toBeVisible();

    fake.board.opponentIn(game.id).move('e2e4');
    await move(player, 'c7', 'c5', 'black');
    await expect.poll(() => fake.board.games.get(game.id)?.moves.length).toBe(2);

    await player.getByRole('button', { name: 'Resign' }).click();
    await player
      .getByRole('dialog', { name: 'Resign this game?' })
      .getByRole('button', { name: 'Resign' })
      .click();
    const result = player.getByRole('dialog', { name: 'You lost' });
    await expect(result).toBeVisible();
    await expect(result.getByRole('link', { name: 'Open on Lichess' })).toHaveAttribute(
      'href',
      `https://lichess.org/${game.id}`,
    );
  });
});

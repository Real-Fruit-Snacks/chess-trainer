import { expect, type Page, type Route, test } from '@playwright/test';
import { createRelay } from '../relay/src/handler.mjs';
import { memoryStore } from '../relay/src/memoryStore.mjs';
import { memoryPushStore } from '../relay/src/push/memoryPushStore.mjs';
import { createPushApi } from '../relay/src/push/reminders.mjs';
import { siteConfig } from '../src/site.config';
import { clickSquare, expectBoard, playMove, waitForBoardIdle } from './helpers';
import { type LiveRelay, livePlayer, startLiveRelay } from './live';

/**
 * 0.29: live games, further. Premoves in a game between two browser contexts;
 * a third context watching the game; a correspondence game made by
 * invitation, joined from its link, played, and listed on Play; and the
 * Notifications card, with the browser's Notification and Push APIs stood in
 * for (no real push service) and the relay's push endpoints answering through
 * routes. The relay's live rules run in this process (e2e/live.ts).
 *
 * Service workers are blocked: they would answer requests the routes must see.
 */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const GAME_URL = /\/play\/online\/[A-Za-z0-9_-]{22}$/;
/** The squares of the premove waiting (chessground hides the square elements it is not using). */
const PREMOVE = 'cg-board square.current-premove:visible';

let relay: LiveRelay | null = null;
test.afterEach(async () => {
  await relay?.stop();
  relay = null;
});

/** Keeps every link a page shares (share sheet or clipboard) in `window.__shared`. */
async function catchShares(page: Page) {
  await page.addInitScript(() => {
    const shared: string[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { url?: string }) => {
        shared.push(data.url ?? '');
        return Promise.resolve();
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          shared.push(text);
          return Promise.resolve();
        },
      },
    });
  });
}

/** The last link the page shared. */
async function lastShared(page: Page): Promise<string> {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared.length))
    .toBeGreaterThan(0);
  return page.evaluate(() => (window as unknown as { __shared: string[] }).__shared.at(-1) ?? '');
}

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
  return new URL(white.url()).pathname.split('/').at(-1) ?? '';
}

/** Plays `from`-`to` on the page's board, seen from `side`, once it is that side's move. */
async function move(page: Page, from: string, to: string, side: 'white' | 'black') {
  const board = await expectBoard(page);
  await expect(page.getByTestId('live-status')).toHaveText('Your move');
  await waitForBoardIdle(page);
  await playMove(board, from, to, side);
}

/** The game's moves as the relay has passed them on (to every page), in UCI, by ply. */
function relayed(): string[] {
  const moves: string[] = [];
  for (const message of relay?.sent('move') ?? []) moves[Number(message.ply)] = String(message.uci);
  return moves;
}

test.describe('live games, 0.29', () => {
  test('a premove waits for the opponent, is played the moment they move, and Escape cancels one', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const white = await livePlayer(browser, relay, 'Patient Bishop');
    const black = await livePlayer(browser, relay, 'Swift Knight');
    await pairedGame(white, black);

    await move(white, 'e2', 'e4', 'white');
    // Black thinks; White sets up the knight's move.
    await expect(white.getByTestId('live-status')).toHaveText('Swift Knight to move');
    const board = await expectBoard(white);
    await waitForBoardIdle(white);
    await playMove(board, 'g1', 'f3', 'white');
    await expect(white.locator(PREMOVE)).toHaveCount(2);
    await expect.poll(relayed).toEqual(['e2e4']);

    await move(black, 'e7', 'e5', 'black');
    // Played the moment Black's move came: Black is to move again.
    await expect.poll(relayed).toEqual(['e2e4', 'e7e5', 'g1f3']);
    await expect(black.getByTestId('live-status')).toHaveText('Your move');
    await expect(white.locator(PREMOVE)).toHaveCount(0);

    // Another premove, called off with Escape: nothing is played.
    await waitForBoardIdle(white);
    await playMove(board, 'f1', 'c4', 'white');
    await expect(white.locator(PREMOVE)).toHaveCount(2);
    await white.keyboard.press('Escape');
    await expect(white.locator(PREMOVE)).toHaveCount(0);
    await move(black, 'b8', 'c6', 'black');
    await expect(white.getByTestId('live-status')).toHaveText('Your move');
    expect(relayed()).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  });

  test('a third browser watches the game from its watch link, and the players see it watched', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const white = await livePlayer(browser, relay, 'Patient Bishop');
    const black = await livePlayer(browser, relay, 'Swift Knight');
    await catchShares(white);
    const id = await pairedGame(white, black);

    await white.getByTestId('live-watch-link').click();
    const link = await lastShared(white);
    expect(link).toMatch(new RegExp(`/play/watch/${id}$`));

    const watcher = await livePlayer(browser, relay, 'Quiet Rook');
    await watcher.goto(new URL(link).pathname);
    await expect(watcher.getByTestId('live-status')).toHaveText('Patient Bishop to move');
    await expect(watcher.getByTestId('live-watchers')).toHaveText('1 watching');
    await expect(white.getByTestId('live-watchers')).toHaveText('1 watching');
    await expect(black.getByTestId('live-watchers')).toHaveText('1 watching');

    await move(white, 'd2', 'd4', 'white');
    await expect(watcher.getByTestId('live-status')).toHaveText('Swift Knight to move');
    // The watcher's board plays nothing.
    const board = await expectBoard(watcher);
    await clickSquare(board, 'd7');
    await clickSquare(board, 'd5');
    await expect(black.getByTestId('live-status')).toHaveText('Your move');
    expect(relayed()).toEqual(['d2d4']);
    await move(black, 'd7', 'd5', 'black');
    await expect(watcher.getByTestId('live-status')).toHaveText('Patient Bishop to move');

    // Gone: the players see nobody watching.
    await watcher.close();
    await expect(white.getByTestId('live-watchers')).toHaveCount(0);
  });

  test('a correspondence game: invited, joined from its link, played, and listed on Play', async ({
    browser,
  }) => {
    relay = startLiveRelay();
    const poster = await livePlayer(browser, relay, 'Patient Bishop');
    const friend = await livePlayer(browser, relay, 'Swift Knight');
    await catchShares(poster);

    await openPlay(poster);
    await poster.getByTestId('hub-invite').click();
    const dialog = poster.getByRole('dialog', { name: 'Invite a friend' });
    await dialog.getByTestId('game-dialog-tc').selectOption('3d');
    await expect(dialog).toContainText('Each of you has these days for every move');
    await dialog.getByRole('radio', { name: 'White' }).click();
    await dialog.getByRole('button', { name: 'Create the link' }).click();

    // The poster's board opens at once, waiting for the friend.
    await expect(poster).toHaveURL(GAME_URL);
    await expect(poster.getByTestId('live-status')).toHaveText(
      'Waiting for your friend to take the other seat',
    );
    await poster.getByTestId('live-invite').getByRole('button', { name: 'Copy the link' }).click();
    const link = await lastShared(poster);
    expect(new URL(link).pathname).toBe(new URL(poster.url()).pathname);

    // The friend opens the link and takes the seat.
    await friend.goto(new URL(link).pathname);
    const join = friend.getByTestId('live-join');
    await expect(join).toContainText('Patient Bishop invites you to a correspondence game');
    await expect(join).toContainText('3 days a move');
    await join.getByRole('button', { name: 'Join this game' }).click();
    await expect(friend.getByTestId('live-status')).toHaveText('Patient Bishop to move');
    await expect(friend).toHaveURL(GAME_URL);

    await move(poster, 'e2', 'e4', 'white');
    await expect(poster.getByTestId('live-days-left').first()).toBeVisible();
    await move(friend, 'c7', 'c5', 'black');
    await expect(poster.getByTestId('live-status')).toHaveText('Your move');

    // Play lists it, whose move first.
    await openPlay(poster);
    const mine = poster.getByTestId('live-corr');
    await expect(mine.getByRole('heading', { name: 'Your correspondence games' })).toBeVisible();
    await expect(mine.getByTestId('live-corr-game')).toContainText('Swift Knight');
    await expect(mine.getByTestId('live-corr-game')).toContainText(/Your move · 2 days 23 h left/);
    await openPlay(friend);
    await expect(friend.getByTestId('live-corr-game')).toContainText('Patient Bishop');
    await expect(friend.getByTestId('live-corr-game')).toContainText(/Their move/);
    // Back to the board from the list.
    await mine.getByRole('link', { name: 'Play your move against Swift Knight' }).click();
    await expect(poster).toHaveURL(GAME_URL);
    await expect(poster.getByTestId('live-status')).toHaveText('Your move');
  });
});

/* ------------------------------------------------------------------ */
/* Notifications                                                      */
/* ------------------------------------------------------------------ */

/** A learner past the first run, so nothing stands over the page. */
async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'chess-trainer:progress',
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
    );
  });
}

/** The relay's push endpoints (and its vault API), in this process, behind routes. */
function pushRelay() {
  const store = memoryPushStore();
  const handle = createRelay({ store: memoryStore(), push: createPushApi({ store }) });
  const route = async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const posted = request.postDataBuffer();
    const response = await handle(
      new Request(request.url(), {
        method,
        headers: request.headers(),
        body: posted && method !== 'GET' && method !== 'OPTIONS' ? new Uint8Array(posted) : null,
      }),
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  };
  return { store, route };
}

/**
 * Stands in for the browser's Notification API (the permission asked for is
 * given) and for the service worker's push manager, which makes a subscription
 * for whatever key it is given. Nothing reaches a push service.
 */
async function standInNotifications(page: Page) {
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default';
    class StandInNotification {
      static get permission() {
        return permission;
      }
      static requestPermission() {
        permission = 'granted';
        return Promise.resolve(permission);
      }
    }
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: StandInNotification,
    });
    const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-device';
    let current: object | null = null;
    const registration = {
      showNotification: () => Promise.resolve(),
      pushManager: {
        getSubscription: () => Promise.resolve(current),
        subscribe: (options: { applicationServerKey: Uint8Array }) => {
          const subscription = {
            endpoint,
            options: { applicationServerKey: options.applicationServerKey.slice().buffer },
            toJSON: () => ({
              endpoint,
              expirationTime: null,
              keys: {
                p256dh:
                  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
                auth: 'BTBZMqHH6r4Tts7J_aSIgg',
              },
            }),
            unsubscribe: () => {
              current = null;
              return Promise.resolve(true);
            },
          };
          current = subscription;
          return Promise.resolve(subscription);
        },
      },
    };
    ServiceWorkerContainer.prototype.getRegistration = () =>
      Promise.resolve(registration as unknown as ServiceWorkerRegistration);
  });
}

test.describe('notifications, 0.29', () => {
  test('each kind goes on with the browser’s permission, and the reminder is kept on the relay', async ({
    page,
  }) => {
    const push = pushRelay();
    await page.context().route(`${siteConfig.syncRelay}/**`, push.route);
    await seed(page);
    await standInNotifications(page);
    await page.goto('/settings#notifications');

    const card = page.getByTestId('notifications');
    await expect(card.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(card).toContainText('They are set on this device only.');

    await card.getByRole('switch', { name: 'Live games' }).click();
    await expect(card.getByRole('switch', { name: 'Live games' })).toBeChecked();

    await card.getByRole('switch', { name: 'Correspondence games' }).click();
    await expect(card.getByRole('switch', { name: 'Correspondence games' })).toBeChecked();

    // The reminder: kept on the relay at the time chosen, in this device's time zone.
    await card.getByRole('switch', { name: 'Daily reminder' }).click();
    await expect(card.getByRole('switch', { name: 'Daily reminder' })).toBeChecked();
    await expect.poll(() => push.store.countReminders()).toBe(1);
    const due = async () => (await push.store.dueReminders(Number.MAX_SAFE_INTEGER, 1))[0];
    expect(await due()).toMatchObject({
      endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device',
      minute: 18 * 60,
    });
    await card.getByLabel('Reminder time').selectOption({ label: '07:30' });
    await expect.poll(async () => (await due())?.minute).toBe(7 * 60 + 30);

    // Off: the relay forgets it; the settings stay with the device.
    await card.getByRole('switch', { name: 'Daily reminder' }).click();
    await expect.poll(() => push.store.countReminders()).toBe(0);
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Live games' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Daily reminder' })).not.toBeChecked();
    await expect(page.getByLabel('Reminder time')).toHaveValue(String(7 * 60 + 30));
  });

  test('an iPhone outside the Home Screen app is told how to get them', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await seed(page);
      await page.goto('/settings#notifications');
      const card = page.getByTestId('notifications');
      await expect(card.getByTestId('notifications-blocked')).toContainText(
        'only the app on your Home Screen can show notifications',
      );
      for (const name of ['Live games', 'Correspondence games', 'Daily reminder']) {
        await expect(card.getByRole('switch', { name })).toBeDisabled();
      }
    } finally {
      await context.close();
    }
  });
});

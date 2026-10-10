import type { Browser, BrowserContext, Page } from '@playwright/test';
import { createLiveHub, type LiveHub, type Timers } from '../relay/src/live/hub.mjs';
import { siteConfig } from '../src/site.config';

/**
 * Live games in the end-to-end tests: the relay's own waiting room and game
 * rooms (relay/src/live), in this process, answering every browser's
 * WebSockets through Playwright's WebSocket routes — so two players in two
 * browser contexts meet and play through the real rules, without a server.
 *
 * The relay's clock runs with real time, and `advance` moves it on (a first
 * move that never comes, a player gone long enough to be claimed against).
 */

const LIVE_URL = new RegExp(
  `^${siteConfig.syncRelay.replace(/^http/, 'ws').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/v1/(lobby|games/[^/?#]+)$`,
);

export interface LiveRelay {
  hub: LiveHub;
  /** Routes a context's live-game sockets to this relay. */
  attach(context: BrowserContext): Promise<void>;
  /** A context of the test's own, closed with the relay (`livePlayer` makes them). */
  own(context: BrowserContext): void;
  /** Moves the relay's clock on, firing whatever falls due. */
  advance(ms: number): void;
  /**
   * Stops the relay and closes the contexts it owns: a page left open would
   * go on reconnecting, its timers running, through every later test.
   */
  stop(): Promise<void>;
}

export function startLiveRelay(): LiveRelay {
  let offset = 0;
  const now = () => Date.now() + offset;
  let queue: { at: number; run: () => void }[] = [];
  const timers: Timers = {
    set: (at, run) => {
      const handle = { at, run };
      queue.push(handle);
      return handle;
    },
    clear: (handle) => {
      queue = queue.filter((h) => h !== handle);
    },
  };
  /** Runs the timers that are due, oldest first. */
  const fire = () => {
    const at = now();
    for (const due of queue.filter((h) => h.at <= at).sort((a, b) => a.at - b.at)) {
      queue = queue.filter((h) => h !== due);
      due.run();
    }
  };
  const ticker = setInterval(fire, 50);
  const hub = createLiveHub({ now, timers });
  const contexts: BrowserContext[] = [];

  return {
    hub,
    async attach(context) {
      await context.routeWebSocket(LIVE_URL, (ws) => {
        const path = new URL(ws.url()).pathname;
        const game = /^\/v1\/games\/(.+)$/.exec(path)?.[1];
        let closed = false;
        const events = (game ? hub.openRoom.bind(hub, game) : hub.openLobby.bind(hub))({
          send: (text: string) => ws.send(text),
          close: (code: number, reason: string) => {
            void ws.close({ code, reason });
            // A close the relay makes is not reported back by the route: tell the hub here.
            if (!closed) {
              closed = true;
              queueMicrotask(() => void events.close());
            }
          },
        });
        ws.onMessage((message) => {
          void events.message(typeof message === 'string' ? message : message.toString('utf8'));
        });
        ws.onClose(() => {
          if (closed) return;
          closed = true;
          void events.close();
        });
      });
    },
    own(context) {
      contexts.push(context);
    },
    advance(ms) {
      offset += ms;
      fire();
    },
    async stop() {
      clearInterval(ticker);
      await Promise.all(
        contexts.splice(0).map((context) => context.close().catch(() => undefined)),
      );
      hub.closeAll();
    },
  };
}

const PROGRESS_KEY = 'chess-trainer:progress';
const LIVE_KEY = 'chess-trainer:live';

/**
 * A player on a device of their own: an onboarded learner with a puzzle
 * rating, a name to play under, and live games through `relay`.
 */
export async function livePlayer(
  browser: Browser,
  relay: LiveRelay,
  name: string,
  rating = 1250,
): Promise<Page> {
  const context = await browser.newContext();
  relay.own(context);
  await relay.attach(context);
  const page = await context.newPage();
  await page.addInitScript(
    ([progressKey, liveKey, live, puzzleRating]) => {
      if (localStorage.getItem(progressKey)) return;
      localStorage.setItem(
        progressKey,
        JSON.stringify({
          state: { onboarded: true, puzzleRating: Number(puzzleRating), puzzleRd: 60 },
          version: 8,
        }),
      );
      localStorage.setItem(liveKey, live);
    },
    [
      PROGRESS_KEY,
      LIVE_KEY,
      JSON.stringify({ state: { name }, version: 1 }),
      String(rating),
    ] as const,
  );
  return page;
}

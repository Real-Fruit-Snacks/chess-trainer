import { create } from 'zustand';
import { useLichess } from '@/store/lichess';
import { setBarReason } from './bar';
import { createLichessGame } from './lichessLive';
import { recordLiveGame } from './record';
import { createRelayGame } from './relayGame';
import {
  gamesToCheck,
  LICHESS_GAME_ID,
  liveGamePath,
  markGameOver,
  rememberLichessGame,
  seatOf,
} from './seats';
import type { LiveGameSession, LiveGameView, LiveSource, Side } from './types';

/**
 * The game connections of this device, one per game whatever shows it (the
 * game page, the bar that leads back to it). A game in progress stays
 * connected wherever the player goes in the app; a finished one is let go a
 * minute after nothing shows it any more.
 */
export { liveGamePath, rememberSeat } from './seats';

/** A finished game's connection is closed once nothing has shown it for this long. */
export const FINISHED_LINGER_MS = 60_000;

interface Entry {
  key: string;
  source: LiveSource;
  id: string;
  /** The game's own connection. */
  inner: LiveGameSession;
  /** What callers get: the same game, its subscribers counted. */
  session: LiveGameSession;
  /** Subscribers other than this module. */
  watchers: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** This module's own subscription. */
  stop: () => void;
}

const entries = new Map<string, Entry>();

/**
 * The connection to a game this device has a seat in (the same one for every
 * caller); null when it holds none (a link to someone else's game, a game
 * forgotten).
 */
export function getLiveGame(source: LiveSource, id: string): LiveGameSession | null {
  const key = `${source}:${id}`;
  const known = entries.get(key);
  if (known) return known.session;
  const inner = open(source, id);
  if (!inner) return null;
  const entry: Entry = {
    key,
    source,
    id,
    inner,
    session: inner,
    watchers: 0,
    timer: null,
    stop: () => undefined,
  };
  entry.session = counted(entry);
  entries.set(key, entry);
  entry.stop = inner.subscribe(() => changed(entry));
  changed(entry);
  return entry.session;
}

function open(source: LiveSource, id: string): LiveGameSession | null {
  if (source === 'relay') {
    const seat = seatOf(id);
    return seat ? createRelayGame(id, seat.seat, seat.color) : null;
  }
  if (!LICHESS_GAME_ID.test(id) || !useLichess.getState().account) return null;
  rememberLichessGame(id);
  return createLichessGame(id);
}

/** The session handed out: the game's own, with its subscribers counted for its lifetime. */
function counted(entry: Entry): LiveGameSession {
  const { inner } = entry;
  return {
    getView: () => inner.getView(),
    subscribe: (listener) => {
      entry.watchers += 1;
      lifetime(entry);
      const off = inner.subscribe(listener);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        off();
        entry.watchers -= 1;
        if (entries.get(entry.key) === entry) lifetime(entry);
      };
    },
    move: (uci) => inner.move(uci),
    resign: () => inner.resign(),
    abort: () => inner.abort(),
    draw: (op) => inner.draw(op),
    takeback: (op) => inner.takeback(op),
    rematch: (op) => inner.rematch(op),
    claim: (op) => inner.claim(op),
    say: (phrase) => inner.say(phrase),
    close: () => drop(entry),
  };
}

function changed(entry: Entry): void {
  if (entries.get(entry.key) !== entry) return;
  const view = entry.inner.getView();
  // Whichever side ends the game, it reaches My games (once: the record keeps count).
  if (view.status === 'over') recordLiveGame(view);
  // A game over (or gone) is not one to come back to after a restart.
  if (view.status === 'over' || view.missing) markGameOver(entry.source, entry.id);
  lifetime(entry);
  publish();
}

let checked = false;

/**
 * After a restart (the app closed by the phone, a reload elsewhere in the
 * app), connects once to every game this device may still be playing: one
 * still on shows in the bar, which leads back to its board; the others are
 * found to be over, noted, and let go.
 */
export function checkOnLiveGames(): void {
  if (checked) return;
  checked = true;
  for (const { source, id } of gamesToCheck()) getLiveGame(source, id);
}

/** A finished (or missing) game nobody shows is let go after a minute; anything else stays. */
function lifetime(entry: Entry): void {
  const view = entry.inner.getView();
  const finished = view.status === 'over' || view.missing;
  if (finished && entry.watchers === 0) {
    entry.timer ??= setTimeout(() => drop(entry), FINISHED_LINGER_MS);
  } else if (entry.timer !== null) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

function drop(entry: Entry): void {
  if (entry.timer !== null) clearTimeout(entry.timer);
  entry.timer = null;
  if (entries.get(entry.key) !== entry) return;
  entries.delete(entry.key);
  entry.stop();
  entry.inner.close();
  publish();
}

/** Closes every game connection (a test's clean slate). */
export function closeLiveGames(): void {
  for (const entry of [...entries.values()]) drop(entry);
  checked = false;
}

/** A game in progress on this device, for the bar that leads back to it. */
export interface ActiveGame {
  source: LiveSource;
  id: string;
  path: string;
  you: Side;
  opponent: string;
}

/** The games in progress on this device (normally none or one). */
export const useActiveGames = create<{ games: ActiveGame[] }>()(() => ({ games: [] }));

/** A game the bar can lead back to: known to be on (not one still loading, nor one that has gone). */
const inProgress = (view: LiveGameView) =>
  view.status === 'playing' && !view.missing && view.connection !== 'connecting';

function publish(): void {
  const games: ActiveGame[] = [];
  for (const entry of entries.values()) {
    const view = entry.inner.getView();
    if (!inProgress(view)) continue;
    games.push({
      source: entry.source,
      id: entry.id,
      path: liveGamePath(entry.source, entry.id),
      you: view.you,
      opponent: (view.you === 'white' ? view.black : view.white).name,
    });
  }
  const before = useActiveGames.getState().games;
  const same =
    before.length === games.length &&
    before.every((game, index) => {
      const now = games[index];
      return (
        game.source === now?.source &&
        game.id === now.id &&
        game.you === now.you &&
        game.opponent === now.opponent
      );
    });
  if (!same) useActiveGames.setState({ games });
  setBarReason('games', games.length > 0);
}

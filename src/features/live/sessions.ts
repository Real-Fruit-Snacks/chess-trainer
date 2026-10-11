import { create } from 'zustand';
import { useLichess } from '@/store/lichess';
import { isDuel } from '../../../relay/src/live/shared.mjs';
import { setBarReason } from './bar';
import { createLichessGame } from './lichessLive';
import { recordLiveGame } from './record';
import { createRelayDuel } from './relayDuel';
import { createRelayGame } from './relayGame';
import {
  gamesToCheck,
  LICHESS_GAME_ID,
  liveGamePath,
  markGameOver,
  rememberLichessGame,
  seatOf,
} from './seats';
import type {
  DuelSession,
  DuelView,
  GameKind,
  LiveGameSession,
  LiveGameView,
  LiveSource,
  Side,
} from './types';

/**
 * The game connections of this device, one per game whatever shows it (the
 * game page, the bar that leads back to it): games of chess (and their
 * variants) on the relay or on Lichess, and duels on the relay. A game in
 * progress stays connected wherever the player goes in the app; a finished
 * one is let go a minute after nothing shows it any more.
 */
export { liveGamePath, rememberSeat } from './seats';

/** A finished game's connection is closed once nothing has shown it for this long. */
export const FINISHED_LINGER_MS = 60_000;

/** What every connection offers, whichever kind it is. */
interface Connection {
  getView(): LiveGameView | DuelView;
  subscribe(listener: () => void): () => void;
  close(): void;
}

interface Entry {
  key: string;
  source: LiveSource;
  id: string;
  /** A duel's connection, rather than a game of chess's. */
  duel: boolean;
  /** The game's own connection. */
  inner: Connection;
  /** What callers get: the same game, its subscribers counted. */
  session: LiveGameSession | DuelSession;
  /** Subscribers other than this module. */
  watchers: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** This module's own subscription. */
  stop: () => void;
}

const entries = new Map<string, Entry>();

/**
 * The connection to a game of chess this device has a seat in (the same one
 * for every caller); null when it holds none (a link to someone else's game, a
 * game forgotten) or the seat is in a duel.
 */
export function getLiveGame(source: LiveSource, id: string): LiveGameSession | null {
  const key = `${source}:${id}`;
  const known = entries.get(key);
  if (known) return known.duel ? null : (known.session as LiveGameSession);
  const inner = openGame(source, id);
  return inner ? (track(key, source, id, false, inner) as LiveGameSession) : null;
}

/** The connection to a duel this device has a seat in; null when it holds none. */
export function getDuel(id: string): DuelSession | null {
  const key = `relay:${id}`;
  const known = entries.get(key);
  if (known) return known.duel ? (known.session as DuelSession) : null;
  const seat = seatOf(id);
  if (!seat || !isDuel(seat.kind)) return null;
  const inner = createRelayDuel(id, seat.seat, seat.color);
  return track(key, 'relay', id, true, inner) as DuelSession;
}

function openGame(source: LiveSource, id: string): LiveGameSession | null {
  if (source === 'relay') {
    const seat = seatOf(id);
    return seat && !isDuel(seat.kind) ? createRelayGame(id, seat.seat, seat.color) : null;
  }
  if (!LICHESS_GAME_ID.test(id) || !useLichess.getState().account) return null;
  rememberLichessGame(id);
  return createLichessGame(id);
}

function track(
  key: string,
  source: LiveSource,
  id: string,
  duel: boolean,
  inner: LiveGameSession | DuelSession,
): LiveGameSession | DuelSession {
  const entry: Entry = {
    key,
    source,
    id,
    duel,
    inner,
    session: inner,
    watchers: 0,
    timer: null,
    stop: () => undefined,
  };
  entry.session = counted(entry, inner);
  entries.set(key, entry);
  entry.stop = inner.subscribe(() => changed(entry));
  changed(entry);
  return entry.session;
}

/**
 * The session handed out: the game's own (its methods are closures, so they
 * travel as they are), with its subscribers counted for its lifetime.
 */
function counted<T extends LiveGameSession | DuelSession>(entry: Entry, inner: T): T {
  return {
    ...inner,
    getView: () => inner.getView(),
    subscribe: (listener: () => void) => {
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
    close: () => drop(entry),
  };
}

function changed(entry: Entry): void {
  if (entries.get(entry.key) !== entry) return;
  const view = entry.inner.getView();
  // Whichever side ends a game of chess, it reaches My games (once: the record keeps count).
  if (!entry.duel && view.status === 'over') recordLiveGame(view as LiveGameView);
  // A game over (or gone) is not one to come back to after a restart.
  if (view.status === 'over' || view.missing) markGameOver(entry.source, entry.id);
  lifetime(entry);
  publish();
}

let checked = false;

/**
 * After a restart (the app closed by the phone, a reload elsewhere in the
 * app), connects once to every game this device may still be playing: one
 * still on shows in the bar, which leads back to it; the others are found to
 * be over, noted, and let go.
 */
export function checkOnLiveGames(): void {
  if (checked) return;
  checked = true;
  for (const { source, id, kind } of gamesToCheck()) {
    if (isDuel(kind)) getDuel(id);
    else getLiveGame(source, id);
  }
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
  /** What is played: chess, a variant of it, or a duel. */
  kind: GameKind;
}

/** The games in progress on this device (normally none or one). */
export const useActiveGames = create<{ games: ActiveGame[] }>()(() => ({ games: [] }));

/**
 * A game the bar can lead back to: known to be on (its armies being chosen, a
 * duel waiting for its rounds), not one still loading, nor one that has gone.
 */
const inProgress = (view: LiveGameView | DuelView) =>
  view.status !== 'over' && !view.missing && view.connection !== 'connecting';

function publish(): void {
  const games: ActiveGame[] = [];
  for (const entry of entries.values()) {
    const view = entry.inner.getView();
    if (!inProgress(view)) continue;
    const kind: GameKind = view.game;
    games.push({
      source: entry.source,
      id: entry.id,
      path: liveGamePath(entry.source, entry.id, kind),
      you: view.you,
      opponent: (view.you === 'white' ? view.black : view.white).name,
      kind,
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
        game.opponent === now.opponent &&
        game.kind === now.kind
      );
    });
  if (!same) useActiveGames.setState({ games });
  setBarReason('games', games.length > 0);
}

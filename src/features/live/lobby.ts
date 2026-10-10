import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { playSound } from '@/lib/sound';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import {
  COLOR_CHOICES,
  ID_PATTERN,
  isRating,
  MAX_RATING,
  MIN_RATING,
  parseTimeControl,
  randomId,
  SEAT_PATTERN,
  type TimeControlSpec,
} from '../../../relay/src/live/shared.mjs';
import { setBarReason } from './bar';
import {
  abortLichessGame,
  checkLichessLive,
  type LichessLiveCheck,
  type LichessSeek,
  type LichessStart,
  lichessSeekAllowed,
  startLichessSeek,
} from './lichessLive';
import { useLivePrefs } from './prefs';
import { liveSocketUrl, relayHealthUrl } from './relayUrls';
import { liveGamePath, rememberSeat } from './seats';
import { LiveSocket } from './socket';
import type {
  ColorChoice,
  LichessSeekStatus,
  LivePlayer,
  LobbyState,
  MySeek,
  OpenGame,
  Pairing,
  Side,
} from './types';

/**
 * The waiting room (relay/src/live/lobby.mjs): the games posted, this
 * device's own, and the pairing that ends the wait. It is connected only
 * while something needs it — the waiting room page, a game posted from here,
 * a game being joined — and lets go two seconds after nothing does, so moving
 * between pages does not drop and remake the connection.
 *
 * A post can go to Lichess at the same time (its Board API seek). The first
 * acceptance wins and the other post is withdrawn; a game that slips through
 * the race on the other side (both accepted within a moment) is aborted at
 * once, so there is never more than one game.
 */

/** After nothing needs the waiting room any more, the connection stays this long. */
export const LINGER_MS = 2000;
/** A game posted again after a reconnection, refused (the relay still holds it under the old socket), is tried again this often… */
export const REPOST_RETRY_MS = 5000;
/** …this many times, about as long as a relay takes to notice a socket that died. */
export const REPOST_TRIES = 12;
const HEALTH_TIMEOUT_MS = 10_000;
/** The socket that aborts a game that lost the race gives up after this long (the room aborts it anyway). */
const ABORT_WITHIN_MS = 10_000;

export const GONE_NOTICE = 'That game is no longer open.';
export const UNAVAILABLE_NOTICE = 'Live games are not available right now.';
export const NOT_ALLOWED_MESSAGE =
  'Lichess takes rapid and slower games from apps, so this one waits here only.';
const CHECK_MESSAGES: Record<
  Exclude<LichessLiveCheck, 'ok'>,
  { status: LichessSeekStatus; message: string }
> = {
  'needs-permission': {
    status: 'needs-permission',
    message: 'Connect Lichess again to let the app play there.',
  },
  'signed-out': { status: 'signed-out', message: 'Sign in to Lichess to look there too.' },
  offline: { status: 'failed', message: 'Lichess could not be reached.' },
};
const LICHESS_FAILED = 'Lichess did not take the game.';

const isSide = (value: unknown): value is Side => value === 'white' || value === 'black';

/** The rating shown beside the name: the puzzle rating, when the player shows it. */
function shownRating(): number | null {
  if (!useLivePrefs.getState().showRating) return null;
  const rating = useProgress.getState().puzzleRating;
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(rating)));
}

function playerOf(value: unknown): LivePlayer {
  const player = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    name: typeof player.name === 'string' ? player.name : '',
    rating: isRating(player.rating) ? player.rating : null,
  };
}

/** A game the relay lists, checked; null when it is not one. */
function openGameOf(value: unknown): OpenGame | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, tc, color, name, rating } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || parseTimeControl(tc) === null) return null;
  if (!(COLOR_CHOICES as readonly unknown[]).includes(color) || typeof name !== 'string') {
    return null;
  }
  return {
    id,
    tc: tc as string,
    color: color as ColorChoice,
    name,
    rating: isRating(rating) ? rating : null,
  };
}

const isAbort = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { name?: unknown }).name === 'AbortError';

/** Runs something whose failure changes nothing here (it may throw, or give a promise that fails). */
function quietly(task: () => unknown): void {
  void Promise.resolve()
    .then(task)
    .catch(() => undefined);
}

/** Whether Lichess would take the time control (a check that fails counts as no). */
function allowedOnLichess(tc: TimeControlSpec): boolean {
  try {
    return lichessSeekAllowed(tc);
  } catch {
    return false;
  }
}

/** Withdraws a seek from Lichess (one that is gone already has nothing to withdraw). */
function withdraw(seek: LichessSeek): void {
  try {
    seek.cancel();
  } catch {
    // Gone already.
  }
}

/**
 * Aborts a relay game this device was paired into after it had already
 * started one on Lichess: takes the seat just long enough to abort.
 */
function abortRelayGame(game: string, seat: string): void {
  const url = liveSocketUrl(`/v1/games/${game}`);
  if (!url) return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    // The room aborts a game whose first move never comes by itself.
    return;
  }
  const giveUp = setTimeout(() => {
    try {
      ws.close();
    } catch {
      // Closed already.
    }
  }, ABORT_WITHIN_MS);
  ws.onopen = () => {
    clearTimeout(giveUp);
    try {
      ws.send(JSON.stringify({ t: 'hello', seat }));
      ws.send(JSON.stringify({ t: 'abort' }));
      ws.close(1000, 'Aborted');
    } catch {
      // Closed meanwhile: the room aborts the game in a minute anyway.
    }
  };
}

/** The Lichess side of one post. */
interface LichessRun {
  mineId: string;
  /** over: withdrawn, or failed. */
  state: 'checking' | 'seeking' | 'won' | 'over';
  handle: LichessSeek | null;
}

export type LobbyStore = UseBoundStore<StoreApi<LobbyState>> & {
  /** Closes the connection and stops everything (tests make a waiting room of their own). */
  dispose(): void;
};

/** A waiting room of its own; the app uses the one below, `useLobby`. */
export function createLobbyStore(): LobbyStore {
  /** Pages showing the waiting room. */
  let watchers = 0;
  /** The game being joined, until the relay answers. */
  let joining: string | null = null;
  let linger: ReturnType<typeof setTimeout> | null = null;
  /** The games the relay lists, this device's own included. */
  let listed: OpenGame[] = [];
  /** This post has gone to the relay before: sending it again is a re-post. */
  let sentBefore = false;
  /** The seek in flight is a re-post (after a reconnection). */
  let reposting = false;
  let repostTimer: ReturnType<typeof setTimeout> | null = null;
  let repostTries = 0;
  let lichess: LichessRun | null = null;
  /** A Lichess game won the race for the last post: a relay pairing that follows lost it. */
  let wonByLichess = false;
  let healthCheck = 0;
  let disposed = false;

  const relayConfigured = () => liveSocketUrl('/v1/lobby') !== null;

  const store = create<LobbyState>()((set, get) => ({
    connection: relayConfigured() ? 'idle' : 'unavailable',
    seeks: [],
    players: 0,
    mine: null,
    pairing: null,
    notice: null,

    watch: () => {
      watchers += 1;
      ensure();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        watchers -= 1;
        ensure();
      };
    },

    post: (options) => {
      if (disposed) return;
      const spec = parseTimeControl(options.tc);
      if (!spec || !(COLOR_CHOICES as readonly string[]).includes(options.color)) {
        set({ notice: 'That game cannot be posted.' });
        return;
      }
      // A new post replaces the one before, on Lichess too.
      stopLichess();
      clearRepost();
      wonByLichess = false;
      sentBefore = false;
      reposting = false;
      repostTries = 0;
      useLivePrefs.getState().update({ tc: spec.id, color: options.color });
      const mine: MySeek = {
        id: randomId(16),
        tc: spec.id,
        color: options.color,
        private: options.private,
        postedAt: Date.now(),
        relay: relayConfigured() ? 'posting' : 'failed',
        lichess: { status: 'off', rated: options.lichess?.rated ?? false, message: null },
      };
      setMine(mine);
      ensure();
      if (socket.state === 'open') sendSeek();
      // A game for people with the link stays off Lichess, where anyone could take it.
      if (options.lichess && !options.private) {
        startLichess(mine.id, spec, options.color, options.lichess.rated);
      }
    },

    cancel: () => {
      const { mine } = get();
      stopLichess();
      clearRepost();
      if (mine) {
        socket.send({ t: 'cancel' });
        setMine(null);
      }
      ensure();
    },

    join: (seekId) => {
      if (disposed) return;
      if (!ID_PATTERN.test(seekId)) {
        set({ notice: GONE_NOTICE });
        return;
      }
      if (get().mine?.id === seekId) {
        set({ notice: 'That is the game you posted: someone else joins it from its link.' });
        return;
      }
      if (!relayConfigured()) {
        set({ notice: UNAVAILABLE_NOTICE });
        return;
      }
      wonByLichess = false;
      joining = seekId;
      ensure();
      if (socket.state === 'open') sendJoin();
    },

    clearPairing: () => set({ pairing: null }),
    clearNotice: () => set({ notice: null }),
  }));
  const { getState: get, setState: set } = store;

  const socket = new LiveSocket(() => liveSocketUrl('/v1/lobby'), {
    open: onOpen,
    message: onMessage,
    down: onDown,
  });

  /* ---------------------------------------------------------------- */
  /* The connection                                                    */
  /* ---------------------------------------------------------------- */

  const needed = () => watchers > 0 || get().mine !== null || joining !== null;

  /** Connects when something needs the waiting room; lets go a moment after nothing does. */
  function ensure(): void {
    if (disposed) return;
    if (needed()) {
      if (linger !== null) clearTimeout(linger);
      linger = null;
      if (socket.state === 'idle') connect();
      return;
    }
    if (socket.state === 'idle') return;
    linger ??= setTimeout(() => {
      linger = null;
      if (!needed()) disconnect();
    }, LINGER_MS);
  }

  function connect(): void {
    if (!socket.connect()) {
      becomeUnavailable();
      return;
    }
    // A retry that goes early (back online) stays "retrying" until it opens.
    if (get().connection !== 'retrying') set({ connection: 'connecting' });
  }

  function disconnect(): void {
    socket.close();
    clearRepost();
    listed = [];
    set({
      connection: get().connection === 'unavailable' ? 'unavailable' : 'idle',
      seeks: [],
      players: 0,
    });
  }

  /** The relay runs no live games (or this build has none): nothing to retry. */
  function becomeUnavailable(): void {
    socket.close();
    clearRepost();
    listed = [];
    const { mine } = get();
    const patch: Partial<LobbyState> = { connection: 'unavailable', seeks: [], players: 0 };
    if (joining !== null) {
      joining = null;
      patch.notice = UNAVAILABLE_NOTICE;
    }
    if (mine && mine.relay !== 'failed') patch.mine = { ...mine, relay: 'failed' };
    set(patch);
  }

  function onOpen(): void {
    set({ connection: 'open' });
    if (get().mine) {
      // After a reconnection the same game goes up again, under the same id: its link still works.
      reposting = sentBefore;
      sendSeek();
    }
    if (joining !== null) sendJoin();
  }

  function onDown({ opened }: { code: number; opened: boolean }): void {
    clearRepost();
    if (!needed()) {
      listed = [];
      set({ connection: 'idle', seeks: [], players: 0 });
      return;
    }
    socket.retry();
    set({ connection: 'retrying' });
    // Never opened: perhaps the relay has no live games at all. Its health check says.
    if (!opened) void checkHealth();
  }

  async function checkHealth(): Promise<void> {
    const url = relayHealthUrl();
    if (!url) return;
    const check = ++healthCheck;
    let live: boolean | null = null;
    try {
      const response = await fetchWithTimeout(url, {
        cache: 'no-store',
        timeoutMs: HEALTH_TIMEOUT_MS,
      });
      if (response.ok) {
        const body = (await response.json()) as { live?: unknown } | null;
        live = body?.live === true;
      }
    } catch {
      // No answer: the relay may only be out of reach, which the retries are for.
    }
    if (disposed || check !== healthCheck || live !== false) return;
    if (get().connection === 'open') return;
    becomeUnavailable();
  }

  /* ---------------------------------------------------------------- */
  /* Messages                                                          */
  /* ---------------------------------------------------------------- */

  /** The listed games without this device's own. */
  const visible = (mine: MySeek | null) =>
    mine ? listed.filter((game) => game.id !== mine.id) : listed;

  function setMine(mine: MySeek | null, extra: Partial<LobbyState> = {}): void {
    set({ ...extra, mine, seeks: visible(mine) });
  }

  function sendSeek(): void {
    const { mine } = get();
    if (!mine) return;
    const sent = socket.send({
      t: 'seek',
      id: mine.id,
      tc: mine.tc,
      color: mine.color,
      name: useLivePrefs.getState().name,
      rating: shownRating(),
      private: mine.private,
    });
    if (!sent) return;
    sentBefore = true;
    if (mine.relay !== 'posting') setMine({ ...mine, relay: 'posting' });
  }

  function sendJoin(): void {
    if (joining === null) return;
    socket.send({
      t: 'join',
      seek: joining,
      name: useLivePrefs.getState().name,
      rating: shownRating(),
    });
  }

  function clearRepost(): void {
    if (repostTimer !== null) clearTimeout(repostTimer);
    repostTimer = null;
  }

  function onMessage(message: Record<string, unknown>): void {
    switch (message.t) {
      case 'lobby': {
        socket.settled();
        listed = Array.isArray(message.seeks)
          ? message.seeks.flatMap((seek: unknown) => openGameOf(seek) ?? [])
          : [];
        const players = typeof message.players === 'number' ? message.players : get().players;
        set({ seeks: visible(get().mine), players });
        return;
      }
      case 'posted': {
        const { mine } = get();
        const seek = message.seek as { id?: unknown } | null;
        // An answer to an earlier post (replaced since) is not this one's.
        if (!mine || seek?.id !== mine.id) return;
        clearRepost();
        reposting = false;
        repostTries = 0;
        setMine({ ...mine, relay: 'posted' });
        return;
      }
      case 'paired':
        return onPaired(message);
      case 'gone':
        joining = null;
        set({ notice: GONE_NOTICE });
        ensure();
        return;
      case 'error':
        return onError(message);
      default:
        // 'cancelled': this side knew already.
        return;
    }
  }

  function onError(message: Record<string, unknown>): void {
    const text = typeof message.message === 'string' ? message.message : 'That was refused.';
    const { mine } = get();
    if (message.code === 'failed') {
      // The game could not be made: the relay has dropped both posts.
      joining = null;
      if (mine) setMine({ ...mine, relay: 'failed' });
      set({ notice: text });
      ensure();
      return;
    }
    if (mine?.relay === 'posting') {
      if (reposting && repostTries < REPOST_TRIES) {
        // Most likely the relay still holds the game under the socket that died: try again shortly.
        repostTries += 1;
        clearRepost();
        repostTimer = setTimeout(() => {
          repostTimer = null;
          if (get().mine?.id !== mine.id) return;
          reposting = true;
          sendSeek();
        }, REPOST_RETRY_MS);
        return;
      }
      setMine({ ...mine, relay: 'failed' }, { notice: text });
      return;
    }
    if (joining !== null) {
      joining = null;
      set({ notice: text });
      ensure();
      return;
    }
    set({ notice: text });
  }

  function onPaired(message: Record<string, unknown>): void {
    const { game, seat, color, tc } = message;
    if (typeof game !== 'string' || !ID_PATTERN.test(game)) return;
    if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat) || !isSide(color)) return;
    if (typeof tc !== 'string' || parseTimeControl(tc) === null) return;
    joining = null;
    if (wonByLichess || lichess?.state === 'won') {
      // Lichess paired this post first: the relay game is called off before anyone moves.
      abortRelayGame(game, seat);
      ensure();
      return;
    }
    rememberSeat(game, seat, color);
    stopLichess();
    clearRepost();
    paired({
      source: 'relay',
      game,
      color,
      tc,
      opponent: playerOf(message.opponent),
      at: Date.now(),
      path: liveGamePath('relay', game),
    });
  }

  function paired(pairing: Pairing): void {
    setMine(null, { pairing });
    playSound('notify');
    ensure();
  }

  /* ---------------------------------------------------------------- */
  /* Lichess                                                           */
  /* ---------------------------------------------------------------- */

  function setLichess(run: LichessRun, status: LichessSeekStatus, message: string | null = null) {
    const { mine } = get();
    if (lichess !== run || mine?.id !== run.mineId) return;
    setMine({ ...mine, lichess: { ...mine.lichess, status, message } });
  }

  function startLichess(
    mineId: string,
    tc: TimeControlSpec,
    color: ColorChoice,
    rated: boolean,
  ): void {
    const run: LichessRun = { mineId, state: 'checking', handle: null };
    lichess = run;
    if (!useLichess.getState().account) {
      setLichess(run, 'signed-out', CHECK_MESSAGES['signed-out'].message);
      run.state = 'over';
      return;
    }
    if (!allowedOnLichess(tc)) {
      setLichess(run, 'not-allowed', NOT_ALLOWED_MESSAGE);
      run.state = 'over';
      return;
    }
    setLichess(run, 'checking');
    // Whatever goes wrong on the Lichess side stays there: the post here goes on regardless.
    Promise.resolve()
      .then(checkLichessLive)
      .then(
        (check) => {
          if (run.state !== 'checking') return;
          if (check !== 'ok') {
            const { status, message } = CHECK_MESSAGES[check];
            setLichess(run, status, message);
            run.state = 'over';
            return;
          }
          seekOnLichess(run, tc, color, rated);
        },
        (error: unknown) => failLichess(run, error),
      );
  }

  function seekOnLichess(
    run: LichessRun,
    tc: TimeControlSpec,
    color: ColorChoice,
    rated: boolean,
  ): void {
    let handle: LichessSeek;
    try {
      handle = startLichessSeek({ tc, color, rated });
    } catch (error) {
      failLichess(run, error);
      return;
    }
    run.handle = handle;
    run.state = 'seeking';
    setLichess(run, 'posting');
    handle.posted.then(
      () => {
        if (run.state === 'seeking') setLichess(run, 'posted');
      },
      (error: unknown) => failLichess(run, error),
    );
    handle.started.then(
      (start) => lichessStarted(run, start),
      (error: unknown) => failLichess(run, error),
    );
  }

  /** A failure on Lichess: the post stays up here (an abort is this side withdrawing it). */
  function failLichess(run: LichessRun, error: unknown): void {
    if (isAbort(error) || run.state === 'over' || run.state === 'won') return;
    setLichess(
      run,
      'failed',
      error instanceof Error && error.message ? error.message : LICHESS_FAILED,
    );
    run.state = 'over';
    if (run.handle) withdraw(run.handle);
  }

  function lichessStarted(run: LichessRun, start: LichessStart): void {
    if (run.state !== 'seeking' || lichess !== run || get().mine?.id !== run.mineId) {
      // Withdrawn (paired here first, cancelled, or replaced), yet Lichess started it: call it off.
      quietly(() => abortLichessGame(start.gameId));
      return;
    }
    run.state = 'won';
    wonByLichess = true;
    clearRepost();
    // The relay's post goes; a pairing it made meanwhile is aborted when it arrives.
    socket.send({ t: 'cancel' });
    paired({
      source: 'lichess',
      game: start.gameId,
      color: start.color,
      tc: start.tc,
      opponent: start.opponent,
      at: Date.now(),
      path: liveGamePath('lichess', start.gameId),
    });
  }

  /** Withdraws the Lichess side of the current post, if it is still looking. */
  function stopLichess(): void {
    const run = lichess;
    lichess = null;
    if (!run || (run.state !== 'checking' && run.state !== 'seeking')) return;
    run.state = 'over';
    if (run.handle) withdraw(run.handle);
  }

  store.subscribe((state, previous) => {
    if (state.mine === previous.mine && state.pairing === previous.pairing) return;
    setBarReason('lobby', state.mine !== null || state.pairing !== null);
  });

  return Object.assign(store, {
    dispose: () => {
      disposed = true;
      if (linger !== null) clearTimeout(linger);
      linger = null;
      clearRepost();
      stopLichess();
      socket.dispose();
    },
  });
}

/** The waiting room, one per app. */
export const useLobby = createLobbyStore();

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { playSound } from '@/lib/sound';
import { useLichess } from '@/store/lichess';
import {
  COLOR_CHOICES,
  CORRESPONDENCE_GAMES,
  gameOptions,
  ID_PATTERN,
  isCorrespondence,
  isDuel,
  isGame,
  isRating,
  parseTimeControl,
  randomId,
  SEAT_PATTERN,
  seekIdOf,
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
import { pairingNotice } from './notify';
import { shownRating, useLivePrefs } from './prefs';
import { liveSocketUrl, relayHealthUrl } from './relayUrls';
import { liveGamePath, rememberSeat } from './seats';
import { LiveSocket } from './socket';
import type {
  ColorChoice,
  GameKind,
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
 *
 * A correspondence game is no post: `invite` has the waiting room make its
 * room at once (`create`), with this device's seat and one open for the friend
 * who gets the link; the seat is kept, and the board is where to go next.
 *
 * A post goes up with a secret made here, and under the id the secret gives
 * (the first 16 bytes of its SHA-256: `seekIdOf`), which the relay checks.
 * After a reconnection it goes up again with the same secret, so under the
 * same id: the link shared before still finds it, and the relay hands it over
 * from the old socket if it still holds it. Nobody without the secret can post
 * under the id. A post's key (secret and id) is made ahead, as hashing takes a
 * moment, so that posting is at once.
 */

/** After nothing needs the waiting room any more, the connection stays this long. */
export const LINGER_MS = 2000;
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

/** A post's secret, and its id: the secret's, as the relay checks. */
interface SeekKey {
  id: string;
  secret: string;
}

/** A new post's key: a random secret, and the id it gives. */
async function newSeekKey(): Promise<SeekKey> {
  const secret = randomId(32);
  return { id: await seekIdOf(secret), secret };
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

/** A game the relay lists, checked; null when it is not one (or one this app does not know). */
function openGameOf(value: unknown): OpenGame | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, tc, color, name, rating } = value as Record<string, unknown>;
  // A listing without a game is a game of chess (a relay older than the other games).
  const game: unknown = (value as Record<string, unknown>).game ?? 'chess';
  if (!isGame(game)) return null;
  const opts = gameOptions(game, (value as Record<string, unknown>).opts);
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || !opts) return null;
  const duel = isDuel(game);
  if (!duel && parseTimeControl(tc) === null) return null;
  if (!(COLOR_CHOICES as readonly unknown[]).includes(color) || typeof name !== 'string') {
    return null;
  }
  return {
    id,
    game,
    opts,
    tc: duel ? null : (tc as string),
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
  /** The correspondence game being made, until the relay answers; whether it has gone. */
  let inviting: { game: GameKind; tc: string; color: ColorChoice } | null = null;
  let inviteSent = false;
  let linger: ReturnType<typeof setTimeout> | null = null;
  /** The games the relay lists, this device's own included. */
  let listed: OpenGame[] = [];
  /** The secret of the post (`mine`), sent with it every time it goes up. */
  let secret: string | null = null;
  /** The next post's key, made ahead: `spare` once made, `coming` while it is being made. */
  let spare: SeekKey | null = null;
  let coming = makeKey();
  /** Posts and cancels so far: a post waiting for its key goes up only if nothing came after. */
  let posts = 0;
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
      if (disposed) return Promise.resolve();
      const game: GameKind = options.game ?? 'chess';
      const duel = isDuel(game);
      const opts = gameOptions(game, options.opts ?? {});
      const spec = duel ? null : parseTimeControl(options.tc);
      // A duel has no colours: the poster hosts it.
      const color: ColorChoice = duel ? 'random' : options.color;
      if (!opts || (!duel && !spec) || !(COLOR_CHOICES as readonly string[]).includes(color)) {
        set({ notice: 'That game cannot be posted.' });
        return Promise.resolve();
      }
      const post = ++posts;
      /** Puts the post up under its key (unless another post, or a cancel, came meanwhile). */
      const begin = ({ id, secret: made }: SeekKey): void => {
        if (disposed || post !== posts) return;
        // A new post replaces the one before, on Lichess too.
        stopLichess();
        wonByLichess = false;
        secret = made;
        if (game === 'chess' && spec) useLivePrefs.getState().update({ tc: spec.id, color });
        const mine: MySeek = {
          id,
          game,
          opts,
          tc: spec?.id ?? null,
          color,
          private: options.private,
          postedAt: Date.now(),
          relay: relayConfigured() ? 'posting' : 'failed',
          lichess: { status: 'off', rated: options.lichess?.rated ?? false, message: null },
        };
        setMine(mine);
        ensure();
        if (socket.state === 'open') sendSeek();
        // A game for people with the link stays off Lichess, where anyone could take it; Lichess
        // plays chess only.
        if (options.lichess && !options.private && game === 'chess' && spec) {
          startLichess(mine.id, spec, color, options.lichess.rated);
        }
      };
      // Its key is ready (made ahead) but for a post right after another: then it waits for it.
      const key = takeKey();
      if (!(key instanceof Promise)) {
        begin(key);
        return Promise.resolve();
      }
      return key.then(begin, () => {
        if (!disposed && post === posts) set({ notice: 'That game cannot be posted.' });
      });
    },

    cancel: () => {
      const { mine } = get();
      // A post still waiting for its key goes no further.
      posts += 1;
      stopLichess();
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

    invited: null,

    invite: (options) => {
      if (disposed) return;
      const game: GameKind = options.game ?? 'chess';
      if (
        !CORRESPONDENCE_GAMES.includes(game) ||
        !isCorrespondence(options.tc) ||
        !(COLOR_CHOICES as readonly string[]).includes(options.color)
      ) {
        set({ notice: 'That game cannot be made.' });
        return;
      }
      if (!relayConfigured()) {
        set({ notice: UNAVAILABLE_NOTICE });
        return;
      }
      inviting = { game, tc: options.tc, color: options.color };
      inviteSent = false;
      ensure();
      if (socket.state === 'open') sendInvite();
    },

    clearPairing: () => set({ pairing: null }),
    clearInvited: () => set({ invited: null }),
    clearNotice: () => set({ notice: null }),
  }));
  const { getState: get, setState: set } = store;

  /** Makes the next post's key, which becomes the spare once made (unless taken meanwhile). */
  function makeKey(): Promise<SeekKey> {
    const made = newSeekKey();
    made.then(
      (key) => {
        if (coming === made) spare = key;
      },
      () => undefined,
    );
    return made;
  }

  /** The next post's key: at once when it is ready, else when it is; the one after is begun. */
  function takeKey(): SeekKey | Promise<SeekKey> {
    const key = spare ?? coming;
    spare = null;
    coming = makeKey();
    return key;
  }

  const socket = new LiveSocket(() => liveSocketUrl('/v1/lobby'), {
    open: onOpen,
    message: onMessage,
    down: onDown,
  });

  /* ---------------------------------------------------------------- */
  /* The connection                                                    */
  /* ---------------------------------------------------------------- */

  const needed = () => watchers > 0 || get().mine !== null || joining !== null || inviting !== null;

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
    listed = [];
    const { mine } = get();
    const patch: Partial<LobbyState> = { connection: 'unavailable', seeks: [], players: 0 };
    if (joining !== null || inviting !== null) {
      joining = null;
      inviting = null;
      patch.notice = UNAVAILABLE_NOTICE;
    }
    if (mine && mine.relay !== 'failed') patch.mine = { ...mine, relay: 'failed' };
    set(patch);
  }

  function onOpen(): void {
    set({ connection: 'open' });
    // After a reconnection the same game goes up again, under the same id and
    // secret: its link still works, and the relay hands it over from the old
    // socket if it still holds that.
    if (get().mine) sendSeek();
    if (joining !== null) sendJoin();
    if (inviting !== null) sendInvite();
  }

  function onDown({ opened }: { code: number; opened: boolean }): void {
    if (inviting !== null && inviteSent) {
      // Its answer is lost with the socket: better to say so than to make a second game.
      inviting = null;
      set({ notice: 'The invitation could not be made: try again.' });
    }
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
      game: mine.game,
      opts: mine.opts,
      tc: mine.tc,
      color: mine.color,
      name: useLivePrefs.getState().name,
      rating: shownRating(),
      private: mine.private,
      secret,
    });
    if (!sent) return;
    if (mine.relay !== 'posting') setMine({ ...mine, relay: 'posting' });
  }

  function sendInvite(): void {
    if (inviting === null || inviteSent) return;
    inviteSent = socket.send({
      t: 'create',
      game: inviting.game,
      opts: {},
      tc: inviting.tc,
      color: inviting.color,
      name: useLivePrefs.getState().name,
      rating: shownRating(),
    });
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
        setMine({ ...mine, relay: 'posted' });
        return;
      }
      case 'paired':
        return onPaired(message);
      case 'created':
        return onCreated(message);
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
    // The relay took back the game waiting here, and says why (this network left its last games
    // before the first move): it is no longer posted there.
    if (mine && typeof message.seek === 'string' && message.seek === mine.id) {
      setMine({ ...mine, relay: 'failed' }, { notice: text });
      return;
    }
    if (inviting !== null && inviteSent) {
      inviting = null;
      set({ notice: text });
      ensure();
      return;
    }
    if (message.code === 'failed') {
      // The game could not be made: the relay has dropped both posts.
      joining = null;
      if (mine) setMine({ ...mine, relay: 'failed' });
      set({ notice: text });
      ensure();
      return;
    }
    if (mine?.relay === 'posting') {
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
    // A pairing without a kind is a game of chess (a relay older than the other games).
    const kind: unknown = message.kind ?? 'chess';
    if (typeof game !== 'string' || !ID_PATTERN.test(game) || !isGame(kind)) return;
    if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat) || !isSide(color)) return;
    const duel = isDuel(kind);
    if (!duel && (typeof tc !== 'string' || parseTimeControl(tc) === null)) return;
    joining = null;
    if (wonByLichess || lichess?.state === 'won') {
      // Lichess paired this post first: the relay game is called off before anyone moves.
      abortRelayGame(game, seat);
      ensure();
      return;
    }
    rememberSeat(game, seat, color, kind);
    stopLichess();
    paired({
      source: 'relay',
      game,
      kind,
      opts: gameOptions(kind, message.opts) ?? {},
      color,
      tc: duel ? null : (tc as string),
      opponent: playerOf(message.opponent),
      at: Date.now(),
      path: liveGamePath('relay', game, kind),
    });
  }

  /** The correspondence game is made: its seat is kept, and its board is where to go. */
  function onCreated(message: Record<string, unknown>): void {
    const { game, seat, color, tc } = message;
    if (inviting === null) return;
    const asked = inviting.game;
    inviting = null;
    if (typeof game !== 'string' || !ID_PATTERN.test(game) || !isCorrespondence(tc)) return;
    if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat) || !isSide(color)) return;
    const kind = isGame(message.kind) ? message.kind : asked;
    rememberSeat(game, seat, color, kind, Date.now(), true);
    set({ invited: { game, path: liveGamePath('relay', game, kind) } });
    ensure();
  }

  function paired(pairing: Pairing): void {
    setMine(null, { pairing });
    playSound('notify');
    pairingNotice(pairing);
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
    // The relay's post goes; a pairing it made meanwhile is aborted when it arrives.
    socket.send({ t: 'cancel' });
    paired({
      source: 'lichess',
      game: start.gameId,
      kind: 'chess',
      opts: {},
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
      stopLichess();
      socket.dispose();
    },
  });
}

/** The waiting room, one per app. */
export const useLobby = createLobbyStore();

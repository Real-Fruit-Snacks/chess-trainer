import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveBar } from '@/app/liveBar';
import type * as SoundModule from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import {
  type FakeLiveRelay,
  installFakeLiveRelay,
  type Message,
  type RelayClient,
  stubHealth,
} from '@/test/fakeLiveHub';
import { LIMITS, MIN_RATING, parseTimeControl } from '../../../relay/src/live/shared.mjs';

vi.mock('./lichessLive', () => ({
  checkLichessLive: vi.fn(),
  lichessSeekAllowed: vi.fn(),
  startLichessSeek: vi.fn(),
  abortLichessGame: vi.fn(),
  createLichessGame: vi.fn(),
  reconnectLichessForLive: vi.fn(),
}));

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: vi.fn() };
});

import { playSound } from '@/lib/sound';
import {
  abortLichessGame,
  checkLichessLive,
  type LichessSeek,
  type LichessStart,
  lichessSeekAllowed,
  startLichessSeek,
} from './lichessLive';
import {
  createLobbyStore,
  GONE_NOTICE,
  LINGER_MS,
  type LobbyStore,
  NOT_ALLOWED_MESSAGE,
  REPOST_RETRY_MS,
  UNAVAILABLE_NOTICE,
} from './lobby';
import { useLivePrefs } from './prefs';
import { seatOf } from './seats';
import type { PostOptions } from './types';

const ME = 'Patient Bishop';
const THEM = 'Swift Knight';

let relay: FakeLiveRelay;
let lobby: LobbyStore;

beforeEach(() => {
  localStorage.clear();
  relay = installFakeLiveRelay();
  // The relay runs live games: a failed connection is only out of reach.
  stubHealth(true);
  useLichess.setState({ account: null });
  useProgress.setState({ puzzleRating: 1523.6 });
  useLivePrefs.getState().update({ name: ME, showRating: true, color: 'random', tc: '10+0' });
  vi.mocked(playSound).mockClear();
  vi.mocked(checkLichessLive).mockReset();
  vi.mocked(lichessSeekAllowed).mockReset();
  vi.mocked(startLichessSeek).mockReset();
  vi.mocked(abortLichessGame).mockReset().mockResolvedValue(undefined);
  lobby = createLobbyStore();
});

afterEach(() => {
  lobby.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const state = () => lobby.getState();

const post = (options: Partial<PostOptions> = {}) =>
  state().post({ tc: '10+0', color: 'random', private: false, lichess: null, ...options });

/** The app's waiting-room socket that is open now. */
const lobbySocket = () => relay.openSockets('/v1/lobby')[0];

/** What the app sent the waiting room, over every socket, in order. */
const sentToLobby = (): Message[] =>
  relay.sockets.filter((s) => s.path === '/v1/lobby').flatMap((s) => s.sentMessages());

/** Another player in the waiting room, with a game posted. */
async function otherPlayer(seek: Partial<Message> = {}): Promise<RelayClient> {
  const other = relay.lobbyClient();
  await other.send({
    t: 'seek',
    tc: '10+0',
    color: 'random',
    name: THEM,
    rating: null,
    private: false,
    ...seek,
  });
  await relay.settle();
  return other;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** A Lichess seek the test settles; `cancel` rejects `started` as the real one does, unless told not to. */
function lichessSeek({ cancelAborts = true } = {}) {
  const posted = deferred<void>();
  const started = deferred<LichessStart>();
  const seek: LichessSeek = {
    posted: posted.promise,
    started: started.promise,
    cancel: vi.fn(() => {
      if (cancelAborts) started.reject(new DOMException('Withdrawn.', 'AbortError'));
    }),
  };
  return { seek, posted, started };
}

const lichessStart = (over: Partial<LichessStart> = {}): LichessStart => ({
  gameId: 'LiChEsS1',
  color: 'black',
  opponent: { name: 'someone', rating: 1810, title: null },
  rated: true,
  tc: '10+0',
  ...over,
});

const account = {
  id: 'learner',
  username: 'learner',
  token: 'lip_x',
  connectedAt: 1,
  expiresAt: null,
};

/** Lets promise callbacks (the Lichess side) run. */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('the waiting room', () => {
  it('connects while watched, lists the games, and lets go two seconds after', async () => {
    vi.useFakeTimers();
    expect(state().connection).toBe('idle');
    const release = state().watch();
    expect(state().connection).toBe('connecting');
    await relay.settle();
    expect(state()).toMatchObject({ connection: 'open', players: 1, seeks: [] });
    const other = await otherPlayer({ tc: '3+0' });
    expect(state().players).toBe(2);
    expect(state().seeks).toEqual([
      { id: expect.any(String) as string, tc: '3+0', color: 'random', name: THEM, rating: null },
    ]);
    // A page that shows the room twice (or remounts) holds it once more; a release is once only.
    const second = state().watch();
    second();
    second();
    release();
    await vi.advanceTimersByTimeAsync(LINGER_MS - 1);
    await relay.settle();
    expect(state().connection).toBe('open');
    // Back within the two seconds (a route change): the same connection carries on.
    const back = state().watch();
    await vi.advanceTimersByTimeAsync(LINGER_MS * 2);
    await relay.settle();
    expect(relay.sockets).toHaveLength(1);
    back();
    await vi.advanceTimersByTimeAsync(LINGER_MS);
    await relay.settle();
    expect(state()).toMatchObject({ connection: 'idle', seeks: [], players: 0 });
    expect(relay.openSockets()).toHaveLength(0);
    expect(other.last('lobby')).toMatchObject({ players: 1 });
  });

  it('posts a game under its own id, leaves it out of its own list, and cancels it', async () => {
    const release = state().watch();
    await relay.settle();
    const other = await otherPlayer({ tc: '3+0' });
    // The other game waited longer: it is listed first.
    await relay.advance(1000);
    post({ tc: '5+3', color: 'white', private: false });
    const mine = state().mine!;
    expect(mine).toMatchObject({
      tc: '5+3',
      color: 'white',
      private: false,
      relay: 'posting',
      lichess: { status: 'off', rated: false, message: null },
    });
    expect(mine.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // The choice is remembered for next time.
    expect(useLivePrefs.getState()).toMatchObject({ tc: '5+3', color: 'white' });
    await relay.settle();
    expect(state().mine).toMatchObject({ id: mine.id, relay: 'posted' });
    expect(sentToLobby().at(-1)).toEqual({
      t: 'seek',
      id: mine.id,
      tc: '5+3',
      color: 'white',
      name: ME,
      rating: 1524,
      private: false,
    });
    expect(other.last('lobby')!.seeks).toEqual([
      expect.objectContaining({ tc: '3+0', name: THEM }),
      { id: mine.id, tc: '5+3', color: 'white', name: ME, rating: 1524 },
    ]);
    expect(state().seeks.map((s) => s.name)).toEqual([THEM]);
    expect(useLiveBar.getState().active).toBe(true);

    state().cancel();
    expect(state().mine).toBeNull();
    await relay.settle();
    expect(other.last('lobby')!.seeks).toHaveLength(1);
    expect(useLiveBar.getState().active).toBe(false);
    release();
  });

  it('stays connected while its game waits, wherever the player goes', async () => {
    vi.useFakeTimers();
    post({ private: true });
    expect(state().connection).toBe('connecting');
    await relay.settle();
    expect(state().mine?.relay).toBe('posted');
    await vi.advanceTimersByTimeAsync(LINGER_MS * 5);
    await relay.settle();
    expect(lobbySocket()).toBeDefined();
    state().cancel();
    await vi.advanceTimersByTimeAsync(LINGER_MS);
    await relay.settle();
    expect(lobbySocket()).toBeUndefined();
    expect(state().connection).toBe('idle');
  });

  it('shows a rating only when asked, within the relay’s range', async () => {
    useProgress.setState({ puzzleRating: 40 });
    post();
    await relay.settle();
    expect(sentToLobby().at(-1)).toMatchObject({ rating: MIN_RATING });
    useLivePrefs.getState().update({ showRating: false });
    post();
    await relay.settle();
    expect(sentToLobby().at(-1)).toMatchObject({ rating: null });
  });

  it('pairs at once with a matching game, and keeps the seat', async () => {
    const other = await otherPlayer({ tc: '5+3' });
    post({ tc: '5+3' });
    await relay.settle();
    const pairing = state().pairing!;
    expect(pairing).toMatchObject({
      source: 'relay',
      tc: '5+3',
      opponent: { name: THEM, rating: null },
    });
    expect(pairing.path).toBe(`/play/online/${pairing.game}`);
    expect(state().mine).toBeNull();
    expect(other.last('paired')).toMatchObject({ game: pairing.game, opponent: { name: ME } });
    expect(seatOf(pairing.game)).toMatchObject({ color: pairing.color });
    expect(playSound).toHaveBeenCalledWith('notify');
    expect(useLiveBar.getState().active).toBe(true);
    state().clearPairing();
    expect(state().pairing).toBeNull();
    expect(useLiveBar.getState().active).toBe(false);
  });

  it('joins a game by its id, a private one too, and says when one is gone', async () => {
    const other = await otherPlayer({ private: true });
    const id = (other.last('posted')!.seek as { id: string }).id;
    state().join(id);
    expect(state().connection).toBe('connecting');
    await relay.settle();
    expect(sentToLobby().at(-1)).toEqual({ t: 'join', seek: id, name: ME, rating: 1524 });
    expect(state().pairing).toMatchObject({ source: 'relay', opponent: { name: THEM } });
    expect(other.last('paired')).toMatchObject({ opponent: { name: ME, rating: 1524 } });

    state().join(id);
    await relay.settle();
    expect(state().notice).toBe(GONE_NOTICE);
    state().clearNotice();
    expect(state().notice).toBeNull();
    state().join('not-an-id');
    expect(state().notice).toBe(GONE_NOTICE);
  });

  it('will not join its own game, and refuses a game that cannot be posted', async () => {
    post({ private: true });
    await relay.settle();
    state().join(state().mine!.id);
    expect(state().notice).toMatch(/you posted/);
    state().clearNotice();
    post({ tc: '0+0' });
    expect(state().notice).toBe('That game cannot be posted.');
  });

  it('posts the game again under the same id after a dropped connection, so its link works', async () => {
    vi.useFakeTimers();
    post({ private: true });
    await relay.settle();
    const id = state().mine!.id;
    relay.drop(lobbySocket()!);
    await relay.settle();
    expect(state().connection).toBe('retrying');
    await vi.advanceTimersByTimeAsync(1200);
    await relay.settle();
    expect(state().connection).toBe('open');
    expect(state().mine).toMatchObject({ id, relay: 'posted' });
    expect(sentToLobby().filter((m) => m.t === 'seek')).toEqual([
      expect.objectContaining({ id }),
      expect.objectContaining({ id }),
    ]);
    // The link shared before the drop still finds the game.
    const friend = relay.lobbyClient();
    await friend.send({ t: 'join', seek: id, name: THEM, rating: null });
    await relay.settle();
    expect(state().pairing).toMatchObject({ source: 'relay', opponent: { name: THEM } });
  });

  it('keeps trying to post again while the relay still holds the game under the lost socket', async () => {
    vi.useFakeTimers();
    post({ private: true });
    await relay.settle();
    const id = state().mine!.id;
    const lost = lobbySocket()!;
    // The network goes; the relay does not notice yet.
    relay.drop(lost, { relayNotices: false });
    await relay.settle();
    await vi.advanceTimersByTimeAsync(1200);
    await relay.settle();
    expect(state().connection).toBe('open');
    // Refused (the id is held), quietly tried again.
    expect(state().mine).toMatchObject({ id, relay: 'posting' });
    expect(state().notice).toBeNull();
    await vi.advanceTimersByTimeAsync(REPOST_RETRY_MS);
    await relay.settle();
    expect(state().mine?.relay).toBe('posting');
    relay.forget(lost);
    await relay.settle();
    await vi.advanceTimersByTimeAsync(REPOST_RETRY_MS);
    await relay.settle();
    expect(state().mine).toMatchObject({ id, relay: 'posted' });
  });

  it('pings every 25 seconds and gives up a connection that has gone quiet', async () => {
    vi.useFakeTimers();
    state().watch();
    await relay.settle();
    const first = lobbySocket()!;
    await vi.advanceTimersByTimeAsync(25_000);
    await relay.settle();
    expect(first.sent.filter((t) => t === 'ping')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await relay.settle();
    expect(state().connection).toBe('open');
    relay.silence(first);
    await vi.advanceTimersByTimeAsync(15_000 + 10_000);
    await relay.settle();
    expect(first.closedBy).toBe('app');
    expect(state().connection).toBe('retrying');
    await vi.advanceTimersByTimeAsync(1200);
    await relay.settle();
    expect(state().connection).toBe('open');
    expect(lobbySocket()).not.toBe(first);
  });

  it('waits longer after each failure, and tries at once when back online or in view', async () => {
    vi.useFakeTimers();
    relay.offline = true;
    state().watch();
    await relay.settle();
    expect(state().connection).toBe('retrying');
    for (const wait of [1000, 2000, 4000, 8000, 15_000, 15_000]) {
      const before = relay.sockets.length;
      await vi.advanceTimersByTimeAsync(wait - 1);
      await relay.settle();
      expect(relay.sockets).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(wait * 0.2 + 1);
      await relay.settle();
      expect(relay.sockets).toHaveLength(before + 1);
    }
    expect(state().connection).toBe('retrying');
    // Back online: no waiting.
    relay.offline = false;
    window.dispatchEvent(new Event('online'));
    await relay.settle();
    expect(state().connection).toBe('open');
    // A good connection starts the waits over: one second after the next drop.
    relay.drop(lobbySocket()!);
    await relay.settle();
    await vi.advanceTimersByTimeAsync(1200);
    await relay.settle();
    expect(state().connection).toBe('open');
    // A page coming back into view tries at once too.
    relay.drop(lobbySocket()!);
    await relay.settle();
    const count = relay.sockets.length;
    document.dispatchEvent(new Event('visibilitychange'));
    await relay.settle();
    expect(relay.sockets).toHaveLength(count + 1);
    expect(state().connection).toBe('open');
  });

  it('is unavailable without a relay, or when the relay has no live games', async () => {
    vi.useFakeTimers();
    const relayAddress = siteConfig.syncRelay;
    const config = siteConfig as { syncRelay: string };
    config.syncRelay = '';
    try {
      const without = createLobbyStore();
      expect(without.getState().connection).toBe('unavailable');
      const release = without.getState().watch();
      without.getState().post({ tc: '5+3', color: 'random', private: false, lichess: null });
      expect(without.getState().mine?.relay).toBe('failed');
      without.getState().join('a'.repeat(22));
      expect(without.getState().notice).toBe(UNAVAILABLE_NOTICE);
      expect(without.getState().connection).toBe('unavailable');
      expect(relay.sockets).toHaveLength(0);
      release();
      without.dispose();
    } finally {
      config.syncRelay = relayAddress;
    }

    // A relay that answers its health check without live games.
    stubHealth(false);
    relay.offline = true;
    state().watch();
    post();
    await relay.settle();
    expect(state().connection).toBe('unavailable');
    expect(state().mine?.relay).toBe('failed');
    const tried = relay.sockets.length;
    await vi.advanceTimersByTimeAsync(60_000);
    await relay.settle();
    expect(relay.sockets).toHaveLength(tried);
  });

  it('keeps retrying when the health check cannot be reached either', async () => {
    vi.useFakeTimers();
    stubHealth('unreachable');
    relay.offline = true;
    state().watch();
    await relay.settle();
    await vi.advanceTimersByTimeAsync(1200);
    await relay.settle();
    expect(state().connection).toBe('retrying');
    expect(relay.sockets.length).toBeGreaterThan(1);
  });
});

describe('looking on Lichess as well', () => {
  beforeEach(() => {
    useLichess.setState({ account });
    vi.mocked(lichessSeekAllowed).mockImplementation(
      (tc) => tc.initialMs + 40 * tc.incrementMs >= 480_000,
    );
    vi.mocked(checkLichessLive).mockResolvedValue('ok');
  });

  it('keeps faster games here only', async () => {
    post({ tc: '3+2', lichess: { rated: false } });
    expect(state().mine?.lichess).toEqual({
      status: 'not-allowed',
      rated: false,
      message: NOT_ALLOWED_MESSAGE,
    });
    expect(lichessSeekAllowed).toHaveBeenCalledWith(parseTimeControl('3+2'));
    await relay.settle();
    expect(state().mine?.relay).toBe('posted');
    expect(startLichessSeek).not.toHaveBeenCalled();
  });

  it('says what stands in the way: permission, sign-in, the connection', async () => {
    vi.mocked(checkLichessLive).mockResolvedValueOnce('needs-permission');
    post({ lichess: { rated: true } });
    expect(state().mine?.lichess.status).toBe('checking');
    await flush();
    expect(state().mine?.lichess).toMatchObject({ status: 'needs-permission', rated: true });
    expect(state().mine?.lichess.message).toMatch(/Lichess/);

    vi.mocked(checkLichessLive).mockResolvedValueOnce('signed-out');
    post({ lichess: { rated: false } });
    await flush();
    expect(state().mine?.lichess.status).toBe('signed-out');

    vi.mocked(checkLichessLive).mockResolvedValueOnce('offline');
    post({ lichess: { rated: false } });
    await flush();
    expect(state().mine?.lichess).toMatchObject({
      status: 'failed',
      message: 'Lichess could not be reached.',
    });

    // Without a Lichess account at all.
    useLichess.setState({ account: null });
    post({ lichess: { rated: false } });
    expect(state().mine?.lichess.status).toBe('signed-out');
    expect(startLichessSeek).not.toHaveBeenCalled();
    // A game for people with the link never goes to Lichess.
    useLichess.setState({ account });
    post({ private: true, lichess: { rated: false } });
    await flush();
    expect(state().mine?.lichess.status).toBe('off');
  });

  it('posts on Lichess too, and withdraws the relay post when Lichess pairs first', async () => {
    const lichess = lichessSeek();
    vi.mocked(startLichessSeek).mockReturnValue(lichess.seek);
    const other = relay.lobbyClient();
    post({ tc: '10+0', color: 'white', lichess: { rated: true } });
    await relay.settle();
    expect(startLichessSeek).toHaveBeenCalledWith({
      tc: parseTimeControl('10+0'),
      color: 'white',
      rated: true,
    });
    expect(state().mine?.lichess.status).toBe('posting');
    lichess.posted.resolve();
    await flush();
    expect(state().mine?.lichess).toMatchObject({ status: 'posted', rated: true });
    expect(other.last('lobby')!.seeks).toHaveLength(1);

    lichess.started.resolve(lichessStart());
    await flush();
    expect(state().pairing).toEqual({
      source: 'lichess',
      game: 'LiChEsS1',
      color: 'black',
      tc: '10+0',
      opponent: { name: 'someone', rating: 1810, title: null },
      at: expect.any(Number) as number,
      path: '/play/online/lichess/LiChEsS1',
    });
    expect(state().mine).toBeNull();
    expect(playSound).toHaveBeenCalledWith('notify');
    await relay.settle();
    expect(sentToLobby().at(-1)).toEqual({ t: 'cancel' });
    expect(other.last('lobby')!.seeks).toEqual([]);
    expect(lichess.seek.cancel).not.toHaveBeenCalled();
  });

  it('keeps the post here when Lichess fails, and takes no notice of its own withdrawal', async () => {
    const failing = lichessSeek();
    vi.mocked(startLichessSeek).mockReturnValueOnce(failing.seek);
    post({ lichess: { rated: false } });
    await flush();
    failing.started.reject(new Error('Lichess refused the seek.'));
    await flush();
    expect(state().mine?.lichess).toMatchObject({
      status: 'failed',
      message: 'Lichess refused the seek.',
    });
    await relay.settle();
    expect(state().mine?.relay).toBe('posted');

    const withdrawn = lichessSeek();
    vi.mocked(startLichessSeek).mockReturnValueOnce(withdrawn.seek);
    post({ lichess: { rated: false } });
    await flush();
    state().cancel();
    expect(withdrawn.seek.cancel).toHaveBeenCalled();
    await flush();
    expect(state().mine).toBeNull();
    expect(state().notice).toBeNull();
  });

  it('aborts a relay game paired after Lichess had already started one', async () => {
    const lichess = lichessSeek();
    vi.mocked(startLichessSeek).mockReturnValue(lichess.seek);
    post({ tc: '10+0', lichess: { rated: false } });
    await relay.settle();
    lichess.posted.resolve();
    // Someone takes the post here at the same moment Lichess pairs it.
    const other = relay.lobbyClient();
    await other.send({
      t: 'seek',
      tc: '10+0',
      color: 'random',
      name: THEM,
      rating: null,
      private: false,
    });
    const relayGame = other.last('paired')!;
    lichess.started.resolve(lichessStart({ gameId: 'Race0001' }));
    await flush();
    expect(state().pairing).toMatchObject({ source: 'lichess', game: 'Race0001' });
    // The relay's pairing arrives late: that game is called off before anyone moves.
    await relay.settle();
    expect(state().pairing).toMatchObject({ source: 'lichess', game: 'Race0001' });
    const abortSocket = relay.sockets.find(
      (s) => s.path === `/v1/games/${relayGame.game as string}`,
    );
    expect(abortSocket?.sentMessages()).toEqual([
      { t: 'hello', seat: expect.any(String) as string },
      { t: 'abort' },
    ]);
    expect(abortSocket?.closedBy).toBe('app');
    const room = relay.roomClient(relayGame.game as string);
    await room.send({ t: 'hello', seat: relayGame.seat });
    expect(room.last('game')).toMatchObject({ status: 'over', result: '*', reason: 'aborted' });
    expect(seatOf(relayGame.game as string)).toBeNull();
    expect(abortLichessGame).not.toHaveBeenCalled();
  });

  it('aborts a Lichess game that starts after the relay paired the post', async () => {
    const lichess = lichessSeek({ cancelAborts: false });
    vi.mocked(startLichessSeek).mockReturnValue(lichess.seek);
    post({ tc: '10+0', private: false, lichess: { rated: false } });
    await relay.settle();
    lichess.posted.resolve();
    await flush();
    const id = state().mine!.id;
    const friend = relay.lobbyClient();
    await friend.send({ t: 'join', seek: id, name: THEM, rating: null });
    await relay.settle();
    expect(state().pairing).toMatchObject({ source: 'relay' });
    expect(lichess.seek.cancel).toHaveBeenCalled();
    // Lichess had paired it already, all the same.
    lichess.started.resolve(lichessStart({ gameId: 'Late0001' }));
    await flush();
    expect(abortLichessGame).toHaveBeenCalledWith('Late0001');
    expect(state().pairing).toMatchObject({ source: 'relay' });
  });

  it('lets a new post replace the Lichess side of the last one', async () => {
    const first = lichessSeek();
    const second = lichessSeek();
    vi.mocked(startLichessSeek).mockReturnValueOnce(first.seek).mockReturnValueOnce(second.seek);
    post({ lichess: { rated: false } });
    await flush();
    post({ tc: '15+10', lichess: { rated: true } });
    expect(first.seek.cancel).toHaveBeenCalled();
    await flush();
    expect(state().mine).toMatchObject({
      tc: '15+10',
      lichess: { status: 'posting', rated: true },
    });
    second.posted.resolve();
    await flush();
    expect(state().mine?.lichess.status).toBe('posted');
  });
});

describe('the relay’s limits', () => {
  it('shows what the relay refuses, once', async () => {
    state().watch();
    await relay.settle();
    for (let i = 0; i <= LIMITS.rateMessages; i++) post({ private: true });
    await relay.settle();
    expect(state().notice).toMatch(/Too many messages/);
  });
});

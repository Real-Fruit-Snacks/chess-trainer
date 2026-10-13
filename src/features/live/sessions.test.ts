import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveBar } from '@/app/liveBar';
import { sortedGames, useGames } from '@/store/games';
import { useLichess } from '@/store/lichess';
import { type FakeLiveRelay, installFakeLiveRelay, type RelayClient } from '@/test/fakeLiveHub';
import { randomId } from '../../../relay/src/live/shared.mjs';
import type { LiveGameSession, LiveGameView } from './types';

vi.mock('./lichessLive', () => ({
  createLichessGame: vi.fn(),
  checkLichessLive: vi.fn(),
  lichessSeekAllowed: vi.fn(),
  startLichessSeek: vi.fn(),
  abortLichessGame: vi.fn(),
  reconnectLichessForLive: vi.fn(),
}));

import { createLichessGame } from './lichessLive';
import { useCorrespondence } from './correspondence';
import {
  correspondenceSeats,
  gamesToCheck,
  markGameOver,
  rememberLichessGame,
  SEAT_KEEP_MS,
  seatOf,
} from './seats';
import {
  checkOnCorrespondence,
  checkOnLiveGames,
  CORRESPONDENCE_CHECK_MS,
  closeLiveGames,
  FINISHED_LINGER_MS,
  getDuel,
  getLiveGame,
  liveGamePath,
  rememberSeat,
  useActiveGames,
  watchLiveGame,
} from './sessions';

let relay: FakeLiveRelay;

beforeEach(() => {
  localStorage.clear();
  relay = installFakeLiveRelay();
  useGames.getState().clear();
  useLichess.setState({ account: null });
  useCorrespondence.setState({ games: [] });
});

afterEach(() => {
  closeLiveGames();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(createLichessGame).mockReset();
});

/** A game made through the waiting room, this device's seat remembered (it plays White). */
async function seated() {
  const mine = relay.lobbyClient();
  const theirs = relay.lobbyClient();
  await mine.send({
    t: 'seek',
    tc: '3+2',
    color: 'white',
    name: 'Patient Bishop',
    rating: null,
    private: false,
    secret: randomId(32),
  });
  await theirs.send({
    t: 'seek',
    tc: '3+2',
    color: 'random',
    name: 'Swift Knight',
    rating: 1400,
    private: false,
    secret: randomId(32),
  });
  const paired = mine.last('paired')!;
  const game = paired.game as string;
  rememberSeat(game, paired.seat as string, 'white');
  const opponent: RelayClient = relay.roomClient(game);
  await opponent.send({ t: 'hello', seat: theirs.last('paired')!.seat });
  return { game, opponent };
}

/** A stand-in for a Lichess game's connection, its view set by the test. */
function fakeLichessSession(id: string) {
  let view: LiveGameView = {
    source: 'lichess',
    id,
    connection: 'open',
    missing: false,
    you: 'black',
    white: { name: 'someone', rating: 1900 },
    black: { name: 'learner', rating: 1700 },
    tc: '10+0',
    rated: true,
    moves: [],
    clocks: [],
    clock: null,
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    present: { white: true, black: true },
    watching: false,
    watchers: 0,
    open: null,
    joined: null,
    claimAt: null,
    chat: [],
    next: null,
    rematchesLeft: null,
    analysis: null,
    error: null,
    url: `https://lichess.org/${id}`,
    game: 'chess',
    opts: {},
    startFen: null,
    draft: null,
    peeks: null,
    capabilities: { phrases: false, rematch: false, takeback: true },
  };
  const listeners = new Set<() => void>();
  const session: LiveGameSession & { set(patch: Partial<LiveGameView>): void; closed: boolean } = {
    closed: false,
    set(patch) {
      view = { ...view, ...patch };
      for (const listener of [...listeners]) listener();
    },
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    move: vi.fn(),
    resign: vi.fn(),
    abort: vi.fn(),
    draw: vi.fn(),
    takeback: vi.fn(),
    rematch: vi.fn(),
    claim: vi.fn(),
    say: vi.fn(),
    army: vi.fn(),
    peek: vi.fn(),
    join: vi.fn(),
    analyse: vi.fn(),
    close() {
      session.closed = true;
    },
  };
  return session;
}

/** The seats as storage holds them. */
const storedSeats = () =>
  JSON.parse(localStorage.getItem('open-file:live-seats') ?? '{}') as Record<string, unknown>;

const account = {
  id: 'learner',
  username: 'learner',
  token: 'lip_x',
  connectedAt: 1,
  expiresAt: null,
};

describe('game pages and seats', () => {
  it('has a page for each game', () => {
    expect(liveGamePath('relay', 'abc_DEF-123456789012345')).toBe(
      '/play/online/abc_DEF-123456789012345',
    );
    expect(liveGamePath('lichess', 'AbCd1234')).toBe('/play/online/lichess/AbCd1234');
  });

  it('keeps seats for a day, per game', () => {
    const game = randomId(16);
    const seat = randomId(32);
    rememberSeat(game, seat, 'black', 'chess', 1_000_000);
    expect(seatOf(game, 1_000_000)).toEqual({ seat, color: 'black', kind: 'chess', at: 1_000_000 });
    expect(storedSeats()[game]).toEqual({ seat, color: 'black', kind: 'chess', at: 1_000_000 });
    // Told again (a rematch's seat in every snapshot): it keeps when it was first given.
    rememberSeat(game, seat, 'black', 'chess', 2_000_000);
    expect(seatOf(game, 2_000_000)?.at).toBe(1_000_000);
    // A day on, it is gone, and the next seat kept leaves it out of storage.
    expect(seatOf(game, 1_000_000 + SEAT_KEEP_MS)).toBeNull();
    const later = randomId(16);
    rememberSeat(later, randomId(32), 'white', 'chess', 1_000_000 + SEAT_KEEP_MS);
    expect(Object.keys(storedSeats())).toEqual([later]);
    // Not ids, not seats: nothing kept.
    rememberSeat('nope', randomId(32), 'white');
    rememberSeat(randomId(16), 'short', 'white');
    expect(Object.keys(storedSeats())).toHaveLength(1);
    // A damaged store reads as empty.
    localStorage.setItem('open-file:live-seats', '[1, 2]');
    expect(seatOf(later)).toBeNull();
  });
});

describe('games to check on after a restart', () => {
  it('lists the games not known to be over, younger than a game room can be', () => {
    const now = 10_000_000_000;
    const relayGame = randomId(16);
    const finished = randomId(16);
    rememberSeat(relayGame, randomId(32), 'white', 'chess', now - 1000);
    rememberSeat(finished, randomId(32), 'black', 'chess', now - 1000);
    markGameOver('relay', finished, now);
    rememberLichessGame('AbCd1234', now - 2000);
    rememberLichessGame('Old12345', now - 7 * 60 * 60 * 1000);
    rememberLichessGame('not a game id', now);
    expect(gamesToCheck(now)).toEqual([
      { source: 'relay', id: relayGame, kind: 'chess' },
      { source: 'lichess', id: 'AbCd1234', kind: 'chess' },
    ]);
    // Over is kept with the seat, which still opens the finished game's page.
    expect(seatOf(finished, now)).toMatchObject({ over: true, color: 'black' });
    markGameOver('lichess', 'AbCd1234', now);
    expect(gamesToCheck(now)).toEqual([{ source: 'relay', id: relayGame, kind: 'chess' }]);
    // Noted once: a second note of the same Lichess game keeps when it began.
    rememberLichessGame('AbCd1234', now);
    expect(gamesToCheck(now)).toEqual([{ source: 'relay', id: relayGame, kind: 'chess' }]);
  });

  it('notes a game that ends, so the next start does not check on it', async () => {
    const { game, opponent } = await seated();
    const session = getLiveGame('relay', game)!;
    await relay.settle();
    expect(gamesToCheck()).toEqual([{ source: 'relay', id: game, kind: 'chess' }]);
    await opponent.send({ t: 'abort' });
    await relay.settle();
    expect(session.getView().status).toBe('over');
    expect(gamesToCheck()).toEqual([]);
    expect(seatOf(game)?.over).toBe(true);
  });

  it('connects once to each game that may still be on, and the bar leads back to it', async () => {
    const { game } = await seated();
    // A start with the seat kept but no connection yet: the bar's check makes one.
    expect(useActiveGames.getState().games).toEqual([]);
    checkOnLiveGames();
    await relay.settle();
    expect(useActiveGames.getState().games).toEqual([
      expect.objectContaining({ source: 'relay', id: game, opponent: 'Swift Knight' }),
    ]);
    expect(useLiveBar.getState().active).toBe(true);
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(1);
    checkOnLiveGames();
    await relay.settle();
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(1);
  });

  it('opens a Lichess game it checks on, and notes it for the next start', () => {
    useLichess.setState({ account });
    vi.mocked(createLichessGame).mockReturnValue(fakeLichessSession('Qq7wE3rT'));
    getLiveGame('lichess', 'Qq7wE3rT');
    expect(gamesToCheck()).toEqual([{ source: 'lichess', id: 'Qq7wE3rT', kind: 'chess' }]);
  });
});

describe('game connections', () => {
  it('connects only to games this device has a seat in, one connection per game', async () => {
    expect(getLiveGame('relay', randomId(16))).toBeNull();
    const { game } = await seated();
    const session = getLiveGame('relay', game)!;
    expect(session).not.toBeNull();
    expect(getLiveGame('relay', game)).toBe(session);
    await relay.settle();
    expect(session.getView()).toMatchObject({ connection: 'open', you: 'white' });
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(1);
  });

  it('opens a Lichess game only with a Lichess account', () => {
    expect(getLiveGame('lichess', 'AbCd1234')).toBeNull();
    useLichess.setState({ account });
    const fake = fakeLichessSession('AbCd1234');
    vi.mocked(createLichessGame).mockReturnValue(fake);
    expect(getLiveGame('lichess', '../../x')).toBeNull();
    const session = getLiveGame('lichess', 'AbCd1234')!;
    expect(session.getView()).toBe(fake.getView());
    expect(getLiveGame('lichess', 'AbCd1234')).toBe(session);
    expect(createLichessGame).toHaveBeenCalledTimes(1);
    expect(createLichessGame).toHaveBeenCalledWith('AbCd1234');
    // Actions reach the game's own connection.
    session.move('e2e4');
    session.draw('offer');
    expect(fake.move).toHaveBeenCalledWith('e2e4');
    expect(fake.draw).toHaveBeenCalledWith('offer');
  });

  it('lists the games in progress for the bar, and lets a finished one go', async () => {
    const { game, opponent } = await seated();
    const session = getLiveGame('relay', game)!;
    // Still loading: nothing to lead back to yet.
    expect(useActiveGames.getState().games).toEqual([]);
    await relay.settle();
    expect(useActiveGames.getState().games).toEqual([
      {
        source: 'relay',
        id: game,
        path: `/play/online/${game}`,
        you: 'white',
        opponent: 'Swift Knight',
        kind: 'chess',
      },
    ]);
    expect(useLiveBar.getState().active).toBe(true);
    session.move('e2e4');
    await relay.settle();
    await opponent.send({ t: 'move', uci: 'e7e5', ply: 1 });
    await opponent.send({ t: 'resign' });
    await relay.settle();
    expect(session.getView().status).toBe('over');
    expect(useActiveGames.getState().games).toEqual([]);
    expect(useLiveBar.getState().active).toBe(false);
    expect(sortedGames(useGames.getState().games)[0]).toMatchObject({
      source: 'online',
      side: 'white',
      result: '1-0',
    });
  });

  it('closes a finished game a minute after nothing shows it; one in progress stays', async () => {
    vi.useFakeTimers();
    const { game, opponent } = await seated();
    const session = getLiveGame('relay', game)!;
    await relay.settle();
    // In progress, with nobody looking: it stays connected.
    await vi.advanceTimersByTimeAsync(FINISHED_LINGER_MS * 2);
    await relay.settle();
    expect(getLiveGame('relay', game)).toBe(session);
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(1);

    const unsubscribe = session.subscribe(() => undefined);
    await opponent.send({ t: 'abort' });
    await relay.settle();
    expect(session.getView().status).toBe('over');
    // Shown: it stays.
    await vi.advanceTimersByTimeAsync(FINISHED_LINGER_MS * 2);
    expect(getLiveGame('relay', game)).toBe(session);
    // Shown no more: a minute later it is closed and forgotten.
    unsubscribe();
    unsubscribe();
    await vi.advanceTimersByTimeAsync(FINISHED_LINGER_MS - 1);
    expect(getLiveGame('relay', game)).toBe(session);
    // Shown again for a moment: the minute starts over.
    const again = session.subscribe(() => undefined);
    again();
    await vi.advanceTimersByTimeAsync(FINISHED_LINGER_MS - 1);
    expect(getLiveGame('relay', game)).toBe(session);
    await vi.advanceTimersByTimeAsync(1);
    await relay.settle();
    expect(session.getView().connection).toBe('closed');
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(0);
    const fresh = getLiveGame('relay', game);
    expect(fresh).not.toBe(session);
    fresh?.close();
  });

  it('watches a game as one connection, never in the bar or My games, let go once unseen', async () => {
    vi.useFakeTimers();
    const { game, opponent } = await seated();
    const player = getLiveGame('relay', game)!;
    const watched = watchLiveGame(game)!;
    expect(watchLiveGame(game)).toBe(watched);
    expect(watched).not.toBe(player);
    expect(watchLiveGame('not a game')).toBeNull();
    const unsubscribe = watched.subscribe(() => undefined);
    await relay.settle();
    expect(watched.getView()).toMatchObject({ watching: true, connection: 'open' });
    // The bar knows only the game this device plays.
    expect(useActiveGames.getState().games.map((g) => g.id)).toEqual([game]);

    player.move('e2e4');
    await relay.settle();
    await opponent.send({ t: 'move', uci: 'e7e5', ply: 1 });
    await opponent.send({ t: 'resign' });
    await relay.settle();
    expect(watched.getView()).toMatchObject({ status: 'over', moves: ['e2e4', 'e7e5'] });
    // Kept once, by the player's connection.
    expect(sortedGames(useGames.getState().games)).toHaveLength(1);
    expect(sortedGames(useGames.getState().games)[0]).toMatchObject({ side: 'white' });

    // Shown no more: a minute later it is closed and forgotten.
    unsubscribe();
    await vi.advanceTimersByTimeAsync(FINISHED_LINGER_MS);
    await relay.settle();
    expect(watched.getView().connection).toBe('closed');
    expect(watchLiveGame(game)).not.toBe(watched);
  });

  it('lets a game watched go a minute after nothing shows it, even while it is on', async () => {
    vi.useFakeTimers();
    const { game } = await seated();
    const watched = watchLiveGame(game)!;
    watched.subscribe(() => undefined)();
    await relay.settle();
    expect(watched.getView().status).toBe('playing');
    await vi.advanceTimersByTimeAsync(FINISHED_LINGER_MS);
    await relay.settle();
    expect(watched.getView().connection).toBe('closed');
  });

  it('keeps a Lichess game that ends in My games, and closes a game on request', () => {
    useLichess.setState({ account });
    const fake = fakeLichessSession('Zz9yX8wV');
    vi.mocked(createLichessGame).mockReturnValue(fake);
    const session = getLiveGame('lichess', 'Zz9yX8wV')!;
    expect(useActiveGames.getState().games).toEqual([
      expect.objectContaining({
        source: 'lichess',
        path: '/play/online/lichess/Zz9yX8wV',
        you: 'black',
        opponent: 'someone',
      }),
    ]);
    fake.set({ moves: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'] });
    fake.set({ status: 'over', result: '1-0', reason: 'checkmate' });
    expect(useActiveGames.getState().games).toEqual([]);
    expect(sortedGames(useGames.getState().games)[0]).toMatchObject({
      source: 'lichess',
      url: 'https://lichess.org/Zz9yX8wV',
      side: 'black',
    });
    session.close();
    expect(fake.closed).toBe(true);
    const fresh = fakeLichessSession('Zz9yX8wV');
    vi.mocked(createLichessGame).mockReturnValue(fresh);
    expect(getLiveGame('lichess', 'Zz9yX8wV')).not.toBe(session);
  });
});

/** A duel made through the waiting room, this device the guest (Black), its seat remembered. */
async function seatedInDuel(game = 'judge') {
  const host = relay.lobbyClient();
  const mine = relay.lobbyClient();
  const seek = { t: 'seek', game, opts: {}, rating: null, private: false };
  await host.send({ ...seek, name: 'Swift Knight', secret: randomId(32) });
  await mine.send({ ...seek, name: 'Patient Bishop', secret: randomId(32) });
  const paired = mine.last('paired')!;
  const id = paired.game as string;
  rememberSeat(id, paired.seat as string, 'black', 'judge');
  const opponent: RelayClient = relay.roomClient(id);
  await opponent.send({ t: 'hello', seat: host.last('paired')!.seat });
  return { id, opponent };
}

describe('correspondence games', () => {
  const DAY = 86_400_000;

  it('keeps a seat while its game is on, however long, and a week after the end', () => {
    const id = randomId(16);
    const now = Date.now();
    rememberSeat(id, randomId(32), 'white', 'chess', now - 40 * DAY, true);
    expect(seatOf(id, now)).toMatchObject({ corr: true, color: 'white' });
    // Not one of the games played at once that a restart checks on.
    expect(gamesToCheck(now)).toEqual([]);
    expect(correspondenceSeats(now).map((seat) => seat.id)).toEqual([id]);
    markGameOver('relay', id, now);
    expect(seatOf(id, now + 6 * DAY)).toMatchObject({ over: true, overAt: now });
    expect(seatOf(id, now + 8 * DAY)).toBeNull();
  });

  it('checks on its games through their rooms, lists them, and keeps them out of the bar’s games', async () => {
    vi.useFakeTimers();
    const lobby = relay.lobbyClient();
    await lobby.send({
      t: 'create',
      game: 'chess',
      tc: '2d',
      color: 'white',
      name: 'Patient Bishop',
      rating: null,
    });
    const created = lobby.last('created')!;
    const game = created.game as string;
    rememberSeat(game, created.seat as string, 'white', 'chess', Date.now(), true);
    const friend = relay.roomClient(game);
    await friend.send({ t: 'hello', watch: true });
    await friend.send({ t: 'join', name: 'Swift Knight', rating: null });

    checkOnCorrespondence();
    await relay.settle();
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(1);
    expect(useCorrespondence.getState().games).toEqual([
      expect.objectContaining({
        id: game,
        opponent: 'Swift Knight',
        status: 'playing',
        turn: 'white',
      }),
    ]);
    expect(useLiveBar.getState().active).toBe(true);
    // A game over days is no "game in progress" for the bar to lead back to.
    expect(useActiveGames.getState().games).toEqual([]);

    // Checked a moment ago: not again so soon.
    checkOnCorrespondence();
    await relay.settle();
    expect(relay.sockets.filter((s) => s.path === `/v1/games/${game}`)).toHaveLength(1);

    // Nothing shows it: its connection goes a minute later, the list stays.
    await vi.advanceTimersByTimeAsync(FINISHED_LINGER_MS);
    await relay.settle();
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(0);
    expect(useCorrespondence.getState().games).toHaveLength(1);
    expect(CORRESPONDENCE_CHECK_MS).toBeLessThanOrEqual(FINISHED_LINGER_MS);
  });
});

describe('duel connections', () => {
  it('opens a duel as a duel, one connection, and the bar leads back to it', async () => {
    const { id, opponent } = await seatedInDuel();
    // Not a game of chess: its page is the duel's.
    expect(getLiveGame('relay', id)).toBeNull();
    expect(getDuel(randomId(16))).toBeNull();
    const duel = getDuel(id)!;
    expect(getDuel(id)).toBe(duel);
    await relay.settle();
    expect(duel.getView()).toMatchObject({ game: 'judge', you: 'black', status: 'setup' });
    expect(useActiveGames.getState().games).toEqual([
      {
        source: 'relay',
        id,
        path: `/play/duel/${id}`,
        you: 'black',
        opponent: 'Swift Knight',
        kind: 'judge',
      },
    ]);
    expect(gamesToCheck()).toEqual([{ source: 'relay', id, kind: 'judge' }]);
    await opponent.send({ t: 'abort' });
    await relay.settle();
    expect(duel.getView().status).toBe('over');
    expect(useActiveGames.getState().games).toEqual([]);
    // A duel over is not one to come back to, nor kept in My games.
    expect(gamesToCheck()).toEqual([]);
    expect(sortedGames(useGames.getState().games)).toEqual([]);
  });

  it('checks on a duel that may still be on after a restart', async () => {
    const { id } = await seatedInDuel();
    checkOnLiveGames();
    await relay.settle();
    expect(useActiveGames.getState().games).toEqual([
      expect.objectContaining({ id, kind: 'judge', path: `/play/duel/${id}` }),
    ]);
    expect(relay.openSockets(`/v1/games/${id}`)).toHaveLength(1);
  });
});

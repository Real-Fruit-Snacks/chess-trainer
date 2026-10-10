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
import { gamesToCheck, markGameOver, rememberLichessGame, SEAT_KEEP_MS, seatOf } from './seats';
import {
  checkOnLiveGames,
  closeLiveGames,
  FINISHED_LINGER_MS,
  getLiveGame,
  liveGamePath,
  rememberSeat,
  useActiveGames,
} from './sessions';

let relay: FakeLiveRelay;

beforeEach(() => {
  localStorage.clear();
  relay = installFakeLiveRelay();
  useGames.getState().clear();
  useLichess.setState({ account: null });
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
  });
  await theirs.send({
    t: 'seek',
    tc: '3+2',
    color: 'random',
    name: 'Swift Knight',
    rating: 1400,
    private: false,
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
    clock: null,
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    claimAt: null,
    chat: [],
    next: null,
    error: null,
    url: `https://lichess.org/${id}`,
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
    close() {
      session.closed = true;
    },
  };
  return session;
}

/** The seats as storage holds them. */
const storedSeats = () =>
  JSON.parse(localStorage.getItem('chess-trainer:live-seats') ?? '{}') as Record<string, unknown>;

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
    rememberSeat(game, seat, 'black', 1_000_000);
    expect(seatOf(game, 1_000_000)).toEqual({ seat, color: 'black', at: 1_000_000 });
    expect(storedSeats()[game]).toEqual({ seat, color: 'black', at: 1_000_000 });
    // Told again (a rematch's seat in every snapshot): it keeps when it was first given.
    rememberSeat(game, seat, 'black', 2_000_000);
    expect(seatOf(game, 2_000_000)?.at).toBe(1_000_000);
    // A day on, it is gone, and the next seat kept leaves it out of storage.
    expect(seatOf(game, 1_000_000 + SEAT_KEEP_MS)).toBeNull();
    const later = randomId(16);
    rememberSeat(later, randomId(32), 'white', 1_000_000 + SEAT_KEEP_MS);
    expect(Object.keys(storedSeats())).toEqual([later]);
    // Not ids, not seats: nothing kept.
    rememberSeat('nope', randomId(32), 'white');
    rememberSeat(randomId(16), 'short', 'white');
    expect(Object.keys(storedSeats())).toHaveLength(1);
    // A damaged store reads as empty.
    localStorage.setItem('chess-trainer:live-seats', '[1, 2]');
    expect(seatOf(later)).toBeNull();
  });
});

describe('games to check on after a restart', () => {
  it('lists the games not known to be over, younger than a game room can be', () => {
    const now = 10_000_000_000;
    const relayGame = randomId(16);
    const finished = randomId(16);
    rememberSeat(relayGame, randomId(32), 'white', now - 1000);
    rememberSeat(finished, randomId(32), 'black', now - 1000);
    markGameOver('relay', finished, now);
    rememberLichessGame('AbCd1234', now - 2000);
    rememberLichessGame('Old12345', now - 7 * 60 * 60 * 1000);
    rememberLichessGame('not a game id', now);
    expect(gamesToCheck(now)).toEqual([
      { source: 'relay', id: relayGame },
      { source: 'lichess', id: 'AbCd1234' },
    ]);
    // Over is kept with the seat, which still opens the finished game's page.
    expect(seatOf(finished, now)).toMatchObject({ over: true, color: 'black' });
    markGameOver('lichess', 'AbCd1234', now);
    expect(gamesToCheck(now)).toEqual([{ source: 'relay', id: relayGame }]);
    // Noted once: a second note of the same Lichess game keeps when it began.
    rememberLichessGame('AbCd1234', now);
    expect(gamesToCheck(now)).toEqual([{ source: 'relay', id: relayGame }]);
  });

  it('notes a game that ends, so the next start does not check on it', async () => {
    const { game, opponent } = await seated();
    const session = getLiveGame('relay', game)!;
    await relay.settle();
    expect(gamesToCheck()).toEqual([{ source: 'relay', id: game }]);
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
    expect(gamesToCheck()).toEqual([{ source: 'lichess', id: 'Qq7wE3rT' }]);
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

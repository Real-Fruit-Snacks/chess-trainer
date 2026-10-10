import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sortedGames, useGames } from '@/store/games';
import {
  type FakeLiveRelay,
  installFakeLiveRelay,
  type Message,
  type RelayClient,
} from '@/test/fakeLiveHub';
import { CLOSE, LIMITS, randomId } from '../../../relay/src/live/shared.mjs';
import { createRelayGame } from './relayGame';
import { seatOf } from './seats';
import type { LiveGameSession, LiveGameView } from './types';

const ME = 'Patient Bishop';
const THEM = 'Swift Knight';

let relay: FakeLiveRelay;
const sessions: LiveGameSession[] = [];

beforeEach(() => {
  relay = installFakeLiveRelay();
  useGames.getState().clear();
});

afterEach(() => {
  for (const session of sessions.splice(0)) session.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * A game made through the waiting room: this device plays `color`, the other
 * player (a plain relay client) is seated already.
 */
async function newGame(color: 'white' | 'black' = 'white', tc = '5+3') {
  const mine = relay.lobbyClient();
  const theirs = relay.lobbyClient();
  await mine.send({ t: 'seek', tc, color, name: ME, rating: 1500, private: false });
  await theirs.send({ t: 'seek', tc, color: 'random', name: THEM, rating: null, private: false });
  const paired = mine.last('paired')!;
  const game = paired.game as string;
  const opponent = relay.roomClient(game);
  await opponent.send({ t: 'hello', seat: theirs.last('paired')!.seat });
  return { game, seat: paired.seat as string, opponent };
}

/** The session, and every view it showed. */
function open(game: string, seat: string, color: 'white' | 'black' = 'white') {
  const session = createRelayGame(game, seat, color);
  sessions.push(session);
  const views: LiveGameView[] = [];
  session.subscribe(() => views.push(session.getView()));
  return { session, views };
}

async function opponentMoves(opponent: RelayClient, uci: string, ply: number) {
  await opponent.send({ t: 'move', uci, ply });
  await relay.settle();
}

const lastSent = (path: string): Message | undefined =>
  relay.sockets
    .filter((s) => s.path === path)
    .flatMap((s) => s.sentMessages())
    .at(-1);

describe('a game on the relay', () => {
  it('connects with its seat and shows the game from its side', async () => {
    const { game, seat } = await newGame('white');
    const { session } = open(game, seat);
    expect(session.getView()).toMatchObject({ connection: 'connecting', missing: false });
    await relay.settle();
    const view = session.getView();
    expect(view).toMatchObject({
      source: 'relay',
      id: game,
      connection: 'open',
      you: 'white',
      white: { name: ME, rating: 1500 },
      black: { name: THEM, rating: null },
      tc: '5+3',
      rated: false,
      url: null,
      moves: [],
      status: 'playing',
      opponentPresent: true,
      claimAt: null,
      capabilities: { phrases: true, rematch: true, takeback: true },
    });
    expect(view.clock).toMatchObject({ white: 300_000, black: 300_000, running: null });
    expect(view.firstMove?.color).toBe('white');
    expect(view.firstMove!.deadline - performance.now()).toBeGreaterThan(LIMITS.firstMoveMs - 1000);
    expect(relay.sockets[0]!.sentMessages()[0]).toEqual({ t: 'hello', seat });
    // Nothing changed: the same object (what useSyncExternalStore needs).
    expect(session.getView()).toBe(view);
  });

  it('plays moves at once on its own board, takes the echo, and shows the other side’s', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session, views } = open(game, seat);
    await relay.settle();

    const before = session.getView();
    session.move('e2e4');
    // On the board at once, before the relay has even seen it.
    const played = session.getView();
    expect(played).not.toBe(before);
    expect(before.moves).toEqual([]);
    expect(played.moves).toEqual(['e2e4']);
    expect(played.firstMove?.color).toBe('black');
    expect(lastSent(`/v1/games/${game}`)).toEqual({ t: 'move', uci: 'e2e4', ply: 0 });
    await relay.settle();
    expect(opponent.last('move')).toMatchObject({ uci: 'e2e4', ply: 0 });
    // The echo changes no move.
    expect(session.getView().moves).toEqual(['e2e4']);

    await opponentMoves(opponent, 'e7e5', 1);
    expect(session.getView()).toMatchObject({ moves: ['e2e4', 'e7e5'], firstMove: null });
    expect(session.getView().clock).toMatchObject({ running: 'white' });

    // A later move stops this side's clock where it stands and starts the other's.
    session.move('g1f3');
    const clock = session.getView().clock!;
    expect(clock.running).toBe('black');
    expect(clock.white).toBeLessThanOrEqual(300_000);
    await relay.settle();
    // The echo brings the relay's clocks, increment included.
    expect(session.getView().clock).toMatchObject({ running: 'black' });
    expect(session.getView().clock!.white).toBeGreaterThan(300_000);

    // Not this side's move, and not a legal one: refused here, nothing sent.
    const sent = relay.sockets[0]!.sent.length;
    session.move('d2d4');
    expect(session.getView().error).toBe('It is not your move.');
    await opponentMoves(opponent, 'b8c6', 3);
    expect(session.getView().error).toBeNull();
    session.move('e1e3');
    expect(session.getView().error).toBe('That move is not legal.');
    expect(relay.sockets[0]!.sent).toHaveLength(sent);
    // Every view was a new object; none was changed afterwards.
    expect(new Set(views).size).toBe(views.length);
    expect(views[0]!.moves).toEqual([]);
  });

  it('puts the board right from the snapshot that follows a refusal', async () => {
    const { game, seat, opponent } = await newGame('black');
    const { session } = open(game, seat, 'black');
    await relay.settle();
    await opponentMoves(opponent, 'e2e4', 0);
    session.move('e7e5');
    await relay.settle();
    await opponentMoves(opponent, 'g1f3', 2);
    session.move('b8c6');
    await relay.settle();
    await opponentMoves(opponent, 'f1c4', 4);
    // This side asks to take back its last move; White accepts at the relay...
    session.takeback('offer');
    await relay.settle();
    expect(session.getView().offers.takeback).toBe('black');
    await opponent.send({ t: 'takeback', op: 'accept' });
    // ...while this board, not yet told, plays on from the old position.
    session.move('f8c5');
    expect(session.getView().moves).toHaveLength(6);
    await relay.settle();
    // The relay refused the move; its snapshot shows the game as it is.
    expect(session.getView()).toMatchObject({
      moves: ['e2e4', 'e7e5', 'g1f3'],
      error: 'It is not your move.',
      status: 'playing',
    });
    expect(session.getView().offers.takeback).toBeNull();
    // The game goes on from there, and the next change clears the message.
    session.move('b8c6');
    expect(session.getView().error).toBeNull();
    await relay.settle();
    expect(opponent.last('move')).toMatchObject({ uci: 'b8c6', ply: 3 });

    // A resignation that crossed this side's move: the move is refused, the game is over.
    await opponentMoves(opponent, 'f1c4', 4);
    await opponent.send({ t: 'resign' });
    session.move('g8f6');
    expect(session.getView().moves).toHaveLength(6);
    await relay.settle();
    expect(session.getView()).toMatchObject({
      status: 'over',
      result: '0-1',
      reason: 'resign',
      moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'],
      error: 'The game is over.',
    });
  });

  it('shows offers and answers them, and ends a game drawn by agreement', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    session.move('d2d4');
    await relay.settle();
    await opponentMoves(opponent, 'd7d5', 1);
    await opponent.send({ t: 'draw', op: 'offer' });
    await relay.settle();
    expect(session.getView().offers).toEqual({ draw: 'black', takeback: null, rematch: null });
    session.draw('decline');
    await relay.settle();
    expect(session.getView().offers.draw).toBeNull();
    expect(opponent.last('offers')).toMatchObject({ draw: null });
    // An offer lapses with a move, on this board as at the relay.
    await opponent.send({ t: 'draw', op: 'offer' });
    await relay.settle();
    session.move('c2c4');
    expect(session.getView().offers.draw).toBeNull();
    await relay.settle();
    session.draw('offer');
    await relay.settle();
    expect(opponent.last('offers')).toMatchObject({ draw: 'white' });
    await opponent.send({ t: 'draw', op: 'accept' });
    await relay.settle();
    expect(session.getView()).toMatchObject({
      status: 'over',
      result: '1/2-1/2',
      reason: 'agreement',
      offers: { draw: null, takeback: null, rematch: null },
      firstMove: null,
    });
    expect(session.getView().clock?.running).toBeNull();
    // Kept in My games, from this side.
    const kept = sortedGames(useGames.getState().games);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ source: 'online', side: 'white', result: '1/2-1/2' });
  });

  it('passes phrases both ways', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    session.say('luck');
    await relay.settle();
    expect(opponent.last('say')).toEqual({ t: 'say', by: 'white', phrase: 'luck' });
    await opponent.send({ t: 'say', phrase: 'fun' });
    await relay.settle();
    expect(session.getView().chat).toEqual([
      { by: 'white', text: 'Good luck' },
      { by: 'black', text: 'Have fun' },
    ]);
    // Only the phrases there are.
    const said = opponent.all('say').length;
    session.say('rude' as never);
    await relay.settle();
    expect(opponent.all('say')).toHaveLength(said);
  });

  it('lets this side claim the game once the other has been gone long enough', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    session.move('e2e4');
    await relay.settle();
    await opponentMoves(opponent, 'e7e5', 1);
    await opponent.leave();
    await relay.settle();
    const view = session.getView();
    expect(view.opponentPresent).toBe(false);
    expect(view.claimAt).not.toBeNull();
    expect(view.claimAt! - performance.now()).toBeGreaterThan(LIMITS.goneClaimMs - 1000);
    // Too early: refused, with the reason.
    session.claim('win');
    await relay.settle();
    expect(session.getView().error).toBe('Your opponent can still come back.');
    await relay.advance(LIMITS.goneClaimMs);
    session.claim('win');
    await relay.settle();
    expect(session.getView()).toMatchObject({
      status: 'over',
      result: '1-0',
      reason: 'abandoned',
      claimAt: null,
    });
    const kept = sortedGames(useGames.getState().games)[0]!;
    expect(kept.pgn).toContain('[Termination "Abandoned"]');
  });

  it('offers no claim until both sides have moved', async () => {
    const { game, seat, opponent } = await newGame('black');
    const { session } = open(game, seat, 'black');
    await relay.settle();
    await opponentMoves(opponent, 'e2e4', 0);
    await opponent.leave();
    await relay.settle();
    expect(session.getView()).toMatchObject({ opponentPresent: false, claimAt: null });
    // This side's first move makes two: from then the absence counts.
    session.move('c7c5');
    expect(session.getView().claimAt).not.toBeNull();
    await relay.settle();
    expect(session.getView().claimAt).not.toBeNull();
  });

  it('takes a rematch to the next game, with its seat kept', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    for (const [i, uci] of ['f2f3', 'e7e5', 'g2g4', 'd8h4'].entries()) {
      if (i % 2 === 0) {
        session.move(uci);
        await relay.settle();
      } else {
        await opponentMoves(opponent, uci, i);
      }
    }
    expect(session.getView()).toMatchObject({ status: 'over', result: '0-1', reason: 'checkmate' });
    expect(sortedGames(useGames.getState().games)[0]).toMatchObject({ side: 'white' });
    await opponent.send({ t: 'rematch', op: 'offer' });
    await relay.settle();
    expect(session.getView().offers.rematch).toBe('black');
    session.rematch('accept');
    await relay.settle();
    const next = session.getView().next;
    expect(next?.path).toMatch(/^\/play\/online\/[A-Za-z0-9_-]{22}$/);
    const nextId = next!.path.split('/').at(-1)!;
    // The colours swap: this side plays Black next.
    expect(seatOf(nextId)).toMatchObject({ color: 'black' });
    const again = open(nextId, seatOf(nextId)!.seat, 'black');
    await relay.settle();
    expect(again.session.getView()).toMatchObject({
      you: 'black',
      white: { name: THEM },
      black: { name: ME },
    });
  });

  it('reconnects after a drop, and sends a move made meanwhile once the game is caught up', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    relay.drop(relay.openSockets()[0]!);
    await relay.settle();
    expect(session.getView().connection).toBe('reconnecting');
    expect(opponent.last('present')).toMatchObject({ white: false });
    // The board stays usable: the move waits for the connection.
    session.move('e2e4');
    expect(session.getView().moves).toEqual(['e2e4']);
    // Back online: no waiting for the retry.
    window.dispatchEvent(new Event('online'));
    await relay.settle();
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(1);
    expect(session.getView()).toMatchObject({ connection: 'open', moves: ['e2e4'] });
    expect(opponent.last('move')).toMatchObject({ uci: 'e2e4', ply: 0 });
    expect(opponent.last('present')).toMatchObject({ white: true });
  });

  it('tries again with growing waits, and gives up a socket the relay has gone quiet on', async () => {
    vi.useFakeTimers();
    const { game, seat } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    const socket = relay.openSockets()[0]!;
    // A ping every 25 seconds; the relay's pong keeps the socket.
    await vi.advanceTimersByTimeAsync(25_000);
    await relay.settle();
    expect(socket.sent.filter((t) => t === 'ping')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await relay.settle();
    expect(socket.readyState).toBe(1);
    // Silence after a ping: the socket is given up within 10 seconds, and another opens.
    relay.silence(socket);
    await vi.advanceTimersByTimeAsync(15_000);
    await relay.settle();
    await vi.advanceTimersByTimeAsync(10_000);
    await relay.settle();
    expect(socket.closedBy).toBe('app');
    expect(session.getView().connection).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1200);
    await relay.settle();
    expect(session.getView().connection).toBe('open');
    expect(relay.openSockets(`/v1/games/${game}`)).toHaveLength(1);

    // The relay out of reach: 1, 2, 4, 8, then 15 seconds between attempts.
    relay.offline = true;
    relay.drop(relay.openSockets()[0]!);
    await relay.settle();
    const attempts = () => relay.sockets.length;
    for (const wait of [1000, 2000, 4000, 8000, 15_000, 15_000]) {
      const before = attempts();
      await vi.advanceTimersByTimeAsync(wait - 1);
      await relay.settle();
      expect(attempts()).toBe(before);
      await vi.advanceTimersByTimeAsync(wait * 0.2 + 1);
      await relay.settle();
      expect(attempts()).toBe(before + 1);
    }
    relay.offline = false;
    await vi.advanceTimersByTimeAsync(18_000);
    await relay.settle();
    expect(session.getView().connection).toBe('open');
  });

  it('says so when it holds no seat in the game, and does not try again', async () => {
    const { game } = await newGame('white');
    const { session } = open(game, randomId(32));
    await relay.settle();
    expect(session.getView()).toMatchObject({ missing: true, connection: 'closed' });
    expect(relay.sockets.at(-1)!.closeCode).toBe(CLOSE.noGame);
    window.dispatchEvent(new Event('online'));
    await relay.settle();
    expect(relay.sockets.filter((s) => s.path === `/v1/games/${game}`)).toHaveLength(1);
    // A game that never was.
    const nowhere = open(randomId(16), randomId(32));
    await relay.settle();
    expect(nowhere.session.getView()).toMatchObject({ missing: true });
  });

  it('keeps a finished game on the board when its room is deleted, and calls a game in progress gone', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    await opponent.send({ t: 'abort' });
    await relay.settle();
    expect(session.getView()).toMatchObject({ status: 'over', result: '*', reason: 'aborted' });
    await relay.advance(LIMITS.keepAfterEndMs);
    expect(session.getView()).toMatchObject({
      status: 'over',
      missing: false,
      connection: 'closed',
    });
    // An aborted game is not kept.
    expect(Object.keys(useGames.getState().games)).toHaveLength(0);

    const other = await newGame('black');
    const second = open(other.game, other.seat, 'black');
    await relay.settle();
    relay.hub.closeAll();
    await relay.settle();
    expect(second.session.getView()).toMatchObject({ missing: true, connection: 'closed' });
  });

  it('stays away once closed', async () => {
    const { game, seat } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    session.close();
    await relay.settle();
    expect(session.getView().connection).toBe('closed');
    expect(relay.openSockets()).toHaveLength(0);
    session.move('e2e4');
    session.resign();
    window.dispatchEvent(new Event('online'));
    await relay.settle();
    expect(relay.openSockets()).toHaveLength(0);
    expect(session.getView().moves).toEqual([]);
  });
});

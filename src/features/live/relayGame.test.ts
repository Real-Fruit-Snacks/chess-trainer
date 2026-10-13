import type { Square } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushSubscription } from '@/features/notifications/pushSubscription';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { sortedGames, useGames } from '@/store/games';
import {
  type FakeLiveRelay,
  installFakeLiveRelay,
  type Message,
  type RelayClient,
} from '@/test/fakeLiveHub';
import {
  chess960BackRank as relayBackRank,
  chess960StartFen as relayStartFen,
} from '../../../relay/src/live/chess960.mjs';
import { endOf, playUci, replay } from '../../../relay/src/live/rules.mjs';
import {
  ABUSE_LIMITS,
  analysisRoomId,
  CLOSE,
  LIMITS,
  randomId,
} from '../../../relay/src/live/shared.mjs';
import {
  CHESS960_POSITIONS,
  Chess960Game,
  chess960BackRank,
  chess960Number,
  chess960StartFen,
} from '@/chess/chess960';
import { mainLineOfPgn } from '@/features/games/gameStats';
import { createRelayGame } from './relayGame';
import { useLivePrefs } from './prefs';
import { rememberSeat, seatOf } from './seats';
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
  const secret = () => randomId(32);
  await mine.send({
    t: 'seek',
    tc,
    color,
    name: ME,
    rating: 1500,
    private: false,
    secret: secret(),
  });
  await theirs.send({
    t: 'seek',
    tc,
    color: 'random',
    name: THEM,
    rating: null,
    private: false,
    secret: secret(),
  });
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

  it('keeps the clock after each move as the room has it, and the record writes them', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    session.move('f2f3');
    // A guess on this board at once; the room's reading with the echo.
    expect(session.getView().clocks).toEqual([300_000]);
    await relay.settle();
    await opponentMoves(opponent, 'e7e5', 1);
    await relay.advance(7_000);
    session.move('g2g4');
    await relay.settle();
    expect(session.getView().clocks).toEqual([300_000, 300_000, 296_000]);
    await relay.advance(2_500);
    await opponentMoves(opponent, 'd8h4', 3);
    expect(session.getView()).toMatchObject({
      status: 'over',
      clocks: [300_000, 300_000, 296_000, 300_500],
    });
    const kept = sortedGames(useGames.getState().games)[0];
    expect(kept?.pgn).toContain('2. g4 { [%clk 0:04:56] }\n2... Qh4# { [%clk 0:05:00] } 0-1');

    // A snapshot brings them all (after a takeback, as many as the moves).
    const again = await newGame('white');
    const second = open(again.game, again.seat);
    await relay.settle();
    second.session.move('e2e4');
    await relay.settle();
    await opponentMoves(again.opponent, 'e7e5', 1);
    second.session.move('g1f3');
    await relay.settle();
    await opponentMoves(again.opponent, 'b8c6', 3);
    expect(second.session.getView().clocks).toHaveLength(4);
    second.session.takeback('offer');
    await relay.settle();
    await again.opponent.send({ t: 'takeback', op: 'accept' });
    await relay.settle();
    expect(second.session.getView()).toMatchObject({ moves: ['e2e4', 'e7e5'] });
    expect(second.session.getView().clocks).toEqual([300_000, 300_000]);
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

  it('tries again as usual when its seat is open in all the tabs it takes, and gets in once one goes', async () => {
    vi.useFakeTimers();
    const { game, seat } = await newGame('white');
    const tabs = [];
    for (let i = 0; i < ABUSE_LIMITS.socketsPerSeat; i++) {
      const tab = relay.roomClient(game);
      await tab.send({ t: 'hello', seat });
      tabs.push(tab);
    }
    const { session } = open(game, seat);
    await relay.settle();
    // Refused as a full room is: the other tabs keep their sockets, and this one waits.
    expect(relay.sockets.at(-1)!.closeCode).toBe(CLOSE.full);
    expect(session.getView()).toMatchObject({ connection: 'connecting', missing: false });
    expect(tabs.every((tab) => tab.closed === null)).toBe(true);
    await tabs[0]!.leave();
    await vi.advanceTimersByTimeAsync(1200);
    await relay.settle();
    expect(session.getView()).toMatchObject({ connection: 'open', you: 'white', error: null });
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

/** A variant of chess made through the waiting room: this device plays White. */
async function newVariant(
  game: 'army' | 'blindfold' | 'chess960',
  opts: Record<string, number> = {},
) {
  const mine = relay.lobbyClient();
  const theirs = relay.lobbyClient();
  const seek = { t: 'seek', game, opts, tc: '5+3', rating: null, private: false };
  await mine.send({ ...seek, color: 'white', name: ME, secret: randomId(32) });
  await theirs.send({ ...seek, color: 'random', name: THEM, secret: randomId(32) });
  const paired = mine.last('paired')!;
  const id = paired.game as string;
  const opponent = relay.roomClient(id);
  await opponent.send({ t: 'hello', seat: theirs.last('paired')!.seat });
  return { game: id, seat: paired.seat as string, opponent };
}

describe('the variants on the relay', () => {
  it('drafts an army out of the other’s sight, then plays from the two armies', async () => {
    const { game, seat, opponent } = await newVariant('army', { budget: 30 });
    const { session } = open(game, seat);
    await relay.settle();
    expect(session.getView()).toMatchObject({
      game: 'army',
      opts: { budget: 30 },
      status: 'draft',
      startFen: null,
      draft: {
        budget: 30,
        ready: { white: false, black: false },
        armies: { white: null, black: null },
      },
      firstMove: null,
    });
    expect(session.getView().draft!.deadline! - performance.now()).toBeGreaterThan(
      LIMITS.draftMs - 1000,
    );
    // No moves while the armies are chosen: refused here, nothing sent.
    session.move('e2e4');
    expect(session.getView().error).toBe('The armies are still being chosen.');

    const army = { q: 1, r: 2, b: 0, n: 0, p: 8 };
    session.army(army);
    await relay.settle();
    expect(lastSent(`/v1/games/${game}`)).toEqual({ t: 'army', army });
    expect(session.getView().draft!.ready).toEqual({ white: true, black: false });
    expect(opponent.last('draft')).toEqual({ t: 'draft', ready: { white: true, black: false } });

    await opponent.send({ t: 'army', army: { q: 0, r: 2, b: 2, n: 2, p: 2 } });
    await relay.settle();
    const view = session.getView();
    expect(view.status).toBe('playing');
    expect(view.startFen).toMatch(/^r/);
    expect(view.draft!.armies).toEqual({ white: army, black: { q: 0, r: 2, b: 2, n: 2, p: 2 } });
    // The moves are the drafted position's: the d-pawn guards the queen, no knight to move.
    session.move('g1f3');
    expect(session.getView().error).toBe('That move is not legal.');
    session.move('e2e4');
    await relay.settle();
    // Black's rook has no pawn in front of it in this position.
    await opponentMoves(opponent, 'h8h3', 1);
    expect(session.getView().moves).toEqual(['e2e4', 'h8h3']);
    session.move('d2d4');
    await relay.settle();
    await opponentMoves(opponent, 'h3h2', 3);
    // A takeback replays from the drafted position too, with no need to ask for the game again.
    const hellos = () =>
      relay.sockets
        .flatMap((socket) => socket.sentMessages())
        .filter((message) => message.t === 'hello').length;
    const before = hellos();
    session.takeback('offer');
    await relay.settle();
    await opponent.send({ t: 'takeback', op: 'accept' });
    await relay.settle();
    expect(session.getView().moves).toEqual(['e2e4', 'h8h3']);
    expect(hellos()).toBe(before);
  });

  it('counts a blindfold game’s peeks for both players', async () => {
    const { game, seat, opponent } = await newVariant('blindfold');
    const { session } = open(game, seat);
    await relay.settle();
    expect(session.getView()).toMatchObject({
      game: 'blindfold',
      status: 'playing',
      peeks: { white: 0, black: 0 },
      draft: null,
    });
    session.peek();
    await relay.settle();
    expect(lastSent(`/v1/games/${game}`)).toEqual({ t: 'peek' });
    expect(session.getView().peeks).toEqual({ white: 1, black: 0 });
    await opponent.send({ t: 'peek' });
    await relay.settle();
    expect(session.getView().peeks).toEqual({ white: 1, black: 1 });
  });

  it('keeps a rematch’s seat as the same variant', async () => {
    const { game, seat, opponent } = await newVariant('blindfold');
    const { session } = open(game, seat);
    await relay.settle();
    session.abort();
    await relay.settle();
    await opponent.send({ t: 'rematch', op: 'offer' });
    session.rematch('accept');
    await relay.settle();
    const next = session.getView().next!;
    expect(next.path).toMatch(/^\/play\/online\//);
    expect(seatOf(next.path.split('/').at(-1)!)).toMatchObject({ kind: 'blindfold' });
  });
});

describe('Chess960 on the relay', () => {
  it('numbers the start positions as the app does, all 960 of them', () => {
    for (let n = 0; n < CHESS960_POSITIONS; n++) {
      expect(relayBackRank(n)).toBe(chess960BackRank(n));
      expect(relayStartFen(n)).toBe(chess960StartFen(n));
    }
  });

  it('takes every move the board offers, and ends games as the app does', () => {
    // The app's own reasons, in the relay's words.
    const REASONS: Record<string, string> = {
      checkmate: 'checkmate',
      stalemate: 'stalemate',
      'insufficient material': 'insufficient',
      'threefold repetition': 'repetition',
      'fifty-move rule': 'fifty-moves',
    };
    let seed = 960;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    let castled = 0;
    let ended = 0;
    for (let game = 0; game < 40; game++) {
      const start = chess960StartFen(Math.floor(random() * CHESS960_POSITIONS));
      const app = new Chess960Game(start);
      const room = replay([], start, 'chess960')!;
      for (let ply = 0; ply < 300 && !app.isGameOver(); ply++) {
        const moves = [...app.dests()].flatMap(([from, tos]) => tos.map((to) => `${from}${to}`));
        const pick = moves[Math.floor(random() * moves.length)]!;
        const uci = app.isPromotion(pick.slice(0, 2) as Square, pick.slice(2, 4) as Square)
          ? `${pick}q`
          : pick;
        const played = app.move(uci)!;
        // Whatever the board lets a player drop, the room takes, and names it the same.
        expect(playUci(room, uci)?.san, `${start} ${uci}`).toBe(played.san);
        if (played.castle) castled++;
      }
      const status = app.status();
      expect(endOf(room)).toEqual(
        status.over ? { result: status.result, reason: REASONS[status.reason ?? ''] } : null,
      );
      if (status.over) ended++;
    }
    expect(castled).toBeGreaterThan(0);
    expect(ended).toBeGreaterThan(0);
    // Forty whole games through two move generators: slow under coverage, on a shared machine.
  }, 60_000);

  it('plays from the start the room drew: castling onto the rook, takebacks, the record', async () => {
    vi.unstubAllGlobals();
    relay = installFakeLiveRelay({ chess960Position: () => 192 });
    const { game, seat, opponent } = await newVariant('chess960');
    const { session } = open(game, seat);
    await relay.settle();
    const start = chess960StartFen(192);
    expect(session.getView()).toMatchObject({
      game: 'chess960',
      opts: {},
      status: 'playing',
      startFen: start,
      draft: null,
      peeks: null,
    });
    expect(chess960Number(session.getView().startFen!)).toBe(192);

    session.move('g1h3');
    await relay.settle();
    await opponentMoves(opponent, 'g8h6', 1);
    // Castling long is blocked here: refused at once, nothing sent.
    session.move('f1e1');
    expect(session.getView().error).toBe('That move is not legal.');
    // The king onto its rook castles short.
    session.move('f1h1');
    expect(session.getView().moves).toEqual(['g1h3', 'g8h6', 'f1h1']);
    expect(lastSent(`/v1/games/${game}`)).toEqual({ t: 'move', uci: 'f1h1', ply: 2 });
    await relay.settle();
    expect(opponent.last('move')).toMatchObject({ uci: 'f1h1', ply: 2 });
    await opponentMoves(opponent, 'f8h8', 3);
    expect(session.getView().moves).toEqual(['g1h3', 'g8h6', 'f1h1', 'f8h8']);
    expect(session.getView().error).toBeNull();

    // Taken back from the Chess960 start, without asking for the game again.
    session.takeback('offer');
    await relay.settle();
    await opponent.send({ t: 'takeback', op: 'accept' });
    await relay.settle();
    expect(session.getView().moves).toEqual(['g1h3', 'g8h6']);
    // This time the king steps to g1; castling is gone with it.
    session.move('f1g1');
    await relay.settle();
    await opponentMoves(opponent, 'h6g4', 3);
    session.move('g1h1');
    expect(session.getView().error).toBe('That move is not legal.');

    await opponent.send({ t: 'resign' });
    await relay.settle();
    expect(session.getView()).toMatchObject({ status: 'over', result: '1-0', reason: 'resign' });
    const [record] = sortedGames(useGames.getState().games);
    expect(record?.pgn).toContain('[Variant "Chess960"]');
    expect(record?.pgn).toContain(`[FEN "${start}"]`);
    expect(mainLineOfPgn(record?.pgn ?? '')).toMatchObject({
      chess960: true,
      sans: ['Nh3', 'Nh6', 'Kg1', 'Ng4'],
    });
  });

  it('keeps a rematch’s seat as Chess960, and invites by correspondence', async () => {
    const { game, seat, opponent } = await newVariant('chess960');
    const { session } = open(game, seat);
    await relay.settle();
    const start = session.getView().startFen;
    expect(chess960Number(start ?? '')).not.toBeNull();
    session.abort();
    await relay.settle();
    await opponent.send({ t: 'rematch', op: 'offer' });
    session.rematch('accept');
    await relay.settle();
    const next = session.getView().next!;
    const id = next.path.split('/').at(-1)!;
    expect(seatOf(id)).toMatchObject({ kind: 'chess960', color: 'black' });
    const rematch = open(id, seatOf(id)!.seat, 'black').session;
    await relay.settle();
    // The same start position, the colours swapped.
    expect(rematch.getView()).toMatchObject({ game: 'chess960', you: 'black', startFen: start });

    const lobby = relay.lobbyClient();
    await lobby.send({ t: 'create', game: 'chess960', tc: '3d', color: 'white', name: THEM });
    const created = lobby.last('created')!;
    const watching = createRelayGame(created.game as string, null);
    sessions.push(watching);
    watching.subscribe(() => undefined);
    await relay.settle();
    expect(watching.getView()).toMatchObject({ game: 'chess960', open: 'black', tc: '3d' });
    watching.join();
    await relay.settle();
    expect(seatOf(created.game as string)).toMatchObject({ kind: 'chess960', corr: true });
  });
});

describe('watching a game on the relay', () => {
  /** Two players seated through the relay's own clients; the game's id. */
  async function playersSeated() {
    const { game, seat, opponent } = await newGame('white');
    const white = relay.roomClient(game);
    await white.send({ t: 'hello', seat });
    return { game, white, black: opponent };
  }

  function watch(game: string) {
    const session = createRelayGame(game, null);
    sessions.push(session);
    session.subscribe(() => undefined);
    return session;
  }

  it('watches without a seat: the game from White’s side, and nothing played from here', async () => {
    const { game, white, black } = await playersSeated();
    await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    const session = watch(game);
    await relay.settle();
    expect(lastSent(`/v1/games/${game}`)).toEqual({ t: 'hello', watch: true });
    expect(session.getView()).toMatchObject({
      watching: true,
      you: 'white',
      connection: 'open',
      white: { name: ME },
      black: { name: THEM },
      moves: ['e2e4'],
      present: { white: true, black: true },
      watchers: 1,
      chat: [],
    });
    expect(white.last('watchers')).toEqual({ t: 'watchers', n: 1 });

    await black.send({ t: 'move', uci: 'c7c5', ply: 1 });
    await relay.settle();
    expect(session.getView().moves).toEqual(['e2e4', 'c7c5']);
    expect(session.getView().clock).toMatchObject({ running: 'white' });

    // Nothing goes from a watcher's session: no move, no resignation, no phrase.
    const sent = relay.sockets.at(-1)!.sent.length;
    session.move('g1f3');
    session.resign();
    session.say('hello');
    session.draw('offer');
    expect(relay.sockets.at(-1)!.sent).toHaveLength(sent);
    expect(session.getView().moves).toEqual(['e2e4', 'c7c5']);

    // Another watcher comes, and a player leaves: both show.
    const other = watch(game);
    await relay.settle();
    expect(other.getView().watchers).toBe(2);
    expect(session.getView().watchers).toBe(2);
    await black.leave();
    await relay.settle();
    expect(session.getView().present).toEqual({ white: true, black: false });
  });

  it('keeps a game watched out of My games, and follows the players to their rematch', async () => {
    const { game, white, black } = await playersSeated();
    const session = watch(game);
    await relay.settle();
    for (const [ply, uci] of ['f2f3', 'e7e5', 'g2g4', 'd8h4'].entries()) {
      await (ply % 2 === 0 ? white : black).send({ t: 'move', uci, ply });
    }
    await relay.settle();
    expect(session.getView()).toMatchObject({ status: 'over', result: '0-1', reason: 'checkmate' });
    expect(useGames.getState().games).toEqual({});

    await white.send({ t: 'rematch', op: 'offer' });
    await black.send({ t: 'rematch', op: 'accept' });
    await relay.settle();
    const next = session.getView().next;
    expect(next?.path).toMatch(/^\/play\/watch\/[A-Za-z0-9_-]{22}$/);
    // No seat for a watcher: none is kept.
    expect(seatOf(next!.path.split('/').at(-1)!)).toBeNull();
  });
});

describe('a correspondence game on the relay', () => {
  const DAY = 86_400_000;

  /** An invitation made in the waiting room by the other player (a plain client), who is seated. */
  async function invitation(color: 'white' | 'black' = 'white') {
    const lobby = relay.lobbyClient();
    await lobby.send({ t: 'create', game: 'chess', tc: '3d', color, name: THEM, rating: null });
    const created = lobby.last('created')!;
    const game = created.game as string;
    const host = relay.roomClient(game);
    await host.send({ t: 'hello', seat: created.seat });
    return { game, host };
  }

  it('takes an invitation’s open seat from its link, and keeps the seat until the game ends', async () => {
    const { game, host } = await invitation('white');
    const watching = createRelayGame(game, null);
    sessions.push(watching);
    watching.subscribe(() => undefined);
    await relay.settle();
    expect(watching.getView()).toMatchObject({
      watching: true,
      open: 'black',
      joined: null,
      tc: '3d',
      white: { name: THEM },
    });

    useLivePrefs.setState({ name: ME, showRating: false });
    watching.join();
    await relay.settle();
    expect(lastSent(`/v1/games/${game}`)).toEqual({ t: 'join', name: ME, rating: null });
    expect(watching.getView().joined).toBe('black');
    const seat = seatOf(game);
    expect(seat).toMatchObject({ color: 'black', kind: 'chess', corr: true });
    expect(host.last('game')).toMatchObject({ open: null, black: { name: ME } });

    // The seat plays: days for every move, the clocks as the room has them.
    const { session } = open(game, seat!.seat, 'black');
    await relay.settle();
    expect(session.getView()).toMatchObject({
      you: 'black',
      open: null,
      firstMove: null,
      clock: { white: 3 * DAY, black: 3 * DAY, running: 'white' },
    });
    await host.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await relay.settle();
    session.move('c7c5');
    // On the board at once: White's days run, Black's are whole again.
    expect(session.getView().clock).toMatchObject({
      white: 3 * DAY,
      black: 3 * DAY,
      running: 'white',
    });
    expect(session.getView().firstMove).toBeNull();
    await relay.settle();
    expect(host.last('move')).toMatchObject({ uci: 'c7c5', ply: 1 });
    expect(session.getView().claimAt).toBeNull();
  });

  it('lets the host play only once the seat is taken', async () => {
    const lobby = relay.lobbyClient();
    await lobby.send({
      t: 'create',
      game: 'chess',
      tc: '1d',
      color: 'white',
      name: ME,
      rating: 1500,
    });
    const created = lobby.last('created')!;
    const { session } = open(created.game as string, created.seat as string, 'white');
    await relay.settle();
    expect(session.getView()).toMatchObject({ open: 'black', status: 'playing' });
    session.move('e2e4');
    expect(session.getView()).toMatchObject({
      moves: [],
      error: 'Your opponent has not joined yet.',
    });
  });

  it('tells its room where to push this device while correspondence notifications are on', async () => {
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/this-device',
      keys: {
        p256dh:
          'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      },
    };
    usePushSubscription.setState({ subscription: sub });
    useSettings.setState({ notifyCorrespondence: true });
    try {
      const lobby = relay.lobbyClient();
      await lobby.send({
        t: 'create',
        game: 'chess',
        tc: '3d',
        color: 'white',
        name: ME,
        rating: null,
      });
      const created = lobby.last('created')!;
      const game = created.game as string;
      // As the app's waiting room keeps it: a correspondence seat.
      rememberSeat(game, created.seat as string, 'white', 'chess', Date.now(), true);
      open(game, created.seat as string, 'white');
      await relay.settle();
      const path = `/v1/games/${game}`;
      expect(relay.sockets.find((s) => s.path === path)?.sentMessages()[0]).toEqual({
        t: 'hello',
        seat: created.seat,
        push: sub,
      });
      // Switched off on this device: the room forgets it at once.
      useSettings.getState().update({ notifyCorrespondence: false });
      await relay.settle();
      expect(lastSent(path)).toEqual({ t: 'push', sub: null });
      useSettings.getState().update({ notifyCorrespondence: true });
      await relay.settle();
      expect(lastSent(path)).toEqual({ t: 'push', sub });

      // A game played at once says nothing of push.
      const live = await newGame('white');
      open(live.game, live.seat, 'white');
      await relay.settle();
      expect(
        relay.sockets.find((s) => s.path === `/v1/games/${live.game}`)?.sentMessages()[0],
      ).toEqual({ t: 'hello', seat: live.seat });
    } finally {
      usePushSubscription.setState({ subscription: null });
      useSettings.setState({ ...DEFAULT_SETTINGS });
    }
  });

  it('tries the seat again after a refusal, and says when someone was quicker', async () => {
    const { game } = await invitation('black');
    const watching = createRelayGame(game, null);
    sessions.push(watching);
    watching.subscribe(() => undefined);
    await relay.settle();
    // Someone else takes it first.
    const quicker = relay.roomClient(game);
    await quicker.send({ t: 'hello', watch: true });
    await quicker.send({ t: 'join', name: 'Quiet Rook', rating: null });
    watching.join();
    await relay.settle();
    expect(watching.getView()).toMatchObject({
      joined: null,
      open: null,
      error: 'This game has both its players.',
      white: { name: 'Quiet Rook' },
    });
    expect(seatOf(game)).toBeNull();
  });
});

describe('analysing a finished game together', () => {
  it('asks the room for the game’s analysis room, which everyone in the game hears of', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    await relay.settle();
    await expect(session.analyse()).rejects.toThrow('The game is still on.');
    session.move('e2e4');
    await relay.settle();
    await opponent.send({ t: 'move', uci: 'e7e5', ply: 1 });
    await opponent.send({ t: 'resign' });
    await relay.settle();

    // A watcher's session may ask as well as a player's.
    const watching = createRelayGame(game, null);
    sessions.push(watching);
    watching.subscribe(() => undefined);
    await relay.settle();

    const asked = session.analyse();
    // Asked twice before the answer: one question, one answer.
    expect(session.analyse()).toBe(asked);
    await relay.settle();
    const room = await asked;
    expect(room).toBe(await analysisRoomId(game));
    expect(session.getView().analysis).toEqual({ room, by: 'white' });
    expect(watching.getView().analysis).toEqual({ room, by: 'white' });
    expect(opponent.last('analysis')).toEqual({ t: 'analysis', room, by: 'white' });

    const again = watching.analyse();
    await relay.settle();
    expect(await again).toBe(room);
    expect(session.getView().analysis).toEqual({ room, by: null });

    // The room in the relay has the game's moves, ready for whoever comes.
    const look = relay.groupClient(room);
    await look.send({ t: 'hello' });
    expect(look.last('room')).toMatchObject({
      kind: 'analysis',
      state: {
        nodes: [
          [1, 0, 'e2e4'],
          [2, 1, 'e7e5'],
        ],
        white: ME,
        black: THEM,
        result: '1-0',
      },
    });
  });

  it('finds the analysis room by the game’s id once the game’s room has gone', async () => {
    const { game, seat, opponent } = await newGame('white');
    const { session } = open(game, seat);
    session.move('e2e4');
    await relay.settle();
    await opponent.send({ t: 'resign' });
    await relay.settle();
    await relay.advance(LIMITS.keepAfterEndMs);
    expect(session.getView().connection).toBe('closed');
    expect(await session.analyse()).toBe(await analysisRoomId(game));
  });
});

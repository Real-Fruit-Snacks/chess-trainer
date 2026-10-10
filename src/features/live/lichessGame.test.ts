import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ratingsFrom } from '@/lib/lichess/auth';
import { useLichess } from '@/store/lichess';
import type { FakeBoard, FakeBoardGame } from '@/test/fakeLichessBoard';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import { createLichessGame } from './lichessGame';
import { lichessTiming } from './lichessStream';
import { recordLiveGame } from './record';
import type { LiveGameSession, LiveGameView } from './types';

vi.mock('./record', () => ({ recordLiveGame: vi.fn() }));

const defaults = { ...lichessTiming };
let lichess: FakeLichessHandle;
let session: LiveGameSession | null = null;
let token = '';

function signIn(): void {
  token = lichess.fake.issueToken();
  useLichess
    .getState()
    .connect({ id: 'learner', username: 'Learner', token, expiresAt: null }, ratingsFrom(null));
}

function current(): LiveGameSession {
  if (!session) throw new Error('No game open.');
  return session;
}

const view = (): LiveGameView => current().getView();

/** A game of the account's against the stand-in's stranger, with this device connected to it. */
async function play(options: Parameters<FakeBoard['startGame']>[0] = {}) {
  if (!useLichess.getState().account) signIn();
  const game = lichess.fake.board.startGame({ announce: false, ...options });
  session = createLichessGame(game.id);
  await vi.waitFor(() => expect(view().connection).toBe('open'));
  return { game, opponent: lichess.fake.board.opponentIn(game.id) };
}

/** Lets what is on its way (a request, a line of the stream) arrive. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const requests = (prefix: string) => lichess.fake.requests.filter((r) => r.startsWith(prefix));

const recorded = () => vi.mocked(recordLiveGame).mock.calls.map(([recordedView]) => recordedView);

beforeEach(() => {
  localStorage.clear();
  useLichess.getState().forget();
  vi.mocked(recordLiveGame).mockClear();
  lichess = installFakeLichess();
  Object.assign(lichessTiming, { resumeMs: 10, retryMs: 10, retryMaxMs: 50 });
});

afterEach(async () => {
  session?.close();
  session = null;
  await vi.waitFor(() => expect(lichess.fake.board.openStreams()).toEqual([]));
  Object.assign(lichessTiming, defaults);
  vi.unstubAllGlobals();
});

describe('a Lichess game', () => {
  it('shows the game from its first line, from either side', async () => {
    const { game } = await play({ color: 'white', tc: '15+10', rated: true });
    expect(view()).toMatchObject({
      source: 'lichess',
      id: game.id,
      connection: 'open',
      missing: false,
      you: 'white',
      white: { name: 'Learner', rating: 1650, title: null },
      black: { name: 'Stranger', rating: 1650, title: null },
      tc: '15+10',
      rated: true,
      moves: [],
      status: 'playing',
      result: null,
      reason: null,
      offers: { draw: null, takeback: null, rematch: null },
      opponentPresent: true,
      claimAt: null,
      chat: [],
      next: null,
      error: null,
      url: `https://lichess.org/${game.id}`,
      capabilities: { phrases: false, rematch: false, takeback: true },
    });
    expect(view().clock).toMatchObject({ white: 900_000, black: 900_000, running: null });
    // White has 30 seconds (rapid) to make a first move.
    const first = view().firstMove;
    expect(first?.color).toBe('white');
    expect((first?.deadline ?? 0) - performance.now()).toBeGreaterThan(29_000);
    expect((first?.deadline ?? 0) - performance.now()).toBeLessThanOrEqual(30_000);
    current().close();

    await play({
      color: 'black',
      tc: '30+0',
      opponent: { id: 'master', name: 'Master', title: 'IM', rating: 2400 },
    });
    expect(view()).toMatchObject({
      you: 'black',
      white: { name: 'Master', rating: 2400, title: 'IM' },
      black: { name: 'Learner', rating: 1700, title: null },
      tc: '30+0',
      rated: false,
    });
  });

  it('follows the opponent’s moves and the clocks', async () => {
    const { game, opponent } = await play({ color: 'black', tc: '15+10' });
    opponent.move('e2e4');
    await vi.waitFor(() => expect(view().moves).toEqual(['e2e4']));
    expect(view().firstMove?.color).toBe('black');
    expect(view().clock?.running).toBeNull();

    // A move of this device's shows at once; Black's first move starts the clocks.
    current().move('e7e5');
    expect(view().moves).toEqual(['e2e4', 'e7e5']);
    expect(view().clock).toMatchObject({ white: 900_000, black: 900_000, running: 'white' });
    expect(view().firstMove).toBeNull();
    await vi.waitFor(() => expect(game.moves).toEqual(['e2e4', 'e7e5']));

    // The opponent thinks for five seconds on Lichess's clock, and gains the increment.
    lichess.fake.clock += 5000;
    opponent.move('g1f3');
    await vi.waitFor(() => expect(view().moves).toHaveLength(3));
    expect(view().clock).toMatchObject({ white: 905_000, black: 900_000, running: 'black' });

    // Black's own move: its time runs down from the state's arrival, plus the increment.
    current().move('b8c6');
    const clock = view().clock;
    expect(clock?.running).toBe('white');
    expect(clock?.black).toBeGreaterThan(905_000);
    expect(clock?.black).toBeLessThanOrEqual(910_000);
  });

  it('keeps every view as it was: each change makes a new one', async () => {
    const { opponent } = await play({ color: 'black' });
    const before = view();
    const seen: LiveGameView[] = [];
    const unsubscribe = current().subscribe(() => seen.push(view()));
    opponent.move('d2d4');
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(before.moves).toEqual([]);
    expect(view()).not.toBe(before);
    expect(current().getView()).toBe(current().getView());
    unsubscribe();
    const count = seen.length;
    opponent.offerDraw();
    current().move('d7d5');
    await settle();
    expect(seen).toHaveLength(count);
    // Lichess's keep-alive lines change nothing.
    const quiet = view();
    lichess.fake.board.keepAlive();
    await settle();
    expect(view()).toBe(quiet);
  });

  it('puts Lichess’s last state back when it refuses a move, and sends no move it cannot take', async () => {
    const { game, opponent } = await play({ color: 'white' });
    lichess.fake.failNext(/^POST \/api\/board\/game\/\w+\/move\//, 400, {
      body: JSON.stringify({ error: 'Not your turn, or game already over' }),
    });
    current().move('e2e4');
    expect(view().moves).toEqual(['e2e4']);
    await vi.waitFor(() => expect(view().moves).toEqual([]));
    expect(view().error).toBe('Lichess refused: Not your turn, or game already over.');
    expect(view().firstMove?.color).toBe('white');
    expect(game.moves).toEqual([]);

    // Played again it goes through; the error goes with the next change.
    current().move('e2e4');
    expect(view().error).toBeNull();
    await vi.waitFor(() => expect(game.moves).toEqual(['e2e4']));

    current().move('e7e5');
    expect(view().error).toBe('It is not your turn.');
    opponent.move('e7e5');
    await vi.waitFor(() => expect(view().moves).toHaveLength(2));
    current().move('e1e3');
    expect(view().error).toBe('That move is not legal.');
    expect(view().moves).toHaveLength(2);
    expect(requests('POST /api/board/game/')).toHaveLength(2);
  });

  it('shows a draw offer until it is declined, and Lichess’s silence after a decline does not bring it back', async () => {
    const { game, opponent } = await play({ color: 'white', moves: ['e2e4', 'e7e5'] });
    opponent.offerDraw();
    await vi.waitFor(() => expect(view().offers.draw).toBe('black'));
    current().draw('decline');
    expect(view().offers.draw).toBeNull();
    await vi.waitFor(() => expect(game.drawOffer.black).toBe(false));
    await settle();
    expect(view().offers.draw).toBeNull();
  });

  it('takes a move as the answer to an offer, as Lichess does', async () => {
    const { game, opponent } = await play({ color: 'white', moves: ['e2e4', 'e7e5'] });
    opponent.offerDraw();
    await vi.waitFor(() => expect(view().offers.draw).toBe('black'));
    current().move('g1f3');
    expect(view().offers.draw).toBeNull();
    // Lichess's state for the move still shows the offer (it declines it just after).
    await vi.waitFor(() => expect(game.moves).toHaveLength(3));
    await settle();
    expect(view().offers.draw).toBeNull();

    // This device's offer stands across nothing but its own move.
    current().draw('offer');
    await vi.waitFor(() => expect(view().offers.draw).toBe('white'));
    opponent.move('b8c6');
    await vi.waitFor(() => expect(view().moves).toHaveLength(4));
    expect(view().offers.draw).toBeNull();
    expect(game.drawOffer.white).toBe(false);
  });

  it('ends in a draw by agreement either way, and keeps the game once', async () => {
    const first = await play({ color: 'white', moves: ['e2e4', 'e7e5'] });
    current().draw('offer');
    await vi.waitFor(() => expect(view().offers.draw).toBe('white'));
    first.opponent.offerDraw();
    await vi.waitFor(() => expect(view().status).toBe('over'));
    expect(view()).toMatchObject({
      result: '1/2-1/2',
      reason: 'agreement',
      offers: { draw: null, takeback: null, rematch: null },
    });
    expect(view().clock?.running).toBeNull();
    await vi.waitFor(() => expect(view().connection).toBe('closed'));
    expect(recorded()).toHaveLength(1);
    expect(recorded()[0]).toMatchObject({ status: 'over', reason: 'agreement', id: first.game.id });
    current().close();

    const second = await play({ color: 'black', moves: ['d2d4', 'd7d5'] });
    second.opponent.offerDraw();
    await vi.waitFor(() => expect(view().offers.draw).toBe('white'));
    current().draw('accept');
    await vi.waitFor(() => expect(view().status).toBe('over'));
    expect(view()).toMatchObject({ result: '1/2-1/2', reason: 'agreement' });
    expect(recorded()).toHaveLength(2);
  });

  it('asks for takebacks, and answers the opponent’s', async () => {
    const { game, opponent } = await play({ color: 'white', moves: ['e2e4', 'e7e5'] });
    current().move('g1f3');
    await vi.waitFor(() => expect(game.moves).toHaveLength(3));
    current().takeback('offer');
    await vi.waitFor(() => expect(view().offers.takeback).toBe('white'));
    // Accepted: the proposer moved last, so one move goes.
    opponent.proposeTakeback();
    await vi.waitFor(() => expect(view().moves).toEqual(['e2e4', 'e7e5']));
    expect(view().offers.takeback).toBeNull();

    current().move('d2d4');
    await vi.waitFor(() => expect(game.moves).toHaveLength(3));
    opponent.move('d7d5');
    await vi.waitFor(() => expect(view().moves).toHaveLength(4));
    opponent.proposeTakeback();
    await vi.waitFor(() => expect(view().offers.takeback).toBe('black'));
    current().takeback('decline');
    expect(view().offers.takeback).toBeNull();
    await vi.waitFor(() => expect(game.takebackAt.black).toBe(0));

    opponent.proposeTakeback();
    await vi.waitFor(() => expect(view().offers.takeback).toBe('black'));
    current().takeback('accept');
    await vi.waitFor(() => expect(view().moves).toEqual(['e2e4', 'e7e5', 'd2d4']));
    expect(view().offers.takeback).toBeNull();
  });

  it('says when the opponent left, and claims the win once Lichess allows it', async () => {
    const { game } = await play({ color: 'white', moves: ['e2e4', 'e7e5'] });
    current().move('g1f3');
    await vi.waitFor(() => expect(game.moves).toHaveLength(3));
    lichess.fake.board.leave(game.id, 10);
    await vi.waitFor(() => expect(view().opponentPresent).toBe(false));
    const wait = (view().claimAt ?? 0) - performance.now();
    expect(wait).toBeGreaterThan(9_000);
    expect(wait).toBeLessThanOrEqual(10_000);

    current().claim('win');
    await vi.waitFor(() =>
      expect(view().error).toBe('Lichess refused: You cannot claim victory in this game.'),
    );
    expect(view().status).toBe('playing');

    // Lichess counts down and says so again.
    lichess.fake.board.advance(10_000);
    await vi.waitFor(() =>
      expect((view().claimAt ?? Infinity) - performance.now()).toBeLessThan(1000),
    );
    current().claim('win');
    await vi.waitFor(() => expect(view().status).toBe('over'));
    expect(view()).toMatchObject({
      result: '1-0',
      reason: 'abandoned',
      opponentPresent: true,
      claimAt: null,
    });
    expect(recorded()).toHaveLength(1);
  });

  it('shows the opponent back, and claims a draw', async () => {
    const { game } = await play({ color: 'black', moves: ['e2e4', 'e7e5', 'g1f3'] });
    current().move('b8c6');
    await vi.waitFor(() => expect(game.moves).toHaveLength(4));
    lichess.fake.board.leave(game.id, 0);
    await vi.waitFor(() => expect(view().opponentPresent).toBe(false));
    lichess.fake.board.comeBack(game.id);
    await vi.waitFor(() => expect(view().opponentPresent).toBe(true));
    expect(view().claimAt).toBeNull();

    lichess.fake.board.leave(game.id, 0);
    await vi.waitFor(() => expect(view().opponentPresent).toBe(false));
    current().claim('draw');
    await vi.waitFor(() => expect(view().status).toBe('over'));
    expect(view()).toMatchObject({ result: '1/2-1/2', reason: 'abandoned' });
  });

  it('takes the opponent’s move as a sign they are back', async () => {
    const { game, opponent } = await play({ color: 'white', moves: ['e2e4', 'e7e5'] });
    current().move('g1f3');
    await vi.waitFor(() => expect(game.moves).toHaveLength(3));
    lichess.fake.board.leave(game.id, 30);
    await vi.waitFor(() => expect(view().opponentPresent).toBe(false));
    opponent.move('b8c6');
    await vi.waitFor(() => expect(view().moves).toHaveLength(4));
    expect(view()).toMatchObject({ opponentPresent: true, claimAt: null });
  });
});

interface Scenario {
  name: string;
  setup: Parameters<FakeBoard['startGame']>[0];
  end: (game: FakeBoardGame, session: LiveGameSession) => void;
  expected: Partial<LiveGameView>;
}

describe('the end of a Lichess game', () => {
  const opponentOf = (game: FakeBoardGame) => lichess.fake.board.opponentIn(game.id);
  const scenarios: Scenario[] = [
    {
      name: 'the opponent resigns',
      setup: { color: 'white', moves: ['e2e4', 'e7e5'] },
      end: (game) => opponentOf(game).resign(),
      expected: { result: '1-0', reason: 'resign' },
    },
    {
      name: 'this device resigns',
      setup: { color: 'black', moves: ['e2e4', 'e7e5'] },
      end: (_game, s) => s.resign(),
      expected: { result: '1-0', reason: 'resign' },
    },
    {
      name: 'checkmate',
      setup: { color: 'black', moves: ['f2f3', 'e7e5', 'g2g4'] },
      end: (_game, s) => s.move('d8h4'),
      expected: { result: '0-1', reason: 'checkmate' },
    },
    {
      name: 'this device’s flag falls',
      setup: { color: 'white', moves: ['e2e4', 'e7e5'] },
      end: (game) => lichess.fake.board.flag(game.id),
      expected: { result: '0-1', reason: 'time' },
    },
    {
      name: 'an abort before both sides have moved',
      setup: { color: 'white' },
      end: (_game, s) => s.abort(),
      expected: { result: '*', reason: 'aborted' },
    },
    {
      name: 'no first move in time',
      setup: { color: 'black', moves: ['e2e4'] },
      end: (game) => lichess.fake.board.expire(game.id),
      expected: { result: '*', reason: 'aborted' },
    },
    {
      name: 'no first move in time in a tournament game',
      setup: { color: 'white', mandatory: true },
      end: (game) => lichess.fake.board.expire(game.id),
      expected: { result: '0-1', reason: 'no-start' },
    },
    {
      name: 'a threefold repetition claimed',
      setup: {
        color: 'white',
        moves: ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'],
      },
      end: (_game, s) => s.draw('offer'),
      expected: { result: '1/2-1/2', reason: 'repetition' },
    },
    {
      name: 'a resignation against a side that cannot mate',
      setup: { color: 'white', moves: ['e2e4', 'e7e5'] },
      end: (game) => lichess.fake.board.end(game.id, 'insufficientMaterialClaim'),
      expected: { result: '1/2-1/2', reason: 'insufficient' },
    },
    {
      name: 'a cheat detected',
      setup: { color: 'white', moves: ['e2e4', 'e7e5'] },
      end: (game) => lichess.fake.board.end(game.id, 'cheat', 'white'),
      expected: { result: '1-0', reason: 'other' },
    },
    {
      name: 'a stalemate',
      setup: { color: 'white', moves: ['e2e4', 'e7e5'] },
      end: (game) => lichess.fake.board.end(game.id, 'stalemate'),
      expected: { result: '1/2-1/2', reason: 'stalemate' },
    },
  ];

  it.each(scenarios)('maps $name, and keeps the game once', async ({ setup, end, expected }) => {
    const { game } = await play(setup);
    end(game, current());
    await vi.waitFor(() => expect(view().status).toBe('over'));
    expect(view()).toMatchObject(expected);
    await vi.waitFor(() => expect(view().connection).toBe('closed'));
    expect(view().clock?.running ?? null).toBeNull();
    expect(recorded()).toHaveLength(1);
    expect(recorded()[0]).toMatchObject({ status: 'over', ...expected });
    // Nothing more goes to Lichess for a finished game.
    const sent = requests('POST /api/board/game/').length;
    current().resign();
    current().move('a2a3');
    await settle();
    expect(requests('POST /api/board/game/')).toHaveLength(sent);
  });

  it('shows a finished game opened afterwards, and keeps it once more (My games keeps each once)', async () => {
    signIn();
    const game = lichess.fake.board.startGame({ moves: ['e2e4', 'e7e5'], announce: false });
    lichess.fake.board.opponentIn(game.id).resign();
    session = createLichessGame(game.id);
    await vi.waitFor(() => expect(view().status).toBe('over'));
    expect(view()).toMatchObject({ result: '1-0', reason: 'resign', moves: ['e2e4', 'e7e5'] });
    await vi.waitFor(() => expect(view().connection).toBe('closed'));
    expect(recorded()).toHaveLength(1);
  });
});

describe('the connection to a Lichess game', () => {
  it('opens the stream again when it ends or drops, counting nothing twice', async () => {
    const { game, opponent } = await play({ color: 'white' });
    current().move('e2e4');
    await vi.waitFor(() => expect(game.moves).toEqual(['e2e4']));
    lichess.fake.board.endStreams('game');
    // A move made while the stream is away comes with the next connection's `gameFull`.
    opponent.move('e7e5');
    await vi.waitFor(() => expect(view().moves).toEqual(['e2e4', 'e7e5']));
    expect(view().connection).toBe('open');

    const states: string[] = [];
    current().subscribe(() => {
      if (states.at(-1) !== view().connection) states.push(view().connection);
    });
    lichess.fake.board.dropStreams('game');
    await vi.waitFor(() => expect(states).toEqual(['reconnecting', 'open']));
    current().move('g1f3');
    await vi.waitFor(() => expect(game.moves).toHaveLength(3));
    opponent.move('b8c6');
    await vi.waitFor(() => expect(view().moves).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']));
    expect(requests(`GET /api/board/game/stream/${game.id}`)).toHaveLength(3);
  });

  it('keeps a move made while the stream is away, until Lichess’s state has it', async () => {
    const { game } = await play({ color: 'white' });
    lichessTiming.resumeMs = 150;
    lichess.fake.board.endStreams('game');
    current().move('d2d4');
    await vi.waitFor(() => expect(game.moves).toEqual(['d2d4']));
    expect(view().moves).toEqual(['d2d4']);
    await vi.waitFor(() =>
      expect(requests(`GET /api/board/game/stream/${game.id}`)).toHaveLength(2),
    );
    await settle();
    expect(view().moves).toEqual(['d2d4']);
    expect(view().firstMove?.color).toBe('black');
  });

  it('plays through long polls, as end-to-end tests serve the stream', async () => {
    lichess = installFakeLichess(lichess.fake, { streams: false });
    lichess.fake.board.pollMs = 40;
    const { game, opponent } = await play({ color: 'white' });
    current().move('e2e4');
    await vi.waitFor(() => expect(game.moves).toEqual(['e2e4']));
    opponent.move('e7e5');
    await vi.waitFor(() => expect(view().moves).toEqual(['e2e4', 'e7e5']));
    current().move('g1f3');
    await vi.waitFor(() => expect(game.moves).toHaveLength(3));
    opponent.offerDraw();
    await vi.waitFor(() => expect(view().offers.draw).toBe('black'));
    // Many answers later, still one copy of each move, and the connection never seemed lost.
    await vi.waitFor(() =>
      expect(requests(`GET /api/board/game/stream/${game.id}`).length).toBeGreaterThan(5),
    );
    expect(view()).toMatchObject({ moves: ['e2e4', 'e7e5', 'g1f3'], connection: 'open' });
    expect(view().offers.draw).toBe('black');
    opponent.resign();
    await vi.waitFor(() => expect(view().status).toBe('over'));
    await vi.waitFor(() => expect(view().connection).toBe('closed'));
    expect(recorded()).toHaveLength(1);
    const polls = requests(`GET /api/board/game/stream/${game.id}`).length;
    await settle();
    expect(requests(`GET /api/board/game/stream/${game.id}`)).toHaveLength(polls);
  });

  it('says when Lichess has no such game for the account', async () => {
    signIn();
    session = createLichessGame('nosuchgm');
    await vi.waitFor(() => expect(view().connection).toBe('closed'));
    expect(view()).toMatchObject({
      missing: true,
      error: 'Lichess has no such game for this account.',
    });
    expect(recorded()).toEqual([]);
  });

  it('stops when Lichess refuses the sign-in, and asks to connect again', async () => {
    const { game } = await play({ color: 'white' });
    lichess.fake.tokens.delete(token);
    lichess.fake.board.dropStreams(`game ${game.id}`);
    await vi.waitFor(() => expect(view().connection).toBe('closed'));
    expect(view().error).toBe('Lichess no longer accepts this device’s sign-in.');
    expect(useLichess.getState().needsReconnect).toBe(true);
  });

  it('ends the stream on close, and sends nothing after', async () => {
    const { game } = await play({ color: 'white' });
    expect(lichess.fake.board.openStreams()).toEqual([`game ${game.id}`]);
    current().close();
    expect(view().connection).toBe('closed');
    await vi.waitFor(() => expect(lichess.fake.board.openStreams()).toEqual([]));
    current().move('e2e4');
    current().resign();
    await settle();
    expect(requests('POST /api/board/game/')).toEqual([]);
  });
});

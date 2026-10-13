import { beforeEach, describe, expect, it } from 'vitest';
import { FakeLichess, type FakeResponse } from './fakeLichess';

/**
 * The stand-in's Board API keeps to lila's rules: the unit tests of the live
 * games and the end-to-end tests both lean on it.
 */

let fake: FakeLichess;
let token: string;

function send(
  method: string,
  path: string,
  options: { body?: string; token?: string | null; streams?: boolean; signal?: AbortSignal } = {},
): Promise<FakeResponse> {
  const bearer = options.token === undefined ? token : options.token;
  return fake.handle(
    {
      method,
      url: `https://lichess.org${path}`,
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      body: options.body ?? '',
    },
    { streams: options.streams ?? true, ...(options.signal ? { signal: options.signal } : {}) },
  );
}

/** Reads an open answer: its lines (null for a blank one) as they come, and whether it ended. */
function listen(res: FakeResponse) {
  const lines: (Record<string, unknown> | null)[] = [];
  const state = { ended: false };
  let buffer = '';
  res.stream?.attach({
    write: (text) => {
      buffer += text;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        lines.push(line ? (JSON.parse(line) as Record<string, unknown>) : null);
        newline = buffer.indexOf('\n');
      }
    },
    end: () => {
      state.ended = true;
    },
    fail: () => {
      state.ended = true;
    },
  });
  return { lines, state, close: () => res.stream?.detach() };
}

const body = (res: FakeResponse) => JSON.parse(res.body) as Record<string, unknown>;
const seekForm = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const ofType = (lines: (Record<string, unknown> | null)[], type: string) =>
  lines.filter((line) => line?.type === type);

beforeEach(() => {
  fake = new FakeLichess();
  token = fake.issueToken();
});

describe('the stand-in’s seeks', () => {
  it('wants a token that may play', async () => {
    expect((await send('POST', '/api/board/seek', { token: null })).status).toBe(401);
    const narrow = fake.issueToken(['puzzle:read']);
    const refused = await send('POST', '/api/board/seek', { token: narrow });
    expect(refused.status).toBe(403);
    expect(body(refused).error).toBe('Missing scope: board:play');
    // The event stream also takes challenge:read.
    const events = await send('GET', '/api/stream/event', {
      token: fake.issueToken(['challenge:read']),
    });
    expect(events.status).toBe(200);
    listen(events).close();
  });

  it('takes rapid and slower real-time seeks only', async () => {
    const blitz = await send('POST', '/api/board/seek', {
      body: seekForm({ time: '5', increment: '3' }),
    });
    expect(blitz.status).toBe(400);
    expect(body(blitz)).toEqual({ error: { global: ['Invalid time control'] } });
    expect((await send('POST', '/api/board/seek', { body: seekForm({ days: '3' }) })).status).toBe(
      400,
    );
    expect(
      (await send('POST', '/api/board/seek', { body: seekForm({ time: '0', increment: '0' }) }))
        .status,
    ).toBe(400);
    expect(fake.board.seeks).toEqual([]);
    // Lila's defaults (10+5) are rapid.
    const seek = listen(await send('POST', '/api/board/seek'));
    expect(fake.board.seeks).toMatchObject([
      { time: 10, increment: 5, rated: false, color: 'random' },
    ]);
    seek.close();
  });

  it('keeps one open seek per account, and withdraws a seek when its answer closes', async () => {
    const form = seekForm({ time: '15', increment: '10', color: 'white', rated: 'true' });
    const first = listen(await send('POST', '/api/board/seek', { body: form }));
    const second = await send('POST', '/api/board/seek', { body: form });
    expect(second.status).toBe(429);
    expect(second.body).toBe('Please only run 1 request(s) at a time');
    expect(fake.board.seeks).toHaveLength(1);
    first.close();
    expect(fake.board.seeks).toEqual([]);
    expect(fake.board.openStreams()).toEqual([]);
  });

  it('starts the game when an opponent takes the seek, and ends the seek’s answer', async () => {
    const events = listen(await send('GET', '/api/stream/event'));
    const seek = listen(
      await send('POST', '/api/board/seek', {
        body: seekForm({ time: '10', increment: '0', color: 'black', rated: 'true' }),
      }),
    );
    const game = fake.board.pairSeek({
      opponent: { id: 'gm', name: 'Grandmaster', title: 'GM', rating: 2700 },
    });
    expect(seek.state.ended).toBe(true);
    expect(seek.lines).toEqual([]);
    expect(fake.board.seeks).toEqual([]);
    expect(ofType(events.lines, 'gameStart')).toEqual([
      {
        type: 'gameStart',
        game: expect.objectContaining({
          gameId: game.id,
          id: game.id,
          color: 'black',
          source: 'lobby',
          rated: true,
          speed: 'rapid',
          hasMoved: false,
          isMyTurn: false,
          status: { id: 20, name: 'started' },
          opponent: { id: 'gm', username: 'GM Grandmaster', rating: 2700 },
          compat: { bot: false, board: true },
        }) as unknown,
      },
    ]);
    expect(game).toMatchObject({ initialMs: 600_000, incrementMs: 0, rated: true });
    events.close();
  });

  it('lets a long poll’s seek linger until it is posted again', async () => {
    const answer = await send('POST', '/api/board/seek', { streams: false });
    expect(answer).toMatchObject({ status: 200, body: '\n' });
    expect(fake.board.seeks).toHaveLength(1);
    await send('POST', '/api/board/seek', { streams: false });
    expect(fake.board.seeks).toHaveLength(1);
    fake.board.withdrawSeeks();
    expect(fake.board.seeks).toEqual([]);
  });
});

describe('the stand-in’s event stream', () => {
  it('opens with the games in progress, and keeps one stream per token', async () => {
    const going = fake.board.startGame({ moves: ['e2e4'], announce: false });
    const over = fake.board.startGame({ announce: false });
    fake.board.opponentIn(over.id).abort();
    const first = listen(await send('GET', '/api/stream/event'));
    expect(ofType(first.lines, 'gameStart')).toEqual([
      expect.objectContaining({ game: expect.objectContaining({ gameId: going.id }) as unknown }),
    ]);
    const second = listen(await send('GET', '/api/stream/event'));
    expect(first.state.ended).toBe(true);
    // Another token's stream is another stream.
    const other = listen(await send('GET', '/api/stream/event', { token: fake.issueToken() }));
    expect(second.state.ended).toBe(false);
    fake.board.keepAlive();
    expect(second.lines.at(-1)).toBeNull();
    fake.board.opponentIn(going.id).resign();
    expect(ofType(second.lines, 'gameFinish')).toHaveLength(1);
    second.close();
    other.close();
    expect(fake.board.openStreams()).toEqual([]);
  });

  it('answers a long poll at once with something new, or after pollMs without', async () => {
    fake.board.pollMs = 30;
    const quiet = await send('GET', '/api/stream/event', { streams: false });
    expect(quiet).toMatchObject({ status: 200, body: '' });
    const waiting = send('GET', '/api/stream/event', { streams: false });
    const game = fake.board.startGame();
    const news = await waiting;
    expect(news.body).toContain(`"gameId":"${game.id}"`);
    // A client that gives up gets its answer at once.
    const controller = new AbortController();
    const given = send('GET', '/api/stream/event', { streams: false, signal: controller.signal });
    controller.abort();
    expect((await given).status).toBe(200);
    expect(fake.board.openStreams()).toEqual([]);
  });
});

describe('the stand-in’s games', () => {
  async function stream(id: string) {
    return listen(await send('GET', `/api/board/game/stream/${id}`));
  }
  const command = async (id: string, path: string) => send('POST', `/api/board/game/${id}/${path}`);

  it('streams the full game first, then each change; one stream per game', async () => {
    const game = fake.board.startGame({
      color: 'white',
      tc: '15+10',
      rated: true,
      opponent: { id: 'im', name: 'Master', title: 'IM', rating: 2400 },
    });
    const first = await stream(game.id);
    expect(first.lines[0]).toEqual({
      type: 'gameFull',
      id: game.id,
      variant: { key: 'standard', name: 'Standard', short: 'Std' },
      speed: 'rapid',
      perf: { name: 'Rapid' },
      rated: true,
      createdAt: game.createdAt,
      white: { id: 'learner', name: 'Learner', title: null, rating: 1650 },
      black: { id: 'im', name: 'Master', title: 'IM', rating: 2400 },
      initialFen: 'startpos',
      clock: { initial: 900_000, increment: 10_000 },
      state: {
        type: 'gameState',
        moves: '',
        wtime: 900_000,
        btime: 900_000,
        winc: 10_000,
        binc: 10_000,
        status: 'started',
        expiration: { idleMillis: 0, millisToMove: 30_000 },
      },
    });
    const second = await stream(game.id);
    expect(first.state.ended).toBe(true);
    expect((await command(game.id, 'move/e2e4')).status).toBe(200);
    expect(second.lines.at(-1)).toMatchObject({ type: 'gameState', moves: 'e2e4' });
    second.close();
  });

  it('refuses what lila refuses: another account’s game, a move out of turn, an illegal move', async () => {
    expect((await command('nosuchgm', 'move/e2e4')).status).toBe(404);
    const blitz = fake.board.startGame({ tc: '3+2', announce: false });
    expect(body(await command(blitz.id, 'move/e2e4')).error).toBe(
      'This game cannot be played with the Board API.',
    );
    const game = fake.board.startGame({ color: 'black', announce: false });
    expect(body(await command(game.id, 'move/e7e5')).error).toBe(
      'Not your turn, or game already over',
    );
    fake.board.opponentIn(game.id).move('e2e4');
    expect(body(await command(game.id, 'move/e7e4')).error).toBe('Piece on e7 cannot move to e4');
    expect(body(await command(game.id, 'move/zz')).error).toBe('Invalid UCI: zz');
    expect(() => fake.board.opponentIn(game.id).move('d2d4')).toThrow('Not your turn');
  });

  it('runs the clocks from Black’s first move, with the increment from then on', async () => {
    const game = fake.board.startGame({ color: 'white', tc: '15+10', announce: false });
    const lines = (await stream(game.id)).lines;
    fake.clock += 3000;
    await command(game.id, 'move/e2e4');
    expect(lines.at(-1)).toMatchObject({
      wtime: 900_000,
      btime: 900_000,
      expiration: { idleMillis: 0, millisToMove: 30_000 },
    });
    fake.clock += 4000;
    fake.board.opponentIn(game.id).move('e7e5');
    expect(lines.at(-1)).toMatchObject({ wtime: 900_000, btime: 900_000 });
    expect(lines.at(-1)).not.toHaveProperty('expiration');
    fake.clock += 5000;
    await command(game.id, 'move/g1f3');
    expect(lines.at(-1)).toMatchObject({ wtime: 905_000, btime: 900_000 });
    fake.clock += 2000;
    fake.board.flag(game.id);
    expect(lines.at(-1)).toMatchObject({ status: 'outoftime', winner: 'white', btime: 0 });
  });

  it('aborts before both sides have moved, and resigns after', async () => {
    const early = fake.board.startGame({ announce: false });
    expect((await command(early.id, 'resign')).status).toBe(200);
    expect(early.status).toBe('aborted');
    const going = fake.board.startGame({ moves: ['e2e4', 'e7e5'], announce: false });
    expect(body(await command(going.id, 'abort')).error).toBe('This game can no longer be aborted');
    await command(going.id, 'resign');
    expect(going).toMatchObject({ status: 'resign', winner: 'black' });
  });

  it('keeps lila’s draw rules: twenty plies between offers, a decline sent nowhere, a move as an answer', async () => {
    const game = fake.board.startGame({ color: 'white', moves: ['e2e4', 'e7e5'] });
    const lines = (await stream(game.id)).lines;
    await command(game.id, 'draw/yes');
    expect(lines.at(-1)).toMatchObject({ wdraw: true });
    const opponent = fake.board.opponentIn(game.id);
    const count = lines.length;
    opponent.declineDraw();
    expect(game.drawOffer.white).toBe(false);
    expect(lines).toHaveLength(count);
    // Too soon to offer again: the request is "ok" all the same, and nothing happens.
    expect((await command(game.id, 'draw/yes')).status).toBe(200);
    expect(game.drawOffer.white).toBe(false);
    // The opponent may offer; a move declines it, after a state that still shows it.
    opponent.offerDraw();
    expect(lines.at(-1)).toMatchObject({ bdraw: true });
    await command(game.id, 'move/g1f3');
    expect(lines.at(-1)).toMatchObject({ moves: 'e2e4 e7e5 g1f3', bdraw: true });
    expect(game.drawOffer.black).toBe(false);
  });

  it('takes back one ply or two, as lila counts them', async () => {
    const game = fake.board.startGame({ color: 'white', moves: ['e2e4', 'e7e5', 'g1f3'] });
    const opponent = fake.board.opponentIn(game.id);
    await command(game.id, 'takeback/yes');
    expect(game.takebackAt.white).toBe(3);
    opponent.proposeTakeback();
    expect(game.moves).toEqual(['e2e4', 'e7e5']);
    // Proposed by the side to move: its move and the reply go.
    await command(game.id, 'takeback/yes');
    opponent.proposeTakeback();
    expect(game.moves).toEqual([]);
    // A move declines the other side's proposal.
    const later = fake.board.startGame({ color: 'white', moves: ['e2e4', 'e7e5', 'g1f3'] });
    const lines = (await stream(later.id)).lines;
    fake.board.opponentIn(later.id).proposeTakeback();
    expect(lines.at(-1)).toMatchObject({ btakeback: true });
    expect(later.takebackAt.black).toBe(3);
  });

  it('lets the side not to move claim, once the opponent has been gone long enough', async () => {
    const game = fake.board.startGame({ color: 'white', moves: ['e2e4', 'e7e5', 'g1f3'] });
    const lines = (await stream(game.id)).lines;
    expect(() => fake.board.leave(fake.board.startGame({ announce: false }).id)).toThrow();
    fake.board.leave(game.id, 20);
    expect(lines.at(-1)).toEqual({ type: 'opponentGone', gone: true, claimWinInSeconds: 20 });
    expect(body(await command(game.id, 'claim-victory')).error).toBe(
      'You cannot claim victory in this game',
    );
    fake.board.advance(15_000);
    expect(lines.at(-1)).toEqual({ type: 'opponentGone', gone: true, claimWinInSeconds: 5 });
    // A new connection hears it too.
    const again = await stream(game.id);
    expect(again.lines.at(-1)).toMatchObject({ type: 'opponentGone', claimWinInSeconds: 5 });
    fake.board.advance(5_000);
    expect((await command(game.id, 'claim-victory')).status).toBe(200);
    expect(game).toMatchObject({ status: 'timeout', winner: 'white' });
    expect(again.state.ended).toBe(true);

    // Not on one's own turn.
    const mine = fake.board.startGame({ color: 'white', moves: ['e2e4', 'e7e5'] });
    fake.board.leave(mine.id, 0);
    expect(body(await command(mine.id, 'claim-victory')).error).toBe(
      'This is not the time to claim victory',
    );
    expect(body(await command(mine.id, 'claim-draw')).error).toBe(
      'You cannot claim draw in this game',
    );
  });

  it('streams a finished game as its full state, then the end', async () => {
    const game = fake.board.startGame({ moves: ['e2e4', 'e7e5'], announce: false });
    fake.board.opponentIn(game.id).resign();
    const finished = await stream(game.id);
    expect(finished.lines).toHaveLength(1);
    expect(finished.lines[0]).toMatchObject({
      type: 'gameFull',
      state: { status: 'resign', winner: 'white' },
    });
    expect(finished.state.ended).toBe(true);
    // A long poll of a game in progress waits for something new.
    fake.board.pollMs = 30;
    const going = fake.board.startGame({ announce: false });
    const polled = await send('GET', `/api/board/game/stream/${going.id}`, { streams: false });
    expect(polled.body.trim().split('\n')).toHaveLength(1);
  });
});

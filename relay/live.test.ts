// @vitest-environment node
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { createLiveHub, type Socket, type SocketEvents } from './src/live/hub.mjs';
import { createRoom, type GameState } from './src/live/room.mjs';
import { cannotMate, endOf, playUci, replay } from './src/live/rules.mjs';
import {
  CLOSE,
  isPlayerName,
  LIMITS,
  parseTimeControl,
  randomId,
  speedOf,
} from './src/live/shared.mjs';
import { hashToken } from './src/handler.mjs';

/* ------------------------------------------------------------------ */
/* A world with a clock the test moves                                */
/* ------------------------------------------------------------------ */

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function world() {
  let time = 1_000_000;
  let queue: { at: number; run: () => void }[] = [];
  const hub = createLiveHub({
    now: () => time,
    timers: {
      set: (at, run) => {
        const handle = { at, run };
        queue.push(handle);
        return handle;
      },
      clear: (handle) => {
        queue = queue.filter((h) => h !== handle);
      },
    },
  });
  /** Moves the clock on, firing whatever falls due (in order). */
  async function advance(ms: number) {
    const until = time + ms;
    for (;;) {
      await flush();
      const due = queue.filter((h) => h.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      queue = queue.filter((h) => h !== due);
      time = Math.max(time, due.at);
      due.run();
      await flush();
    }
    time = until;
    await flush();
  }
  /** Moves the clock on without firing anything (a timer that is late). */
  function jump(ms: number) {
    time += ms;
  }
  return { hub, advance, jump, now: () => time };
}

type Message = Record<string, unknown> & { t?: string };

class Client {
  messages: (Message | 'pong')[] = [];
  closed: { code: number; reason: string } | null = null;
  private events: SocketEvents;
  constructor(open: (socket: Socket) => SocketEvents) {
    const socket: Socket = {
      send: (text) => this.messages.push(text === 'pong' ? 'pong' : (JSON.parse(text) as Message)),
      close: (code, reason) => {
        this.closed = { code, reason };
        // A transport reports the close a moment later, as a browser does.
        queueMicrotask(() => void this.events.close());
      },
    };
    this.events = open(socket);
  }
  async send(message: Message | string) {
    await this.events.message(typeof message === 'string' ? message : JSON.stringify(message));
    await flush();
  }
  async leave() {
    this.closed = { code: 1000, reason: 'left' };
    await this.events.close();
    await flush();
  }
  all(t: string): Message[] {
    return this.messages.filter((m): m is Message => m !== 'pong' && m.t === t);
  }
  last(t: string): Message | undefined {
    return this.all(t).at(-1);
  }
  clear() {
    this.messages = [];
  }
}

const NAME_A = 'Patient Bishop';
const NAME_B = 'Swift Knight';

function seek(over: Partial<Message> = {}): Message {
  return {
    t: 'seek',
    tc: '5+3',
    color: 'random',
    name: NAME_A,
    rating: 1500,
    private: false,
    ...over,
  };
}

/** Two players paired through the waiting room, each seated in the game. */
async function paired(w: ReturnType<typeof world>, tc = '5+3') {
  const a = new Client((s) => w.hub.openLobby(s));
  const b = new Client((s) => w.hub.openLobby(s));
  await a.send(seek({ tc, color: 'white' }));
  await b.send(seek({ tc, name: NAME_B, rating: null }));
  const pa = a.last('paired')!;
  const pb = b.last('paired')!;
  const game = pa.game as string;
  const white = new Client((s) => w.hub.openRoom(game, s));
  const black = new Client((s) => w.hub.openRoom(game, s));
  await white.send({ t: 'hello', seat: pa.seat });
  await black.send({ t: 'hello', seat: pb.seat });
  return { game, white, black, seats: { white: pa.seat as string, black: pb.seat as string } };
}

async function play(players: { white: Client; black: Client }, moves: string[], from = 0) {
  for (const [i, uci] of moves.entries()) {
    const ply = from + i;
    await (ply % 2 === 0 ? players.white : players.black).send({ t: 'move', uci, ply });
  }
}

/* ------------------------------------------------------------------ */
/* Shared rules                                                       */
/* ------------------------------------------------------------------ */

describe('shared rules', () => {
  it('reads time controls, and only normal ones', () => {
    expect(parseTimeControl('5+3')).toEqual({ id: '5+3', initialMs: 300_000, incrementMs: 3000 });
    expect(parseTimeControl('180+180')).not.toBeNull();
    for (const bad of ['0+1', '05+3', '5+03', '181+0', '5+181', '5', 'x', 5, null]) {
      expect(parseTimeControl(bad)).toBeNull();
    }
  });

  it('tells the speed the way Lichess does', () => {
    const speed = (id: string) => speedOf(parseTimeControl(id)!);
    expect(speed('1+0')).toBe('bullet');
    expect(speed('5+3')).toBe('blitz');
    expect(speed('8+0')).toBe('rapid');
    expect(speed('10+0')).toBe('rapid');
    expect(speed('5+5')).toBe('rapid');
    expect(speed('30+0')).toBe('classical');
  });

  it('accepts only names made of the two lists', () => {
    expect(isPlayerName(NAME_A)).toBe(true);
    expect(isPlayerName('Patient  Bishop')).toBe(false);
    expect(isPlayerName('patient bishop')).toBe(false);
    expect(isPlayerName('Rude Words')).toBe(false);
    expect(isPlayerName('Patient Bishop Bishop')).toBe(false);
  });

  it('makes ids of the right length', () => {
    expect(randomId(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomId(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('chess rules', () => {
  it('plays UCI moves, promotions and castling, and refuses anything else', () => {
    const chess = new Chess();
    expect(playUci(chess, 'e2e4')?.san).toBe('e4');
    expect(playUci(chess, 'e2e4')).toBeNull();
    expect(playUci(chess, 'e7e5x')).toBeNull();
    expect(playUci(chess, 42)).toBeNull();
    const castle = replay(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
    expect(castle && playUci(castle, 'e1g1')?.san).toBe('O-O');
    const promote = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    expect(playUci(promote, 'e7e8n')?.san).toBe('e8=N');
    expect(replay(['e2e4', 'e2e4'])).toBeNull();
  });

  it('ends games by mate, stalemate, a dead position, repetition and fifty moves', () => {
    expect(endOf(replay(['f2f3', 'e7e5', 'g2g4', 'd8h4'])!)).toEqual({
      result: '0-1',
      reason: 'checkmate',
    });
    expect(endOf(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))?.reason).toBe('stalemate');
    expect(endOf(new Chess('8/8/4k3/8/8/2K5/2B5/8 b - - 0 1'))?.reason).toBe('insufficient');
    const knights = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    expect(endOf(replay([...knights, ...knights])!)?.reason).toBe('repetition');
    expect(endOf(new Chess('4k3/8/8/8/8/8/R7/4K3 w - - 100 80'))?.reason).toBe('fifty-moves');
    expect(endOf(new Chess())).toBeNull();
  });

  it('knows who cannot mate when the other flag falls', () => {
    const can = (fen: string, color: 'w' | 'b') => !cannotMate(new Chess(fen), color);
    // A bare king, and a lone minor against a bare king: no mate.
    expect(can('8/8/4k3/8/8/2K5/8/7q w - - 0 1', 'w')).toBe(false);
    expect(can('8/8/4k3/8/8/2K5/2N5/8 b - - 0 1', 'w')).toBe(false);
    // A knight against a king with something to block it: mate is possible.
    expect(can('8/8/4k3/4p3/8/2K5/2N5/8 b - - 0 1', 'w')).toBe(true);
    expect(can('8/8/4k3/4n3/8/2K5/2N5/8 b - - 0 1', 'w')).toBe(true);
    // Bishops on one colour against bishops on the same colour: no mate; the other colour: possible.
    expect(can('8/8/4k3/8/4b3/2K5/8/7B b - - 0 1', 'w')).toBe(false);
    expect(can('8/8/4k3/8/3b4/2K5/8/7B b - - 0 1', 'w')).toBe(true);
    // A pawn, a rook or a queen always could.
    expect(can('8/8/4k3/8/8/2K5/P7/8 b - - 0 1', 'w')).toBe(true);
    expect(can('8/8/4k3/8/8/2K5/8/R7 b - - 0 1', 'w')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The waiting room                                                   */
/* ------------------------------------------------------------------ */

describe('the waiting room', () => {
  it('lists a posted game for everyone, with the head count', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    const b = new Client((s) => w.hub.openLobby(s));
    expect(b.last('lobby')).toMatchObject({ seeks: [], players: 2 });
    await a.send(seek());
    expect(a.last('posted')).toMatchObject({
      seek: { tc: '5+3', color: 'random', name: NAME_A, rating: 1500, private: false },
    });
    expect(b.last('lobby')).toMatchObject({
      seeks: [{ tc: '5+3', color: 'random', name: NAME_A, rating: 1500 }],
      players: 2,
    });
    await a.send({ t: 'cancel' });
    expect(a.last('cancelled')).toBeDefined();
    expect(b.last('lobby')).toMatchObject({ seeks: [] });
  });

  it('pairs a matching game at once, colours as asked', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    const b = new Client((s) => w.hub.openLobby(s));
    const c = new Client((s) => w.hub.openLobby(s));
    await a.send(seek({ color: 'black' }));
    // Both want black: no pairing; a different time control: none either.
    await b.send(seek({ color: 'black', name: NAME_B }));
    await c.send(seek({ tc: '3+0', name: 'Quiet Rook' }));
    expect(c.last('lobby')!.seeks).toHaveLength(3);
    await c.send(seek({ color: 'white', name: 'Quiet Rook' }));
    // The oldest compatible game waits longest: a's.
    expect(a.last('paired')).toMatchObject({
      color: 'black',
      tc: '5+3',
      opponent: { name: 'Quiet Rook', rating: 1500 },
    });
    expect(c.last('paired')).toMatchObject({ color: 'white', opponent: { name: NAME_A } });
    expect(a.last('paired')!.game).toBe(c.last('paired')!.game);
    expect(a.last('paired')!.seat).not.toBe(c.last('paired')!.seat);
    expect(b.last('lobby')!.seeks).toEqual([expect.objectContaining({ name: NAME_B })]);
    expect(w.hub.games()).toBe(1);
  });

  it('keeps a private game out of the list and out of quick pairing, but lets its link join', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    const b = new Client((s) => w.hub.openLobby(s));
    await a.send(seek({ private: true }));
    const id = (a.last('posted')!.seek as { id: string }).id;
    expect(b.last('lobby')!.seeks).toEqual([]);
    await b.send(seek({ name: NAME_B }));
    expect(a.last('paired')).toBeUndefined();
    await b.send({ t: 'join', seek: id, name: NAME_B, rating: 900 });
    expect(a.last('paired')).toMatchObject({ opponent: { name: NAME_B, rating: 900 } });
    expect(b.last('paired')).toMatchObject({ opponent: { name: NAME_A } });
    // b's own posted game went with the pairing.
    expect(a.last('lobby')!.seeks).toEqual([]);
  });

  it('keeps the id a seek brings, so a link shared before a reconnection still works', async () => {
    const w = world();
    const id = randomId(16);
    const a = new Client((s) => w.hub.openLobby(s));
    await a.send(seek({ id, private: true }));
    expect(a.last('posted')).toMatchObject({ seek: { id, private: true } });
    // The connection drops; the poster comes back and posts the same game again.
    await a.leave();
    const back = new Client((s) => w.hub.openLobby(s));
    await back.send(seek({ id, private: true }));
    expect(back.last('posted')).toMatchObject({ seek: { id } });
    // Another socket cannot take an id that is held.
    const other = new Client((s) => w.hub.openLobby(s));
    await other.send(seek({ id, name: NAME_B }));
    expect(other.last('error')).toMatchObject({ code: 'bad-request' });
    expect(other.last('posted')).toBeUndefined();
    // The poster may post again under its own id (a reconnection that raced the old socket).
    await back.send(seek({ id, private: true, tc: '3+2' }));
    expect(back.last('posted')).toMatchObject({ seek: { id, tc: '3+2' } });
    // The link still leads to the poster.
    const friend = new Client((s) => w.hub.openLobby(s));
    await friend.send({ t: 'join', seek: id, name: NAME_B, rating: null });
    expect(back.last('paired')).toMatchObject({ tc: '3+2', opponent: { name: NAME_B } });
    expect(friend.last('paired')).toMatchObject({ opponent: { name: NAME_A } });
    // Something that is not an id is replaced by one of the relay's own.
    const odd = new Client((s) => w.hub.openLobby(s));
    await odd.send(seek({ id: 'not-an-id', private: true }));
    const made = (odd.last('posted')!.seek as { id: string }).id;
    expect(made).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('says when a game to join is gone, and drops a seek with its socket', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    const b = new Client((s) => w.hub.openLobby(s));
    await a.send(seek());
    const id = (a.last('posted')!.seek as { id: string }).id;
    await a.leave();
    expect(b.last('lobby')).toMatchObject({ seeks: [], players: 1 });
    await b.send({ t: 'join', seek: id, name: NAME_B, rating: null });
    expect(b.last('gone')).toEqual({ t: 'gone', seek: id });
  });

  it('refuses what is not allowed', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    for (const bad of [
      seek({ tc: '0+0' }),
      seek({ color: 'green' }),
      seek({ name: 'Hello There' }),
      seek({ rating: 5000 }),
      seek({ private: 'yes' }),
      { t: 'join', seek: 'nope', name: NAME_A, rating: null },
      { t: 'dance' },
    ]) {
      a.clear();
      await a.send(bad);
      expect(a.last('error')).toMatchObject({ code: 'bad-request' });
    }
    await a.send('not json');
    expect(a.last('error')).toMatchObject({ code: 'bad-request' });
    await a.send('ping');
    expect(a.messages.at(-1)).toBe('pong');
  });

  it('closes a socket that sends too much', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    await a.send('x'.repeat(LIMITS.messageBytes + 1));
    expect(a.closed?.code).toBe(CLOSE.tooBig);
    const b = new Client((s) => w.hub.openLobby(s));
    for (let i = 0; i <= LIMITS.rateMessages; i++) await b.send({ t: 'cancel' });
    expect(b.last('error')).toMatchObject({ code: 'rate' });
    expect(b.closed?.code).toBe(CLOSE.policy);
  });

  it('limits the sockets from one address', () => {
    const w = world();
    const clients = Array.from(
      { length: LIMITS.socketsPerAddress + 1 },
      () => new Client((s) => w.hub.openLobby(s, '203.0.113.9')),
    );
    expect(clients.at(-1)!.closed?.code).toBe(CLOSE.full);
    expect(clients.at(-2)!.closed).toBeNull();
    const elsewhere = new Client((s) => w.hub.openLobby(s, '198.51.100.1'));
    expect(elsewhere.closed).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* A game                                                             */
/* ------------------------------------------------------------------ */

describe('a game', () => {
  it('seats only the two players, and tells each the game from their side', async () => {
    const w = world();
    const { game, white, black } = await paired(w);
    expect(white.last('game')).toMatchObject({
      id: game,
      tc: '5+3',
      you: 'white',
      white: { name: NAME_A, rating: 1500 },
      black: { name: NAME_B, rating: null },
      moves: [],
      clock: { white: 300_000, black: 300_000, running: null },
      firstMove: { color: 'white', inMs: LIMITS.firstMoveMs },
      status: 'playing',
      present: { white: true, black: false },
      gone: null,
      next: null,
    });
    // Black sat down second: its snapshot sees both, and White hears of it.
    expect(black.last('game')).toMatchObject({
      you: 'black',
      present: { white: true, black: true },
    });
    expect(white.last('present')).toMatchObject({ white: true, black: true, gone: null });
    const stranger = new Client((s) => w.hub.openRoom(game, s));
    await stranger.send({ t: 'hello', seat: randomId(32) });
    expect(stranger.closed?.code).toBe(CLOSE.noGame);
    const lost = new Client((s) => w.hub.openRoom(randomId(16), s));
    await lost.send({ t: 'hello', seat: randomId(32) });
    expect(lost.closed?.code).toBe(CLOSE.noGame);
  });

  it('closes a socket that never says which seat it is', async () => {
    const w = world();
    const { game } = await paired(w);
    const silent = new Client((s) => w.hub.openRoom(game, s));
    await w.advance(LIMITS.helloMs - 1);
    expect(silent.closed).toBeNull();
    await w.advance(1);
    expect(silent.closed?.code).toBe(CLOSE.noHello);
  });

  it('takes legal moves on the mover’s turn only, and keeps the clocks', async () => {
    const w = world();
    const players = await paired(w);
    const { white, black } = players;
    await black.send({ t: 'move', uci: 'e7e5', ply: 0 });
    expect(black.last('error')).toMatchObject({ code: 'not-now' });
    await white.send({ t: 'move', uci: 'e2e5', ply: 0 });
    expect(white.last('error')).toMatchObject({ code: 'illegal' });
    await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(black.last('move')).toMatchObject({
      uci: 'e2e4',
      ply: 0,
      clock: { running: null },
      firstMove: { color: 'black', inMs: LIMITS.firstMoveMs },
    });
    // A move sent twice (a retry) is refused, with the game to catch up from.
    await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(white.last('error')).toMatchObject({ code: 'not-now' });
    expect(white.last('game')).toMatchObject({ moves: ['e2e4'] });

    await w.advance(5000);
    await black.send({ t: 'move', uci: 'e7e5', ply: 1 });
    // The first moves cost no time; White's clock runs from Black's first move.
    expect(white.last('move')).toMatchObject({
      clock: { white: 300_000, black: 300_000, running: 'white' },
      firstMove: null,
    });
    await w.advance(10_000);
    await white.send({ t: 'move', uci: 'g1f3', ply: 2 });
    expect(black.last('move')).toMatchObject({
      clock: { white: 293_000, black: 300_000, running: 'black' },
    });
    await w.advance(4000);
    black.clear();
    await black.send({ t: 'hello' });
    expect(black.last('game')).toMatchObject({
      moves: ['e2e4', 'e7e5', 'g1f3'],
      clock: { white: 293_000, black: 296_000, running: 'black' },
    });
  });

  it('aborts a game nobody starts, and lets either side abort before both have moved', async () => {
    const w = world();
    const first = await paired(w);
    await w.advance(LIMITS.firstMoveMs);
    expect(first.black.last('end')).toMatchObject({ result: '*', reason: 'no-start' });

    const second = await paired(w);
    await play(second, ['e2e4']);
    await second.black.send({ t: 'abort' });
    expect(second.white.last('end')).toMatchObject({ result: '*', reason: 'aborted' });

    const third = await paired(w);
    await play(third, ['e2e4', 'e7e5']);
    await third.white.send({ t: 'abort' });
    expect(third.white.last('error')).toMatchObject({ code: 'not-now' });
    await third.white.send({ t: 'resign' });
    expect(third.black.last('end')).toMatchObject({ result: '0-1', reason: 'resign' });
  });

  it('ends on mate and on the flag', async () => {
    const w = world();
    const mate = await paired(w);
    await play(mate, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(mate.white.last('end')).toMatchObject({ result: '0-1', reason: 'checkmate' });

    const flag = await paired(w, '1+0');
    await play(flag, ['e2e4', 'e7e5']);
    await w.advance(59_999);
    expect(flag.white.last('end')).toBeUndefined();
    await w.advance(1);
    expect(flag.white.last('end')).toMatchObject({
      result: '0-1',
      reason: 'time',
      clock: { white: 0, black: 60_000, running: null },
    });
    // A move after the flag fell is too late.
    await flag.white.send({ t: 'move', uci: 'g1f3', ply: 2 });
    expect(flag.white.last('error')).toMatchObject({ code: 'over' });
  });

  it('flags a move that comes after the time ran out, before the timer did', async () => {
    const w = world();
    const game = await paired(w, '1+0');
    await play(game, ['e2e4', 'e7e5']);
    w.jump(60_000);
    await game.white.send({ t: 'move', uci: 'g1f3', ply: 2 });
    expect(game.black.last('end')).toMatchObject({ result: '0-1', reason: 'time' });
    expect(game.black.last('move')).toMatchObject({ uci: 'e7e5' });
  });

  it('takes draw offers, declines and the offer lapsing with a move', async () => {
    const w = world();
    const game = await paired(w);
    await play(game, ['e2e4', 'e7e5']);
    await game.white.send({ t: 'draw', op: 'offer' });
    expect(game.black.last('offers')).toMatchObject({ draw: 'white' });
    await game.black.send({ t: 'draw', op: 'decline' });
    expect(game.white.last('offers')).toMatchObject({ draw: null });
    await game.white.send({ t: 'draw', op: 'offer' });
    await play(game, ['g1f3'], 2);
    expect(game.black.last('game')).toBeDefined();
    game.black.clear();
    await game.black.send({ t: 'hello' });
    expect(game.black.last('game')).toMatchObject({ offers: { draw: null } });
    await game.black.send({ t: 'draw', op: 'offer' });
    await game.white.send({ t: 'draw', op: 'offer' });
    expect(game.black.last('end')).toMatchObject({ result: '1/2-1/2', reason: 'agreement' });
  });

  it('takes back one move or two, never the first moves', async () => {
    const w = world();
    const game = await paired(w);
    await play(game, ['e2e4', 'e7e5', 'g1f3']);
    // White just moved: White's takeback undoes one move.
    await game.white.send({ t: 'takeback', op: 'offer' });
    await game.black.send({ t: 'takeback', op: 'accept' });
    expect(game.white.last('undo')).toMatchObject({ plies: 1, clock: { running: 'white' } });
    await play(game, ['b1c3', 'b8c6'], 2);
    // Black just moved; White asks: White's last move and Black's reply go.
    await game.white.send({ t: 'takeback', op: 'offer' });
    await game.black.send({ t: 'takeback', op: 'offer' });
    expect(game.black.last('undo')).toMatchObject({ plies: 2 });
    game.white.clear();
    await game.white.send({ t: 'hello' });
    expect(game.white.last('game')).toMatchObject({ moves: ['e2e4', 'e7e5'] });
    await game.black.send({ t: 'takeback', op: 'offer' });
    expect(game.black.last('error')).toMatchObject({ code: 'not-now' });
    // The position after a takeback is the one played on.
    await play(game, ['d2d4', 'e5d4'], 2);
    expect(game.white.last('move')).toMatchObject({ uci: 'e5d4', ply: 3 });
  });

  it('lets a player claim the game when the other has gone, unless they come back', async () => {
    const w = world();
    const game = await paired(w);
    await play(game, ['e2e4', 'e7e5']);
    await game.black.leave();
    expect(game.white.last('present')).toMatchObject({
      white: true,
      black: false,
      gone: { color: 'black', claimInMs: LIMITS.goneClaimMs },
    });
    await game.white.send({ t: 'claim', op: 'win' });
    expect(game.white.last('error')).toMatchObject({ code: 'not-now' });

    // Black comes back: no claim.
    const back = new Client((s) => w.hub.openRoom(game.game, s));
    await back.send({ t: 'hello', seat: game.seats.black });
    expect(game.white.last('present')).toMatchObject({ black: true, gone: null });
    expect(back.last('game')).toMatchObject({ you: 'black', moves: ['e2e4', 'e7e5'] });

    await back.leave();
    await w.advance(LIMITS.goneClaimMs);
    await game.white.send({ t: 'claim', op: 'win' });
    expect(game.white.last('end')).toMatchObject({ result: '1-0', reason: 'abandoned' });
  });

  it('plays a rematch with the colours swapped', async () => {
    const w = world();
    const game = await paired(w);
    await play(game, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    await game.white.send({ t: 'rematch', op: 'offer' });
    expect(game.black.last('offers')).toMatchObject({ rematch: 'white' });
    await game.black.send({ t: 'rematch', op: 'accept' });
    const forWhite = game.white.last('rematch')!;
    const forBlack = game.black.last('rematch')!;
    expect(forWhite).toMatchObject({ color: 'black' });
    expect(forBlack).toMatchObject({ color: 'white', game: forWhite.game });
    const next = new Client((s) => w.hub.openRoom(forBlack.game as string, s));
    await next.send({ t: 'hello', seat: forBlack.seat });
    expect(next.last('game')).toMatchObject({
      you: 'white',
      white: { name: NAME_B },
      black: { name: NAME_A },
      tc: '5+3',
    });
    // A late return to the old game finds the rematch waiting.
    const late = new Client((s) => w.hub.openRoom(game.game, s));
    await late.send({ t: 'hello', seat: game.seats.white });
    expect(late.last('game')).toMatchObject({
      status: 'over',
      next: { game: forWhite.game, seat: forWhite.seat, color: 'black' },
    });
  });

  it('passes phrases, one every two seconds, and keeps the last ones', async () => {
    const w = world();
    const game = await paired(w);
    await game.white.send({ t: 'say', phrase: 'luck' });
    await game.white.send({ t: 'say', phrase: 'fun' });
    await game.white.send({ t: 'say', phrase: 'You are bad' });
    expect(game.black.all('say')).toEqual([{ t: 'say', by: 'white', phrase: 'luck' }]);
    await w.advance(LIMITS.phraseMs);
    await game.white.send({ t: 'say', phrase: 'fun' });
    expect(game.black.all('say')).toHaveLength(2);
    game.black.clear();
    await game.black.send({ t: 'hello' });
    expect(game.black.last('game')!.chat).toEqual([
      { by: 'white', phrase: 'luck' },
      { by: 'white', phrase: 'fun' },
    ]);
  });

  it('closes the room a while after the end', async () => {
    const w = world();
    const game = await paired(w);
    await game.white.send({ t: 'abort' });
    expect(w.hub.games()).toBe(1);
    await w.advance(LIMITS.keepAfterEndMs);
    expect(game.white.closed?.code).toBe(CLOSE.closed);
    expect(w.hub.games()).toBe(0);
  });
});

describe('a game room waking up', () => {
  it('carries on from what it stored', async () => {
    let stored: GameState | null = null;
    let time = 5_000_000;
    const sockets: { data: never; sent: string[] }[] = [];
    const platform = () => ({
      connections: () =>
        sockets.map((s) => ({
          data: s.data,
          send: (text: string) => s.sent.push(text),
          close: () => undefined,
          save: () => undefined,
        })),
      load: () => Promise.resolve(stored ? structuredClone(stored) : null),
      store: (state: GameState) => {
        stored = structuredClone(state);
        return Promise.resolve();
      },
      remove: () => {
        stored = null;
        return Promise.resolve();
      },
      schedule: () => undefined,
      createGame: () => Promise.resolve(),
      now: () => time,
    });
    const seat = randomId(32);
    const first = createRoom(platform());
    await first.create({
      id: randomId(16),
      tc: '3+2',
      white: { name: NAME_A, rating: null, seatHash: await hashToken(seat) },
      black: { name: NAME_B, rating: null, seatHash: await hashToken(randomId(32)) },
    });
    const socket = {
      data: { id: 'x', seat: null, openedAt: time, rateStart: 0, rateCount: 0 } as never,
      sent: [] as string[],
    };
    sockets.push(socket);
    const conn = platform().connections()[0];
    await first.message(conn, JSON.stringify({ t: 'hello', seat }));
    await first.message(conn, JSON.stringify({ t: 'move', uci: 'd2d4', ply: 0 }));

    // A new instance (the Durable Object woke up) reads the game back and goes on.
    time += 1000;
    const again = createRoom(platform());
    await again.message(conn, JSON.stringify({ t: 'hello' }));
    const snapshot = JSON.parse(socket.sent.at(-1)!) as Message;
    expect(snapshot).toMatchObject({ t: 'game', moves: ['d2d4'], you: 'white' });
    expect(stored!.moves).toEqual(['d2d4']);
  });
});

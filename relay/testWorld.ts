/**
 * The relay's live tests' world: a hub on a clock the test moves, and clients
 * that keep what they are sent. Not a test file itself (live.test.ts and
 * live-games.test.ts share it).
 */
import { createLiveHub, type Socket, type SocketEvents } from './src/live/hub.mjs';
import type { RoomPlatform } from './src/live/room.mjs';

export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * A hub whose clock moves only when the test moves it (pushing through `notify`, if given;
 * drawing Chess960 starts with `chess960Position`, if given).
 */
export function world({
  notify,
  chess960Position,
}: { notify?: RoomPlatform['notify']; chess960Position?: () => number } = {}) {
  let time = 1_000_000;
  let queue: { at: number; run: () => void }[] = [];
  const hub = createLiveHub({
    now: () => time,
    notify,
    chess960Position,
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

export type World = ReturnType<typeof world>;
export type Message = Record<string, unknown> & { t?: string };

export class Client {
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

export const NAME_A = 'Patient Bishop';
export const NAME_B = 'Swift Knight';

export function seek(over: Partial<Message> = {}): Message {
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

export interface Players {
  game: string;
  white: Client;
  black: Client;
  seats: { white: string; black: string };
  kind: unknown;
  opts: unknown;
}

/**
 * Two players paired through the waiting room with the seek `over` (the first
 * poster's waits; the second's matches it), each seated in the game unless
 * `seat` is false.
 */
export async function pairedWith(
  w: World,
  over: Partial<Message>,
  { seat = true }: { seat?: boolean } = {},
): Promise<Players> {
  const a = new Client((s) => w.hub.openLobby(s));
  const b = new Client((s) => w.hub.openLobby(s));
  await a.send(seek(over));
  await b.send(seek({ ...over, name: NAME_B, rating: null, color: 'random' }));
  const pa = a.last('paired');
  const pb = b.last('paired');
  if (!pa || !pb) throw new Error(`Not paired: ${JSON.stringify([a.messages, b.messages])}`);
  const [forWhite, forBlack] = pa.color === 'white' ? [pa, pb] : [pb, pa];
  const game = pa.game as string;
  const white = new Client((s) => w.hub.openRoom(game, s));
  const black = new Client((s) => w.hub.openRoom(game, s));
  if (seat) {
    await white.send({ t: 'hello', seat: forWhite.seat });
    await black.send({ t: 'hello', seat: forBlack.seat });
  }
  return {
    game,
    white,
    black,
    seats: { white: forWhite.seat as string, black: forBlack.seat as string },
    kind: pa.kind,
    opts: pa.opts,
  };
}

/** Two players paired through the waiting room for a game of chess, each seated in it. */
export async function paired(w: World, tc = '5+3') {
  return pairedWith(w, { tc, color: 'white' });
}

export async function play(players: { white: Client; black: Client }, moves: string[], from = 0) {
  for (const [i, uci] of moves.entries()) {
    const ply = from + i;
    await (ply % 2 === 0 ? players.white : players.black).send({ t: 'move', uci, ply });
  }
}

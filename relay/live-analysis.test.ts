// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisState } from './src/live/analysisRoom.mjs';
import { chess960StartFen } from './src/live/chess960.mjs';
import type {
  DurableSocket,
  DurableState,
  DurableStorage,
  LiveEnv,
} from './src/live/cloudflare.mjs';
import {
  ANALYSIS_ROOM,
  analysisRoomId,
  CLOSE,
  GROUP_LIMITS,
  groupOptions,
  ID_PATTERN,
  LIMITS,
} from './src/live/shared.mjs';
import { LiveGroup, LiveLobby, LiveRoom } from './src/worker.mjs';
import {
  Client,
  type Message,
  NAME_A,
  NAME_B,
  paired,
  pairedWith,
  play,
  seek,
  type World,
  world,
} from './testWorld';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Kings on f1 and f8, a knight and a rook beside each: both sides castle short in two moves. */
const KNR = chess960StartFen(192);

interface Snapshot {
  variant: string;
  fen: string;
  white: string | null;
  black: string | null;
  result: string;
  nodes: [number, number, string][];
  at: number;
  shapes: Record<string, { orig: string; dest?: string; brush: string }[]>;
}

const snapshotOf = (client: Client) => client.last('room')?.state as Snapshot;

/** The UCI moves of the snapshot's main line. */
function mainLine(s: Snapshot): string[] {
  const line: string[] = [];
  let parent = 0;
  for (;;) {
    const next = s.nodes.find(([, p]) => p === parent);
    if (!next) return line;
    line.push(next[2]);
    parent = next[0];
  }
}

/** The node reached from the root by `moves`, in a snapshot; -1 when it is not there. */
function nodeAt(s: Snapshot, moves: string[]): number {
  let at = 0;
  for (const uci of moves) {
    const next = s.nodes.find(([, p, u]) => p === at && u === uci);
    if (!next) return -1;
    at = next[0];
  }
  return at;
}

interface Room {
  id: string;
  host: Client;
  hostId: string;
}

/** An analysis room made through the waiting room, its maker's socket in it. */
async function makeRoom(w: World, opts: object): Promise<Room> {
  const lobby = new Client((s) => w.hub.openLobby(s));
  await lobby.send({ t: 'create-room', kind: 'analysis', opts, name: NAME_A, rating: 1500 });
  const made = lobby.last('room-created');
  if (!made) throw new Error(`No room: ${JSON.stringify(lobby.messages)}`);
  const id = made.room as string;
  const host = new Client((s) => w.hub.openGroup(id, s));
  await host.send({ t: 'hello', token: made.token });
  return { id, host, hostId: host.last('room')!.you as string };
}

/** Someone with the link: opens the room, and joins it under `who`. */
async function join(w: World, id: string, who = NAME_B) {
  const client = new Client((s) => w.hub.openGroup(id, s));
  await client.send({ t: 'hello' });
  await client.send({ t: 'join', name: who, rating: null });
  if (!client.last('joined')) throw new Error(`Not joined: ${JSON.stringify(client.messages)}`);
  return client;
}

/** `count` rounds of the knights going out and back: four half-moves each. */
const shuffle = (count: number, moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8']) =>
  Array.from({ length: count }, () => moves.join(' ')).join(' ');

describe('analysis rooms’ options', () => {
  it('are checked for their shape, names only as the app gives them', () => {
    expect(
      groupOptions('analysis', {
        fen: ` ${START} `,
        moves: ' e2e4  e7e5 (c7c5) ',
        white: NAME_A,
        black: '',
        result: '1-0',
        extra: 1,
      }),
    ).toEqual({
      variant: 'standard',
      fen: START,
      moves: 'e2e4 e7e5 (c7c5)',
      result: '1-0',
      white: NAME_A,
    });
    expect(groupOptions('analysis', { fen: START })).toEqual({
      variant: 'standard',
      fen: START,
      moves: '',
      result: '*',
    });
    for (const bad of [
      {},
      { fen: 'not a position' },
      { fen: START, variant: 'atomic' },
      { fen: START, moves: 'e2e4; drop table' },
      { fen: START, moves: 4 },
      { fen: START, moves: 'e2e4 '.repeat(ANALYSIS_ROOM.movesChars / 5 + 1) },
      { fen: START, result: '2-0' },
      // Text a stranger typed never reaches the others: only the app's names pass.
      { fen: START, white: 'Magnus Carlsen' },
    ]) {
      expect(groupOptions('analysis', bad)).toBeNull();
    }
  });

  it('give each game an analysis room id of its own, the same every time', async () => {
    const game = 'g'.repeat(22);
    const id = await analysisRoomId(game);
    expect(id).toMatch(ID_PATTERN);
    expect(await analysisRoomId(game)).toBe(id);
    expect(await analysisRoomId('h'.repeat(22))).not.toBe(id);
  });
});

describe('analysis rooms', () => {
  it('are made from Analyze with a game and its variations, every move checked', async () => {
    const w = world();
    const { host } = await makeRoom(w, {
      fen: START,
      moves: 'e2e4 e7e5 ( c7c5 g1f3 ( b1c3 ) d7d6 ) g1f3 b8c6',
      white: NAME_A,
      black: NAME_B,
      result: '1/2-1/2',
    });
    const s = snapshotOf(host);
    expect(s).toMatchObject({
      variant: 'standard',
      fen: START,
      white: NAME_A,
      black: NAME_B,
      result: '1/2-1/2',
      at: 0,
      shapes: {},
    });
    expect(mainLine(s)).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    expect(nodeAt(s, ['e2e4', 'c7c5', 'g1f3', 'd7d6'])).toBeGreaterThan(0);
    expect(nodeAt(s, ['e2e4', 'c7c5', 'b1c3'])).toBeGreaterThan(0);
    // Every parent comes before its children, the main line first.
    s.nodes.forEach(([, parent], i) => {
      expect(parent === 0 || s.nodes.slice(0, i).some(([id]) => id === parent)).toBe(true);
    });
    expect(s.nodes.map(([, , uci]) => uci)).toEqual([
      'e2e4',
      'e7e5',
      'g1f3',
      'b8c6',
      'c7c5',
      'g1f3',
      'd7d6',
      'b1c3',
    ]);

    // An illegal move, unmatched brackets, a position that is not one: no room.
    const lobby = new Client((so) => w.hub.openLobby(so));
    for (const opts of [
      { fen: START, moves: 'e2e4 e2e4' },
      { fen: START, moves: 'e2e4 ( d2d4' },
      { fen: START, moves: '( e2e4 )' },
      { fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
    ]) {
      lobby.clear();
      await lobby.send({ t: 'create-room', kind: 'analysis', opts, name: NAME_A, rating: null });
      expect(lobby.last('error'), JSON.stringify(opts)).toBeDefined();
      expect(lobby.last('room-created')).toBeUndefined();
    }
    expect(w.hub.groups()).toBe(1);
  });

  it('take a long game through the waiting room, but no other message that large', async () => {
    const w = world();
    const moves = shuffle(140);
    expect(moves.length).toBeGreaterThan(LIMITS.messageBytes);
    const { host } = await makeRoom(w, { fen: START, moves });
    expect(snapshotOf(host).nodes).toHaveLength(560);

    const lobby = new Client((s) => w.hub.openLobby(s));
    await lobby.send({ ...seek(), padding: 'x'.repeat(LIMITS.messageBytes) });
    expect(lobby.closed?.code).toBe(CLOSE.tooBig);
  });

  it('take legal moves only, from any position, and move the shared position', async () => {
    const w = world();
    const room = await makeRoom(w, { fen: START, moves: 'e2e4 e7e5' });
    const guest = await join(w, room.id);
    const e4 = nodeAt(snapshotOf(room.host), ['e2e4']);
    const e5 = nodeAt(snapshotOf(room.host), ['e2e4', 'e7e5']);

    // A variation from 1. e4: everyone hears of the move, and the shared position goes there.
    await guest.send({ t: 'move', node: e4, uci: 'c7c5' });
    const added = room.host.last('added')!;
    const guestId = guest.last('joined')!.member;
    expect(added).toMatchObject({ node: [expect.any(Number), e4, 'c7c5'], at: true, by: guestId });
    const c5 = (added.node as number[])[0];
    expect(room.host.all('at')).toEqual([]);

    // The same move again finds the node; only the shared position moves.
    room.host.clear();
    await room.host.send({ t: 'at', node: 0 });
    await room.host.send({ t: 'move', node: e4, uci: 'c7c5' });
    expect(room.host.all('added')).toEqual([]);
    expect(room.host.last('at')).toMatchObject({ node: c5, by: room.hostId });

    // Browsing alone: the move joins the tree, and the shared position stays where it is.
    guest.clear();
    await guest.send({ t: 'move', node: e5, uci: 'g1f3', go: false });
    expect(guest.last('added')).toMatchObject({
      node: [expect.any(Number), e5, 'g1f3'],
      at: false,
    });
    expect(guest.all('at')).toEqual([]);

    // Illegal moves, moves from no position, promotions as they are: refused, with the room again.
    for (const [msg, code] of [
      [{ t: 'move', node: e5, uci: 'e1e3' }, 'illegal'],
      [{ t: 'move', node: e5, uci: 'e2e4' }, 'illegal'],
      [{ t: 'move', node: e5, uci: 'g1f3n' }, 'illegal'],
      [{ t: 'move', node: 99, uci: 'g1f3' }, 'bad-request'],
      [{ t: 'move', node: 'e5', uci: 'g1f3' }, 'bad-request'],
      [{ t: 'at', node: 99 }, 'bad-request'],
    ] as const) {
      guest.clear();
      await guest.send(msg);
      expect(guest.last('error'), JSON.stringify(msg)).toMatchObject({ code });
      expect(guest.last('room')).toBeDefined();
    }
    expect(snapshotOf(guest).at).toBe(c5);

    // A visitor sees everything, and can change nothing.
    const visitor = new Client((s) => w.hub.openGroup(room.id, s));
    await visitor.send({ t: 'hello' });
    expect(snapshotOf(visitor).nodes).toHaveLength(4);
    await visitor.send({ t: 'move', node: e5, uci: 'd2d4' });
    expect(visitor.last('error')).toMatchObject({ code: 'not-member' });
  });

  it('delete a move and all after it, and make a variation the main line', async () => {
    const w = world();
    const room = await makeRoom(w, {
      fen: START,
      moves: 'e2e4 e7e5 ( c7c5 g1f3 ( b1c3 b8c6 ) d7d6 ) g1f3',
    });
    let s = snapshotOf(room.host);
    const c5 = nodeAt(s, ['e2e4', 'c7c5']);
    const nf3 = nodeAt(s, ['e2e4', 'c7c5', 'g1f3']);
    const nc3 = nodeAt(s, ['e2e4', 'c7c5', 'b1c3']);
    const nc6 = nodeAt(s, ['e2e4', 'c7c5', 'b1c3', 'b8c6']);

    // The Sicilian's 2. Nc3 becomes the main line: each move of it first among its siblings.
    await room.host.send({ t: 'promote', node: nc6 });
    expect(room.host.last('promoted')).toEqual({ t: 'promoted', node: nc6, by: room.hostId });
    await room.host.send({ t: 'hello' });
    s = snapshotOf(room.host);
    expect(mainLine(s)).toEqual(['e2e4', 'c7c5', 'b1c3', 'b8c6']);
    // Already the main line: nothing to say.
    room.host.clear();
    await room.host.send({ t: 'promote', node: nc6 });
    expect(room.host.all('promoted')).toEqual([]);

    // Deleting 1…c5 takes everything after it; the shared position there goes back to 1. e4.
    await room.host.send({ t: 'at', node: nc6 });
    await room.host.send({ t: 'delete', node: c5 });
    const e4 = nodeAt(s, ['e2e4']);
    expect(room.host.last('deleted')).toEqual({
      t: 'deleted',
      node: c5,
      at: e4,
      by: room.hostId,
    });
    await room.host.send({ t: 'hello' });
    s = snapshotOf(room.host);
    expect(s.at).toBe(e4);
    expect(s.nodes.map(([id]) => id)).not.toContain(nf3);
    expect(s.nodes.map(([id]) => id)).not.toContain(nc3);
    expect(mainLine(s)).toEqual(['e2e4', 'e7e5', 'g1f3']);

    // Not the start position, nor a move that has gone.
    for (const node of [0, c5]) {
      room.host.clear();
      await room.host.send({ t: 'delete', node });
      expect(room.host.last('error')).toMatchObject({ code: 'bad-request' });
    }
    // A move played after a deletion gets an id never used before.
    await room.host.send({ t: 'move', node: e4, uci: 'c7c5' });
    expect((room.host.last('added')!.node as number[])[0]).toBeGreaterThan(nc6);
  });

  it('keep the arrows and circles drawn on each position, within bounds', async () => {
    const w = world();
    const room = await makeRoom(w, { fen: START, moves: 'e2e4 e7e5' });
    const guest = await join(w, room.id);
    const e4 = nodeAt(snapshotOf(room.host), ['e2e4']);
    const shapes = [
      { orig: 'g1', dest: 'f3', brush: 'green' },
      { orig: 'e5', brush: 'red' },
      // The same arrow twice counts once; a circle drawn as an arrow to its own square is a circle.
      { orig: 'g1', dest: 'f3', brush: 'blue' },
      { orig: 'd4', dest: 'd4', brush: 'yellow' },
    ];
    await guest.send({ t: 'shapes', node: e4, shapes });
    const drawn = [shapes[0], shapes[1], { orig: 'd4', brush: 'yellow' }];
    expect(room.host.last('shapes')).toEqual({
      t: 'shapes',
      node: e4,
      shapes: drawn,
      by: guest.last('joined')!.member,
    });
    const late = await join(w, room.id, 'Quiet Rook');
    expect(snapshotOf(late).shapes).toEqual({ [e4]: drawn });

    // Cleared: none.
    await room.host.send({ t: 'shapes', node: e4, shapes: [] });
    expect(guest.last('shapes')).toMatchObject({ node: e4, shapes: [] });
    await room.host.send({ t: 'hello' });
    expect(snapshotOf(room.host).shapes).toEqual({});

    for (const bad of [
      [{ orig: 'i9', brush: 'green' }],
      [{ orig: 'e4', brush: 'pink' }],
      [{ orig: 'e4', dest: 'z', brush: 'green' }],
      'e4',
      Array.from({ length: ANALYSIS_ROOM.shapes + 1 }, (_, i) => ({
        orig: `${'abcdefgh'[i % 8]}${1 + Math.floor(i / 8)}`,
        brush: 'green',
      })),
    ]) {
      guest.clear();
      await guest.send({ t: 'shapes', node: e4, shapes: bad });
      expect(guest.last('error'), JSON.stringify(bad)).toMatchObject({ code: 'bad-request' });
    }
  });

  it('hold so many moves, lines so long and arrows so many', async () => {
    const w = world();
    // The deepest line a room keeps: one more move is refused.
    const deep = await makeRoom(w, { fen: START, moves: shuffle(ANALYSIS_ROOM.depth / 4) });
    const s = snapshotOf(deep.host);
    const end = s.nodes.at(-1)![0];
    await deep.host.send({ t: 'move', node: end, uci: 'e2e4' });
    expect(deep.host.last('error')).toMatchObject({ code: 'limit' });
    // A line deeper still cannot even be made.
    const lobby = new Client((so) => w.hub.openLobby(so));
    await lobby.send({
      t: 'create-room',
      kind: 'analysis',
      opts: { fen: START, moves: `${shuffle(ANALYSIS_ROOM.depth / 4)} e2e4` },
      name: NAME_A,
      rating: null,
    });
    expect(lobby.last('error')).toMatchObject({ code: 'failed' });

    // The most moves a tree holds: a main line, and a variation from the start.
    const variation = shuffle((ANALYSIS_ROOM.nodes - ANALYSIS_ROOM.depth) / 4, [
      'b1c3',
      'b8c6',
      'c3b1',
      'c6b8',
    ]);
    const [first, ...rest] = shuffle(ANALYSIS_ROOM.depth / 4).split(' ');
    const full = await makeRoom(w, {
      fen: START,
      moves: `${first} ( ${variation} ) ${rest.join(' ')}`,
    });
    expect(snapshotOf(full.host).nodes).toHaveLength(ANALYSIS_ROOM.nodes);
    await full.host.send({ t: 'move', node: 0, uci: 'e2e4' });
    expect(full.host.last('error')).toMatchObject({ code: 'limit' });
    // A move already there is still found.
    await full.host.send({ t: 'move', node: 0, uci: 'g1f3' });
    expect(full.host.last('at')).toMatchObject({ node: snapshotOf(full.host).nodes[0][0] });

    // Arrows: so many in the whole tree.
    const nodes = snapshotOf(full.host).nodes.map(([id]) => id);
    const sixteen = Array.from({ length: ANALYSIS_ROOM.shapes }, (_, i) => ({
      orig: `${'abcdefgh'[i % 8]}${1 + Math.floor(i / 8)}`,
      brush: 'green',
    }));
    const per = ANALYSIS_ROOM.allShapes / ANALYSIS_ROOM.shapes;
    for (let i = 0; i < per; i++) {
      if (i > 0 && i % 10 === 0) await w.advance(LIMITS.rateWindowMs);
      await full.host.send({ t: 'shapes', node: nodes[i], shapes: sixteen });
    }
    await w.advance(LIMITS.rateWindowMs);
    full.host.clear();
    await full.host.send({ t: 'shapes', node: nodes[per], shapes: sixteen.slice(0, 1) });
    expect(full.host.last('error')).toMatchObject({ code: 'limit' });
    // Redrawing a position's own arrows is fine.
    await full.host.send({ t: 'shapes', node: nodes[0], shapes: sixteen.slice(0, 2) });
    expect(full.host.last('shapes')).toMatchObject({ node: nodes[0] });
  });

  it('play Chess960 by its rules: castling as the king taking its own rook', async () => {
    const w = world();
    const room = await makeRoom(w, { variant: 'chess960', fen: KNR, moves: 'g1f3 g8f6 f1h1' });
    const s = snapshotOf(room.host);
    expect(s.variant).toBe('chess960');
    expect(mainLine(s)).toEqual(['g1f3', 'g8f6', 'f1h1']);
    // Not with the knight still between the king and its rook.
    await room.host.send({ t: 'move', node: 0, uci: 'f1h1' });
    expect(room.host.last('added')).toBeUndefined();
    expect(room.host.last('error')).toMatchObject({ code: 'illegal' });
    const castled = nodeAt(s, ['g1f3', 'g8f6', 'f1h1']);
    await room.host.send({ t: 'move', node: castled, uci: 'f8h8' });
    expect(room.host.last('added')).toMatchObject({ node: [expect.any(Number), castled, 'f8h8'] });
    // The same position as standard chess's: its castling is not this one.
    const lobby = new Client((so) => w.hub.openLobby(so));
    await lobby.send({
      t: 'create-room',
      kind: 'analysis',
      opts: { fen: KNR, moves: 'g1f3 g8f6 f1h1' },
      name: NAME_A,
      rating: null,
    });
    expect(lobby.last('error')).toMatchObject({ code: 'failed' });
  });
});

describe('a game’s analysis room', () => {
  it('is made by the game’s room once it is over, under an id derived from the game’s', async () => {
    const w = world();
    const game = await paired(w);
    await play(game, ['e2e4', 'e7e5', 'g1f3']);
    // Not while the game is on.
    await game.white.send({ t: 'analyse' });
    expect(game.white.last('error')).toMatchObject({ code: 'not-now' });
    expect(w.hub.groups()).toBe(0);

    await game.black.send({ t: 'resign' });
    await game.black.send({ t: 'analyse' });
    const id = await analysisRoomId(game.game);
    expect(game.black.last('analysis')).toEqual({ t: 'analysis', room: id, by: 'black' });
    // Everyone in the game hears where it is, and who asked.
    expect(game.white.last('analysis')).toEqual({ t: 'analysis', room: id, by: 'black' });
    expect(w.hub.groups()).toBe(1);

    // The room has the game as it was played, and nobody in it yet: the first to join hosts it.
    const first = new Client((s) => w.hub.openGroup(id, s));
    await first.send({ t: 'hello' });
    const room = first.last('room')!;
    expect(room).toMatchObject({ kind: 'analysis', members: [], host: '' });
    expect(snapshotOf(first)).toMatchObject({
      variant: 'standard',
      fen: START,
      white: NAME_A,
      black: NAME_B,
      result: '1-0',
      at: 0,
    });
    expect(mainLine(snapshotOf(first))).toEqual(['e2e4', 'e7e5', 'g1f3']);
    await first.send({ t: 'join', name: NAME_B, rating: null });
    expect(first.last('members')).toMatchObject({ host: first.last('joined')!.member });

    // Asked again (the other player, a watcher): the same room, as it is now.
    await first.send({ t: 'move', node: 0, uci: 'd2d4' });
    await game.white.send({ t: 'analyse' });
    expect(game.white.last('analysis')).toEqual({ t: 'analysis', room: id, by: 'white' });
    const eye = new Client((s) => w.hub.openRoom(game.game, s));
    await eye.send({ t: 'hello', watch: true });
    await eye.send({ t: 'analyse' });
    expect(eye.last('analysis')).toEqual({ t: 'analysis', room: id, by: null });
    expect(w.hub.groups()).toBe(1);
    await first.send({ t: 'hello' });
    expect(snapshotOf(first).nodes.map(([, , uci]) => uci)).toContain('d2d4');
  });

  it('is made again once it has gone, and never from the waiting room under that id', async () => {
    const w = world();
    // A correspondence invitation called off: its room is kept for days after its end.
    const lobby = new Client((so) => w.hub.openLobby(so));
    await lobby.send({
      t: 'create',
      game: 'chess',
      tc: '3d',
      color: 'white',
      name: NAME_A,
      rating: null,
    });
    const created = lobby.last('created')!;
    const game = created.game as string;
    const poster = new Client((so) => w.hub.openRoom(game, so));
    await poster.send({ t: 'hello', seat: created.seat });
    await poster.send({ t: 'abort' });
    await poster.send({ t: 'analyse' });
    const id = await analysisRoomId(game);
    expect(poster.last('analysis')).toEqual({ t: 'analysis', room: id, by: 'white' });
    // Nobody comes: the room goes, as an empty room does; the game's room is still there.
    await w.advance(GROUP_LIMITS.emptyKeepMs);
    expect(w.hub.groups()).toBe(0);
    expect(w.hub.games()).toBe(1);
    await poster.send({ t: 'analyse' });
    expect(poster.last('analysis')).toMatchObject({ room: id });
    expect(w.hub.groups()).toBe(1);

    // The waiting room gives every room it makes a fresh id: no other game lands under this one.
    await lobby.send({
      t: 'create-room',
      kind: 'analysis',
      opts: { fen: START, moves: 'f2f3 e7e5 g2g4 d8h4' },
      name: NAME_A,
      rating: null,
    });
    expect(lobby.last('room-created')!.room).not.toBe(id);
    const visitor = new Client((so) => w.hub.openGroup(id, so));
    await visitor.send({ t: 'hello' });
    expect(snapshotOf(visitor)).toMatchObject({ white: NAME_A, black: null, result: '*' });
    expect(mainLine(snapshotOf(visitor))).toEqual([]);
  });

  it('starts from a Chess960 game’s own start position', async () => {
    const w = world({ chess960Position: () => 192 });
    const game = await pairedWith(w, { game: 'chess960', tc: '5+3', color: 'white' });
    await play(game, ['g1f3', 'g8f6', 'f1h1']);
    await game.black.send({ t: 'resign' });
    await game.white.send({ t: 'analyse' });
    const id = game.white.last('analysis')!.room as string;
    const look = new Client((s) => w.hub.openGroup(id, s));
    await look.send({ t: 'hello' });
    expect(snapshotOf(look)).toMatchObject({ variant: 'chess960', fen: KNR, result: '1-0' });
    expect(mainLine(snapshotOf(look))).toEqual(['g1f3', 'g8f6', 'f1h1']);
  });

  it('is not made for a duel', async () => {
    const w = world();
    const duel = await pairedWith(w, { game: 'judge' });
    await duel.white.send({ t: 'resign' });
    await duel.white.send({ t: 'analyse' });
    expect(duel.white.last('error')).toMatchObject({ code: 'bad-request' });
    expect(w.hub.groups()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* On Cloudflare, against stand-ins for the runtime                   */
/* ------------------------------------------------------------------ */

class FakeSocket implements DurableSocket {
  readyState = 1;
  sent: string[] = [];
  private attachment: unknown = null;

  send(message: string) {
    if (this.readyState !== 1) throw new Error('The socket is closed.');
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
  }

  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment(): unknown {
    return structuredClone(this.attachment);
  }

  last(t: string): Message | undefined {
    return this.sent
      .filter((text) => text !== 'pong')
      .map((text) => JSON.parse(text) as Message)
      .filter((m) => m.t === t)
      .at(-1);
  }
}

class FakeState implements DurableState {
  values = new Map<string, unknown>();
  sockets: FakeSocket[] = [];
  storage: DurableStorage = {
    get: (key) => Promise.resolve(structuredClone(this.values.get(key))),
    put: (key, value) => {
      this.values.set(key, structuredClone(value));
      return Promise.resolve();
    },
    deleteAll: () => {
      this.values.clear();
      return Promise.resolve();
    },
    setAlarm: () => Promise.resolve(),
    deleteAlarm: () => Promise.resolve(),
  };

  acceptWebSocket(ws: DurableSocket) {
    this.sockets.push(ws as FakeSocket);
  }

  getWebSockets() {
    return this.sockets.filter((ws) => ws.readyState !== 3);
  }

  setWebSocketAutoResponse() {
    // The runtime's own answer to pings: not needed here.
  }
}

describe('a game’s analysis room on Cloudflare', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 11, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is made by the game’s object in the group’s, once, and found there after', async () => {
    const states = new Map<string, FakeState>();
    const stateOf = (name: string) => {
      let s = states.get(name);
      if (!s) {
        s = new FakeState();
        states.set(name, s);
      }
      return s;
    };
    const env: LiveEnv = {};
    env.LIVE_ROOMS = {
      idFromName: (name) => `room:${name}`,
      get: (id) => ({
        fetch: (input, init) =>
          new LiveRoom(stateOf(id as string), env).fetch(new Request(input, init)),
      }),
    };
    env.LIVE_GROUPS = {
      idFromName: (name) => `group:${name}`,
      get: (id) => ({
        fetch: (input, init) =>
          new LiveGroup(stateOf(id as string), env).fetch(new Request(input, init)),
      }),
    };
    const lobby = new LiveLobby(new FakeState(), env);
    const a = new FakeSocket();
    const b = new FakeSocket();
    lobby.accept(a, '203.0.113.1');
    lobby.accept(b, '203.0.113.2');
    await lobby.webSocketMessage(a, JSON.stringify(seek({ color: 'white' })));
    await lobby.webSocketMessage(b, JSON.stringify(seek({ name: NAME_B, rating: null })));
    const paired = a.last('paired')!;
    const game = paired.game as string;
    const roomState = stateOf(`room:${game}`);
    const white = new FakeSocket();
    await new LiveRoom(roomState, env).accept(white);
    const room = () => new LiveRoom(roomState, env);
    await room().webSocketMessage(white, JSON.stringify({ t: 'hello', seat: paired.seat }));
    await room().webSocketMessage(white, JSON.stringify({ t: 'move', uci: 'e2e4', ply: 0 }));
    await room().webSocketMessage(white, JSON.stringify({ t: 'resign' }));
    await room().webSocketMessage(white, JSON.stringify({ t: 'analyse' }));

    const id = await analysisRoomId(game);
    expect(white.last('analysis')).toEqual({ t: 'analysis', room: id, by: 'white' });
    const stored = stateOf(`group:${id}`).values.get('group') as {
      kind: string;
      members: unknown[];
      state: AnalysisState;
    };
    expect(stored).toMatchObject({ kind: 'analysis', members: [] });
    expect(stored.state.nodes.map((n) => n.uci)).toEqual(['', 'e2e4']);

    // Asked again, the group's object answers that it has the room: the same one.
    await room().webSocketMessage(white, JSON.stringify({ t: 'analyse' }));
    expect(white.last('error')).toBeUndefined();
    expect(white.last('analysis')).toEqual({ t: 'analysis', room: id, by: 'white' });
  });
});

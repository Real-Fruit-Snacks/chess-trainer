// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CLASSIC_GAME_IDS, duelContent } from './src/live/duelRules.mjs';
import type { SnapshotRematches } from './src/live/room.mjs';
import { ABUSE_LIMITS, CLOSE, DUEL_RULES, GROUP_LIMITS } from './src/live/shared.mjs';
import { Client, type Message, NAME_A, NAME_B, pairedWith, type World, world } from './testWorld';

/**
 * What the rooms tell and take so that nothing reaches a player by surprise:
 * every game's snapshot says how many rematches in a row are left; a duel's
 * rounds name only the app's own classic games; and in an analysis room only
 * the host deletes moves.
 */

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CHESS = { tc: '5+3', color: 'white' };
const RACE = { game: 'race', opts: { format: 'best3', level: 1500 } };
const JUDGE = { game: 'judge' };

interface Seated {
  game: string;
  white: Client;
  black: Client;
  seats: { white: string; black: string };
}

/** The rematch of a game that is over, offered and accepted: its sockets, seated. */
async function rematched(w: World, { white, black }: Seated): Promise<Seated> {
  await white.send({ t: 'rematch', op: 'offer' });
  await black.send({ t: 'rematch', op: 'accept' });
  const mine = white.last('rematch') as Message;
  const theirs = black.last('rematch') as Message;
  if (!mine?.seat || !theirs?.seat)
    throw new Error(`No rematch: ${JSON.stringify(white.messages)}`);
  const game = mine.game as string;
  const a = new Client((s) => w.hub.openRoom(game, s));
  const b = new Client((s) => w.hub.openRoom(game, s));
  await a.send({ t: 'hello', seat: mine.seat });
  await b.send({ t: 'hello', seat: theirs.seat });
  const seats = { white: mine.seat as string, black: theirs.seat as string };
  return mine.color === 'white'
    ? { game, white: a, black: b, seats }
    : { game, white: b, black: a, seats: { white: seats.black, black: seats.white } };
}

/** How many rematches in a row the client's last snapshot says are left. */
const left = (client: Client) =>
  (client.last('game') as (Message & SnapshotRematches) | undefined)?.rematchesLeft;

describe('the rematches left', () => {
  it('are in a game’s snapshot, for the players and the watchers, down to none', async () => {
    const w = world();
    let players: Seated = await pairedWith(w, CHESS);
    expect(left(players.white)).toBe(ABUSE_LIMITS.rematches);
    expect(left(players.black)).toBe(ABUSE_LIMITS.rematches);
    for (let i = 1; i <= ABUSE_LIMITS.rematches; i++) {
      await players.white.send({ t: 'abort' });
      players = await rematched(w, players);
      expect(left(players.white)).toBe(ABUSE_LIMITS.rematches - i);
      expect(left(players.black)).toBe(ABUSE_LIMITS.rematches - i);
    }
    const eye = new Client((s) => w.hub.openRoom(players.game, s));
    await eye.send({ t: 'hello', watch: true });
    expect(left(eye)).toBe(0);

    // Over, and asked again: still none. A rematch asked for anyway is refused, as before.
    await players.white.send({ t: 'abort' });
    await players.white.send({ t: 'hello', seat: players.seats.white });
    expect(players.white.last('game')).toMatchObject({ status: 'over', rematchesLeft: 0 });
    await players.white.send({ t: 'rematch', op: 'offer' });
    expect(players.white.last('error')).toMatchObject({ code: 'limit' });
    expect(players.black.last('offers')).toBeUndefined();
  });

  it('are in a duel’s snapshot too', async () => {
    const w = world();
    let players: Seated = await pairedWith(w, RACE);
    expect(players.white.last('game')).toMatchObject({
      game: 'race',
      rematchesLeft: ABUSE_LIMITS.rematches,
    });
    expect(left(players.black)).toBe(ABUSE_LIMITS.rematches);
    for (let i = 1; i <= ABUSE_LIMITS.rematches; i++) {
      await players.white.send({ t: 'abort' });
      players = await rematched(w, players);
      expect(left(players.white)).toBe(ABUSE_LIMITS.rematches - i);
    }
    expect(left(players.black)).toBe(0);
    await players.black.send({ t: 'abort' });
    await players.black.send({ t: 'rematch', op: 'offer' });
    expect(players.black.last('error')).toMatchObject({ code: 'limit' });
  });
});

/** `count` positions to judge from the classic game `game`. */
const judgeItems = (count: number, game: string) =>
  Array.from({ length: count }, (_, i) => ({ fen: START, cp: 150, game, ply: i }));

/** `count` Arbiter rounds from the classic game `game`. */
const arbiterItems = (count: number, game: string) =>
  Array.from({ length: count }, () => ({
    fen: START,
    ply: 0,
    lead: ['e2e4', 'e7e5'],
    illegal: { from: 'g1', to: 'g3', kind: 'knight-shape' },
    game,
  }));

describe('a duel’s rounds', () => {
  it('come only from the app’s own classic games', () => {
    expect(new Set(CLASSIC_GAME_IDS).size).toBe(CLASSIC_GAME_IDS.length);
    for (const id of CLASSIC_GAME_IDS) {
      expect(duelContent('judge', {}, judgeItems(DUEL_RULES.judge.rounds, id))).not.toBeNull();
      expect(
        duelContent('arbiter', { pace: 'normal' }, arbiterItems(DUEL_RULES.arbiter.rounds, id)),
      ).not.toBeNull();
    }
    // A name the host made up is words for the other player to read: never passed on.
    for (const made of [
      'you-play-like-a-beginner',
      'opera-game-2',
      'Opera-Game',
      'a'.repeat(40),
      '',
      7,
      null,
    ]) {
      const judge = judgeItems(DUEL_RULES.judge.rounds, 'opera-game');
      judge[2] = { ...judge[2], game: made as string };
      expect(duelContent('judge', {}, judge)).toBeNull();
      const arbiter = arbiterItems(DUEL_RULES.arbiter.rounds, 'immortal-game');
      arbiter[0] = { ...arbiter[0], game: made as string };
      expect(duelContent('arbiter', { pace: 'normal' }, arbiter)).toBeNull();
    }
  });

  it('naming another game are refused by the room, and never reach the other player', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, JUDGE);
    const made = judgeItems(DUEL_RULES.judge.rounds, 'evergreen-game');
    made[4] = { ...made[4], game: 'well-played-said-nobody' };
    await white.send({ t: 'content', items: made });
    expect(white.last('error')).toEqual({
      t: 'error',
      code: 'bad-request',
      message: 'Those rounds cannot be played.',
    });
    expect(black.last('content')).toBeUndefined();
    await white.send({
      t: 'content',
      items: judgeItems(DUEL_RULES.judge.rounds, 'evergreen-game'),
    });
    const items = black.last('content')?.items as { game: string }[];
    expect(items.map((item) => item.game)).toEqual(
      Array.from({ length: DUEL_RULES.judge.rounds }, () => 'evergreen-game'),
    );
  });
});

interface Snapshot {
  nodes: [number, number, string][];
  at: number;
}

const snapshotOf = (client: Client) => client.last('room')?.state as Snapshot;

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

/** An analysis room made through the waiting room, its maker (the host) in it, and a guest. */
async function analysisRoom(w: World, moves = 'e2e4 e7e5 ( c7c5 g1f3 ) g1f3') {
  const lobby = new Client((s) => w.hub.openLobby(s));
  const opts = { fen: START, moves };
  await lobby.send({ t: 'create-room', kind: 'analysis', opts, name: NAME_A, rating: 1500 });
  const made = lobby.last('room-created');
  if (!made) throw new Error(`No room: ${JSON.stringify(lobby.messages)}`);
  const id = made.room as string;
  const host = new Client((s) => w.hub.openGroup(id, s));
  await host.send({ t: 'hello', token: made.token });
  const guest = new Client((s) => w.hub.openGroup(id, s));
  await guest.send({ t: 'hello' });
  await guest.send({ t: 'join', name: NAME_B, rating: null });
  const joined = guest.last('joined');
  if (!joined) throw new Error(`Not joined: ${JSON.stringify(guest.messages)}`);
  const c5 = nodeAt(snapshotOf(host), ['e2e4', 'c7c5']);
  return {
    id,
    host,
    hostToken: made.token as string,
    hostId: host.last('room')!.you as string,
    guest,
    guestId: joined.member as string,
    c5,
  };
}

const NOT_HOST = { t: 'error', code: 'not-host', message: 'Only the host can delete moves.' };

describe('an analysis room’s deletions', () => {
  it('are the host’s alone; moves, steps, the main line and drawings are everyone’s', async () => {
    const w = world();
    const room = await analysisRoom(w);
    const { guest, host, c5 } = room;
    const stored = w.writes(room.id).store;
    guest.clear();
    await guest.send({ t: 'delete', node: c5 });
    expect(guest.last('error')).toEqual(NOT_HOST);
    // The room as it stands follows, with the move still in it; nobody else heard a thing.
    expect(nodeAt(snapshotOf(guest), ['e2e4', 'c7c5'])).toBe(c5);
    expect(host.all('deleted')).toEqual([]);
    expect(w.writes(room.id).store).toBe(stored);

    // Everything else stays open to every member.
    await guest.send({ t: 'move', node: c5, uci: 'b1c3' });
    expect(host.last('added')).toMatchObject({ node: [expect.any(Number), c5, 'b1c3'], at: true });
    await guest.send({ t: 'promote', node: c5 });
    expect(host.last('promoted')).toEqual({ t: 'promoted', node: c5, by: room.guestId });
    await guest.send({ t: 'at', node: 0 });
    expect(host.last('at')).toEqual({ t: 'at', node: 0, by: room.guestId });
    const shapes = [{ orig: 'e2', dest: 'e4', brush: 'green' }];
    await guest.send({ t: 'shapes', node: 0, shapes });
    expect(host.last('shapes')).toEqual({ t: 'shapes', node: 0, shapes, by: room.guestId });

    // The host deletes: everyone hears it.
    await host.send({ t: 'delete', node: c5 });
    expect(guest.last('deleted')).toEqual({ t: 'deleted', node: c5, at: 0, by: room.hostId });
    await guest.send({ t: 'hello' });
    expect(nodeAt(snapshotOf(guest), ['e2e4', 'c7c5'])).toBe(-1);
  });

  it('count a member’s refused deletions against them, as any refusal', async () => {
    const w = world();
    const { guest, c5 } = await analysisRoom(w);
    for (let i = 0; i < ABUSE_LIMITS.refusals; i++) await guest.send({ t: 'delete', node: c5 });
    expect(guest.all('error').filter((e) => e.code === 'not-host')).toHaveLength(
      ABUSE_LIMITS.refusals,
    );
    expect(guest.closed).toBeNull();
    await guest.send({ t: 'delete', node: c5 });
    expect(guest.last('error')).toMatchObject({ code: 'rate' });
    expect(guest.closed?.code).toBe(CLOSE.policy);
  });

  it('go with the room to its next host', async () => {
    const w = world();
    const room = await analysisRoom(w, 'e2e4 e7e5 ( c7c5 g1f3 ) g1f3 ( d2d4 ) b8c6');
    const { host, guest } = room;
    const d4 = nodeAt(snapshotOf(host), ['e2e4', 'e7e5', 'd2d4']);
    const nc6 = nodeAt(snapshotOf(host), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);

    // The host gone a while: the guest, here longest, hosts now, and may delete.
    await host.leave();
    await w.advance(GROUP_LIMITS.hostGoneMs);
    expect(guest.last('members')).toMatchObject({ host: room.guestId });
    await guest.send({ t: 'delete', node: room.c5 });
    expect(guest.last('deleted')).toMatchObject({ node: room.c5, by: room.guestId });

    // The old host comes back a member like the others: their deletion is refused.
    const back = new Client((s) => w.hub.openGroup(room.id, s));
    await back.send({ t: 'hello', token: room.hostToken });
    expect(back.last('room')).toMatchObject({ you: room.hostId, host: room.guestId });
    await back.send({ t: 'delete', node: d4 });
    expect(back.last('error')).toEqual(NOT_HOST);

    // A host who leaves for good hands over at once: the one left may delete.
    await guest.send({ t: 'leave' });
    expect(back.last('members')).toMatchObject({ host: room.hostId });
    await back.send({ t: 'delete', node: nc6 });
    expect(back.last('deleted')).toMatchObject({ node: nc6, by: room.hostId });
    // Someone no longer a member deletes nothing.
    await guest.send({ t: 'delete', node: d4 });
    expect(guest.last('error')).toMatchObject({ code: 'not-member' });
  });
});

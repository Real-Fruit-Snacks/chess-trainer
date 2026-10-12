// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CLOSE, DAY_MS, LIMITS } from './src/live/shared.mjs';
import type { PushMessage, Subscription } from './src/push/webpush.mjs';
import {
  Client,
  type Message,
  NAME_A,
  NAME_B,
  pairedWith,
  play,
  seek,
  world,
  type World,
} from './testWorld';

const THREE_DAYS = 3 * DAY_MS;

/** A browser's push subscription, as `PushSubscription.toJSON()` gives it. */
function subscription(name: string) {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
    expirationTime: null,
    keys: {
      p256dh:
        'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    },
  };
}

/** A world whose rooms push into a list: who was pushed what. */
function pushWorld(answer: (endpoint: string) => 'sent' | 'gone' | 'failed' = () => 'sent') {
  const pushed: { to: string; message: PushMessage }[] = [];
  const w = world({
    notify: (sub: Subscription, message: PushMessage) => {
      const to = sub.endpoint.slice(sub.endpoint.lastIndexOf('/') + 1);
      pushed.push({ to, message });
      return Promise.resolve(answer(to));
    },
  });
  return { w, pushed };
}

/** An invitation to a correspondence game, made in the waiting room by its poster. */
function invitation(over: Partial<Message> = {}): Message {
  return {
    t: 'create',
    game: 'chess',
    tc: '3d',
    color: 'white',
    name: NAME_A,
    rating: 1500,
    ...over,
  };
}

/** A socket that watches `game` (and may take its open seat). */
async function visitor(w: World, game: string) {
  const client = new Client((s) => w.hub.openRoom(game, s));
  await client.send({ t: 'hello', watch: true });
  return client;
}

/** The poster's invitation made and the poster seated; the room's id and the poster's socket. */
async function invited(w: World, over: Partial<Message> = {}) {
  const lobby = new Client((s) => w.hub.openLobby(s));
  await lobby.send(invitation(over));
  const created = lobby.last('created');
  if (!created) throw new Error(`Not created: ${JSON.stringify(lobby.messages)}`);
  const game = created.game as string;
  const poster = new Client((s) => w.hub.openRoom(game, s));
  await poster.send({ t: 'hello', seat: created.seat });
  return { game, poster, created, lobby };
}

/** The invitation taken by a friend with the link: both seated, White the poster. */
async function started(w: World) {
  const { game, poster } = await invited(w);
  const friend = await visitor(w, game);
  await friend.send({ t: 'join', name: NAME_B, rating: null });
  const seat = friend.last('seat')?.seat as string;
  const black = new Client((s) => w.hub.openRoom(game, s));
  await black.send({ t: 'hello', seat });
  await friend.leave();
  return { game, white: poster, black, seats: { black: seat } };
}

describe('a correspondence game', () => {
  it('is made at once by invitation, with the poster’s seat and one open', async () => {
    const w = world();
    const { game, poster, created } = await invited(w);
    expect(created).toMatchObject({ kind: 'chess', tc: '3d', color: 'white', opts: {} });
    expect(created.seat).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(poster.last('game')).toMatchObject({
      id: game,
      you: 'white',
      tc: '3d',
      open: 'black',
      white: { name: NAME_A, rating: 1500 },
      black: { name: '', rating: null },
      clock: { white: THREE_DAYS, black: THREE_DAYS, running: null },
      firstMove: null,
      status: 'playing',
    });
    // Nothing to play until someone takes the other seat.
    await poster.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(poster.last('error')).toMatchObject({ code: 'not-now' });
    // The waiting room lists nothing: an invitation is for the link only.
    const other = new Client((s) => w.hub.openLobby(s));
    expect(other.last('lobby')).toMatchObject({ seeks: [] });
  });

  it('gives the open seat to the first who asks, its token to them alone', async () => {
    const w = world();
    const { game, poster } = await invited(w, { color: 'black' });
    const first = await visitor(w, game);
    const second = await visitor(w, game);
    expect(first.last('game')).toMatchObject({ open: 'white', you: null });
    await Promise.all([
      first.send({ t: 'join', name: NAME_B, rating: 1200 }),
      second.send({ t: 'join', name: 'Quiet Rook', rating: null }),
    ]);
    const seat = first.last('seat');
    expect(seat).toMatchObject({ t: 'seat', game, color: 'white' });
    expect(second.last('seat')).toBeUndefined();
    expect(second.last('error')).toMatchObject({ code: 'taken' });
    expect(JSON.stringify(second.messages)).not.toContain(String(seat?.seat));
    expect(JSON.stringify(poster.messages)).not.toContain(String(seat?.seat));
    // Everyone sees both players now, and White's days running.
    expect(poster.last('game')).toMatchObject({
      you: 'black',
      open: null,
      white: { name: NAME_B, rating: 1200 },
      clock: { running: 'white', white: THREE_DAYS },
    });
    expect(second.last('game')).toMatchObject({ open: null, white: { name: NAME_B } });

    // The token seats its holder as White.
    const white = new Client((s) => w.hub.openRoom(game, s));
    await white.send({ t: 'hello', seat: seat?.seat });
    expect(white.last('game')).toMatchObject({ you: 'white', black: { name: NAME_A } });
    await white.send({ t: 'move', uci: 'd2d4', ply: 0 });
    expect(poster.last('move')).toMatchObject({ uci: 'd2d4' });
  });

  it('refuses a join that names nobody, and a join where no seat is open', async () => {
    const w = world();
    const { game } = await invited(w);
    const odd = await visitor(w, game);
    await odd.send({ t: 'join', name: 'Typed Anything', rating: null });
    expect(odd.last('error')).toMatchObject({ code: 'bad-request' });
    expect(odd.last('seat')).toBeUndefined();

    const live = await (async () => {
      const a = new Client((s) => w.hub.openLobby(s));
      const b = new Client((s) => w.hub.openLobby(s));
      await a.send(seek());
      await b.send(seek({ name: NAME_B }));
      return a.last('paired')?.game as string;
    })();
    const nosy = await visitor(w, live);
    await nosy.send({ t: 'join', name: NAME_B, rating: null });
    expect(nosy.last('error')).toMatchObject({ code: 'taken' });
  });

  it('gives every move its days, and the side whose days pass loses on time', async () => {
    const w = world();
    const game = await started(w);
    await w.advance(DAY_MS);
    await play(game, ['e2e4']);
    // White's days are whole again for its next move; Black's run.
    expect(game.black.last('move')).toMatchObject({
      clock: { white: THREE_DAYS, black: THREE_DAYS, running: 'black' },
      firstMove: null,
    });
    await w.advance(2 * DAY_MS);
    await play(game, ['e7e5'], 1);
    await play(game, ['g1f3'], 2);
    game.black.clear();
    await w.advance(THREE_DAYS - 1);
    expect(game.black.last('end')).toBeUndefined();
    await game.black.send({ t: 'hello' });
    expect(game.black.last('game')).toMatchObject({ clock: { black: 1, running: 'black' } });
    await w.advance(1);
    expect(game.white.last('end')).toMatchObject({ result: '1-0', reason: 'time' });
  });

  it('aborts a game nobody starts in time, and an invitation nobody takes', async () => {
    const w = world();
    const game = await started(w);
    await w.advance(THREE_DAYS);
    expect(game.black.last('end')).toMatchObject({ result: '*', reason: 'no-start' });

    const { poster } = await invited(w);
    await w.advance(LIMITS.inviteMs - 1);
    expect(poster.last('end')).toBeUndefined();
    await w.advance(1);
    expect(poster.last('end')).toMatchObject({ result: '*', reason: 'expired' });
  });

  it('lets the poster call the invitation off', async () => {
    const w = world();
    const { game, poster } = await invited(w);
    await poster.send({ t: 'abort' });
    expect(poster.last('end')).toMatchObject({ result: '*', reason: 'aborted' });
    const late = await visitor(w, game);
    await late.send({ t: 'join', name: NAME_B, rating: null });
    expect(late.last('error')).toMatchObject({ code: 'taken' });
  });

  it('claims nothing against a player who is away: they come and go', async () => {
    const w = world();
    const game = await started(w);
    await play(game, ['e2e4', 'e7e5']);
    await game.black.leave();
    expect(game.white.last('present')).toMatchObject({ black: false, gone: null });
    await w.advance(LIMITS.goneClaimMs * 10);
    await game.white.send({ t: 'claim', op: 'win' });
    expect(game.white.last('error')).toMatchObject({ code: 'not-now' });
    expect(game.white.last('end')).toBeUndefined();
    // Back days later, on another device: the game is as it was.
    await w.advance(DAY_MS);
    const back = new Client((s) => w.hub.openRoom(game.game, s));
    await back.send({ t: 'hello', seat: game.seats.black });
    expect(back.last('game')).toMatchObject({ you: 'black', moves: ['e2e4', 'e7e5'], gone: null });
  });

  it('keeps the room a week after the end, then deletes it', async () => {
    const w = world();
    const game = await started(w);
    await play(game, ['e2e4', 'e7e5']);
    await game.white.send({ t: 'resign' });
    expect(game.black.last('end')).toMatchObject({ result: '0-1', reason: 'resign' });
    await w.advance(LIMITS.correspondenceKeepMs - 1);
    expect(game.black.closed).toBeNull();
    await w.advance(1);
    expect(game.black.closed?.code).toBe(CLOSE.closed);
  });

  it('takes a move back with the days whole again, and plays a rematch at once', async () => {
    const w = world();
    const game = await started(w);
    await play(game, ['e2e4', 'e7e5', 'g1f3']);
    await w.advance(DAY_MS);
    await game.white.send({ t: 'takeback', op: 'offer' });
    await game.black.send({ t: 'takeback', op: 'accept' });
    expect(game.white.last('undo')).toMatchObject({
      plies: 1,
      clock: { white: THREE_DAYS, black: THREE_DAYS, running: 'white' },
    });
    await game.black.send({ t: 'resign' });
    await game.black.send({ t: 'rematch', op: 'offer' });
    await game.white.send({ t: 'rematch', op: 'accept' });
    const next = game.white.last('rematch');
    const again = new Client((s) => w.hub.openRoom(next?.game as string, s));
    await again.send({ t: 'hello', seat: next?.seat });
    expect(again.last('game')).toMatchObject({
      you: 'black',
      tc: '3d',
      open: null,
      clock: { running: 'white', white: THREE_DAYS },
    });
  });

  it('is made by invitation only, a few an hour', async () => {
    const w = world();
    const lobby = new Client((s) => w.hub.openLobby(s));
    await lobby.send(seek({ tc: '3d' }));
    expect(lobby.last('error')).toMatchObject({ code: 'bad-request' });
    expect(lobby.last('posted')).toBeUndefined();
    for (const bad of [
      invitation({ tc: '5+3' }),
      invitation({ game: 'army', opts: { budget: 30 } }),
      invitation({ color: 'green' }),
      invitation({ name: 'Rude Words' }),
    ]) {
      lobby.clear();
      await lobby.send(bad);
      expect(lobby.last('error')).toMatchObject({ code: 'bad-request' });
    }
    lobby.clear();
    for (let i = 0; i < LIMITS.invites; i++) await lobby.send(invitation());
    expect(lobby.all('created')).toHaveLength(LIMITS.invites);
    await lobby.send(invitation());
    expect(lobby.last('error')).toMatchObject({ code: 'busy' });
    await w.advance(LIMITS.invitesWindowMs);
    await lobby.send(invitation());
    expect(lobby.all('created')).toHaveLength(LIMITS.invites + 1);
  });
});

describe('pushes to a correspondence player away', () => {
  /** The invitation made with the poster's subscription, the poster away, and a friend in Black's seat. */
  async function pushedGame(w: World) {
    const lobby = new Client((s) => w.hub.openLobby(s));
    await lobby.send(invitation());
    const created = lobby.last('created');
    const game = created?.game as string;
    const white = new Client((s) => w.hub.openRoom(game, s));
    await white.send({ t: 'hello', seat: created?.seat, push: subscription('poster') });
    await white.leave();
    const friend = await visitor(w, game);
    await friend.send({ t: 'join', name: NAME_B, rating: null });
    const seat = friend.last('seat')?.seat as string;
    await friend.leave();
    const black = new Client((s) => w.hub.openRoom(game, s));
    await black.send({ t: 'hello', seat, push: subscription('friend') });
    return { game, seats: { white: created?.seat as string, black: seat }, black };
  }

  it('pushes the poster the invitation taken, and each player their turn while away', async () => {
    const { w, pushed } = pushWorld();
    const { game, seats, black } = await pushedGame(w);
    expect(pushed).toEqual([
      {
        to: 'poster',
        message: {
          title: `${NAME_B} took your invitation`,
          body: 'The game is on: your move.',
          url: `play/online/${game}`,
          tag: game,
        },
      },
    ]);
    pushed.length = 0;

    // White comes back and moves while Black is there: nobody is pushed.
    const white = new Client((s) => w.hub.openRoom(game, s));
    await white.send({ t: 'hello', seat: seats.white });
    await play({ white, black }, ['e2e4']);
    expect(pushed).toEqual([]);
    // Black goes; White's next move reaches Black's device.
    await play({ white, black }, ['e7e5'], 1);
    await black.leave();
    await play({ white, black }, ['g1f3'], 2);
    expect(pushed).toEqual([
      {
        to: 'friend',
        message: {
          title: `Your move against ${NAME_A}`,
          body: `${NAME_A} played Nf3.`,
          url: `play/online/${game}`,
          tag: game,
        },
      },
    ]);
    // Nobody but the room ever sees a subscription.
    expect(JSON.stringify(white.messages)).not.toContain('fcm.googleapis.com');
  });

  it('pushes the end to whoever is away, then forgets the subscriptions', async () => {
    const { w, pushed } = pushWorld();
    const { game, black } = await pushedGame(w);
    pushed.length = 0;
    await black.send({ t: 'resign' });
    // Fewer than two moves: the game is aborted, and White hears it.
    expect(pushed).toEqual([
      {
        to: 'poster',
        message: {
          title: `Game over against ${NAME_B}`,
          body: 'The game was aborted.',
          url: `play/online/${game}`,
          tag: game,
        },
      },
    ]);
    await black.send({ t: 'push', sub: subscription('friend') });
    expect(black.last('error')).toMatchObject({ code: 'not-now' });

    // An invitation nobody takes: its poster hears that too.
    const lobby = new Client((s) => w.hub.openLobby(s));
    await lobby.send(invitation({ color: 'black' }));
    const created = lobby.last('created');
    const poster = new Client((s) => w.hub.openRoom(created?.game as string, s));
    await poster.send({ t: 'hello', seat: created?.seat, push: subscription('lonely') });
    await poster.leave();
    pushed.length = 0;
    await w.advance(LIMITS.inviteMs);
    expect(pushed).toEqual([
      {
        to: 'lonely',
        message: expect.objectContaining({
          title: 'Your invitation',
          body: 'Nobody took it in time.',
        }) as PushMessage,
      },
    ]);
  });

  it('pushes the result of a game won and lost, each from its own side', async () => {
    const { w, pushed } = pushWorld();
    const { game, seats, black } = await pushedGame(w);
    const white = new Client((s) => w.hub.openRoom(game, s));
    await white.send({ t: 'hello', seat: seats.white });
    await play({ white, black }, ['f2f3', 'e7e5', 'g2g4']);
    await white.leave();
    pushed.length = 0;
    await play({ white, black }, ['d8h4'], 3);
    expect(pushed).toEqual([
      {
        to: 'poster',
        message: expect.objectContaining({
          title: `Game over against ${NAME_B}`,
          body: 'You lost by checkmate.',
        }) as PushMessage,
      },
    ]);
  });

  it('forgets a subscription its push service calls gone, and one the player takes back', async () => {
    const { w, pushed } = pushWorld((to) => (to === 'friend' ? 'gone' : 'sent'));
    const { game, seats, black } = await pushedGame(w);
    const white = new Client((s) => w.hub.openRoom(game, s));
    await white.send({ t: 'hello', seat: seats.white });
    await black.leave();
    pushed.length = 0;
    await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(pushed.map((p) => p.to)).toEqual(['friend']);
    // Gone: the next move pushes nothing.
    const back = new Client((s) => w.hub.openRoom(game, s));
    await back.send({ t: 'hello', seat: seats.black });
    await back.send({ t: 'move', uci: 'e7e5', ply: 1 });
    await back.leave();
    await white.send({ t: 'move', uci: 'g1f3', ply: 2 });
    expect(pushed.map((p) => p.to)).toEqual(['friend']);

    // White takes theirs back (notifications off on that device), then leaves.
    await white.send({ t: 'push', sub: { endpoint: 'https://evil.test/x', keys: {} } });
    expect(white.last('error')).toMatchObject({ code: 'bad-request' });
    await white.send({ t: 'push', sub: null });
    await white.leave();
    const blackAgain = new Client((s) => w.hub.openRoom(game, s));
    await blackAgain.send({ t: 'hello', seat: seats.black, push: subscription('friend-new') });
    await blackAgain.send({ t: 'move', uci: 'b8c6', ply: 3 });
    expect(pushed.map((p) => p.to)).toEqual(['friend']);
  });

  it('pushes nothing for a game played at once', async () => {
    const { w, pushed } = pushWorld();
    const game = await pairedWith(w, { tc: '5+3', color: 'white' }, { seat: false });
    await game.white.send({ t: 'hello', seat: game.seats.white, push: subscription('w') });
    await game.black.send({ t: 'hello', seat: game.seats.black, push: subscription('b') });
    await play(game, ['e2e4', 'e7e5']);
    await game.black.leave();
    await play(game, ['g1f3'], 2);
    await game.white.send({ t: 'push', sub: subscription('w') });
    expect(game.white.last('error')).toMatchObject({ code: 'not-now' });
    expect(pushed).toEqual([]);
  });
});

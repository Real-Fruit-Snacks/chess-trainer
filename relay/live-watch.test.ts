// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CLOSE, LIMITS } from './src/live/shared.mjs';
import { Client, NAME_A, NAME_B, paired, pairedWith, play, world } from './testWorld';

/** A socket that watches `game`. */
async function watcher(w: ReturnType<typeof world>, game: string) {
  const client = new Client((s) => w.hub.openRoom(game, s));
  await client.send({ t: 'hello', watch: true });
  return client;
}

/** Everything a socket was sent, as text: to look for what must never be there. */
const everything = (client: Client) => JSON.stringify(client.messages);

describe('watching a game', () => {
  it('shows anyone the game, but nothing private to the players', async () => {
    const w = world();
    const game = await paired(w);
    await play(game, ['e2e4', 'e7e5']);
    await game.white.send({ t: 'say', phrase: 'luck' });

    const eye = await watcher(w, game.game);
    expect(eye.closed).toBeNull();
    expect(eye.last('game')).toMatchObject({
      id: game.game,
      you: null,
      tc: '5+3',
      white: { name: NAME_A, rating: 1500 },
      black: { name: NAME_B, rating: null },
      moves: ['e2e4', 'e7e5'],
      clock: { running: 'white' },
      status: 'playing',
      present: { white: true, black: true },
      gone: null,
      chat: [],
      next: null,
      watchers: 1,
    });
    // The players hear that someone watches; a player's own snapshot says so too.
    expect(game.white.last('watchers')).toEqual({ t: 'watchers', n: 1 });
    expect(game.black.last('watchers')).toEqual({ t: 'watchers', n: 1 });
    game.white.clear();
    await game.white.send({ t: 'hello' });
    expect(game.white.last('game')).toMatchObject({ watchers: 1, you: 'white' });

    // Moves, offers and the end reach the watcher; phrases do not.
    await play(game, ['g1f3'], 2);
    expect(eye.last('move')).toMatchObject({ uci: 'g1f3', ply: 2, clock: { running: 'black' } });
    await w.advance(LIMITS.phraseMs);
    await game.black.send({ t: 'say', phrase: 'fun' });
    expect(eye.all('say')).toEqual([]);
    await game.black.send({ t: 'draw', op: 'offer' });
    expect(eye.last('offers')).toMatchObject({ draw: 'black' });
    await game.white.send({ t: 'resign' });
    expect(eye.last('end')).toMatchObject({ result: '0-1', reason: 'resign' });

    // A rematch: the players get their seats, the watcher only the game to watch.
    await game.white.send({ t: 'rematch', op: 'offer' });
    expect(eye.last('offers')).toMatchObject({ rematch: 'white' });
    await game.black.send({ t: 'rematch', op: 'accept' });
    const next = game.white.last('rematch');
    expect(next).toMatchObject({ color: 'black' });
    expect(typeof next?.seat).toBe('string');
    expect(eye.last('rematch')).toEqual({ t: 'rematch', game: next?.game });
    expect(everything(eye)).not.toContain(game.seats.white);
    expect(everything(eye)).not.toContain(game.seats.black);
    expect(everything(eye)).not.toContain(String(next?.seat));
    expect(everything(eye)).not.toContain('luck');
  });

  it('lets a watcher only watch, and never asks it for a seat', async () => {
    const w = world();
    const game = await paired(w);
    const eye = await watcher(w, game.game);
    await eye.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(eye.last('error')).toMatchObject({ code: 'watching' });
    await eye.send({ t: 'say', phrase: 'hello' });
    await eye.send({ t: 'resign' });
    expect(game.black.all('say')).toEqual([]);
    expect(game.black.last('end')).toBeUndefined();
    // Saying hello again brings the game again.
    eye.clear();
    await eye.send({ t: 'hello' });
    expect(eye.last('game')).toMatchObject({ you: null, moves: [] });
    // Watching is no hello owed: the socket stays past the time a seat must be named in.
    await w.advance(LIMITS.helloMs * 2);
    expect(eye.closed).toBeNull();
    await eye.send('ping');
    expect(eye.messages.at(-1)).toBe('pong');
  });

  it('tells the watchers who is there, and the players how many watch', async () => {
    const w = world();
    const game = await paired(w);
    await play(game, ['d2d4', 'd7d5']);
    const one = await watcher(w, game.game);
    const two = await watcher(w, game.game);
    expect(game.white.last('watchers')).toEqual({ t: 'watchers', n: 2 });
    expect(one.last('watchers')).toEqual({ t: 'watchers', n: 2 });

    await game.black.leave();
    expect(one.last('present')).toEqual({ t: 'present', white: true, black: false, gone: null });
    const back = new Client((s) => w.hub.openRoom(game.game, s));
    await back.send({ t: 'hello', seat: game.seats.black });
    expect(two.last('present')).toEqual({ t: 'present', white: true, black: true, gone: null });

    await one.leave();
    expect(game.white.last('watchers')).toEqual({ t: 'watchers', n: 1 });
    expect(two.last('watchers')).toEqual({ t: 'watchers', n: 1 });
    // A watcher is never a player: nobody is "gone" when one leaves.
    expect(game.white.last('present')).toMatchObject({ black: true, gone: null });
  });

  it('keeps each army from the watchers until both are in', async () => {
    const w = world();
    const game = await pairedWith(w, {
      game: 'army',
      opts: { budget: 30 },
      tc: '5+3',
      color: 'white',
    });
    const eye = await watcher(w, game.game);
    expect(eye.last('game')).toMatchObject({
      status: 'draft',
      draft: { budget: 30, armies: { white: null, black: null } },
    });
    const army = { q: 1, r: 1, b: 1, n: 1, p: 4 };
    await game.white.send({ t: 'army', army });
    expect(eye.last('draft')).toEqual({ t: 'draft', ready: { white: true, black: false } });
    expect(everything(eye)).not.toContain('"q":1');
    await game.black.send({ t: 'army', army: { q: 0, r: 2, b: 2, n: 1, p: 6 } });
    expect(eye.last('game')).toMatchObject({
      status: 'playing',
      draft: { armies: { white: army, black: { q: 0, r: 2, b: 2, n: 1, p: 6 } } },
    });
    expect(typeof eye.last('game')?.startFen).toBe('string');
  });

  it(`takes at most ${LIMITS.watchers} watchers a game, and none in a duel`, async () => {
    const w = world();
    const game = await paired(w);
    const crowd = [];
    for (let i = 0; i < LIMITS.watchers; i++) crowd.push(await watcher(w, game.game));
    expect(crowd.every((c) => c.closed === null)).toBe(true);
    expect(game.black.last('watchers')).toEqual({ t: 'watchers', n: LIMITS.watchers });
    const late = await watcher(w, game.game);
    expect(late.last('error')).toMatchObject({ code: 'full' });
    expect(late.closed?.code).toBe(CLOSE.full);
    // One goes: there is room again.
    await crowd[0]?.leave();
    expect((await watcher(w, game.game)).closed).toBeNull();

    const duel = await pairedWith(w, { game: 'judge' });
    const nosy = await watcher(w, duel.game);
    expect(nosy.closed?.code).toBe(CLOSE.noGame);
    expect(nosy.last('game')).toBeUndefined();
  });

  it('closes the watchers with the room once the game is long over', async () => {
    const w = world();
    const game = await paired(w);
    const eye = await watcher(w, game.game);
    await game.white.send({ t: 'abort' });
    expect(eye.last('end')).toMatchObject({ result: '*', reason: 'aborted' });
    await w.advance(LIMITS.keepAfterEndMs);
    expect(eye.closed?.code).toBe(CLOSE.closed);
  });
});

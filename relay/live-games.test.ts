// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { armyProblem, draftFen, type Army } from './src/live/army.mjs';
import {
  arbiterRound,
  duelContent,
  duelReport,
  duelResult,
  judgeGuess,
  judgeRound,
  raceRound,
  timedResult,
} from './src/live/duelRules.mjs';
import { hashToken } from './src/handler.mjs';
import { createRoom, type RoomState } from './src/live/room.mjs';
import {
  BLINDFOLD_PEEKS,
  CLOSE,
  DUEL_RULES,
  gameOptions,
  LIMITS,
  randomId,
  sameOptions,
} from './src/live/shared.mjs';
import { Client, type Message, NAME_A, NAME_B, pairedWith, play, seek, world } from './testWorld';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** `count` race puzzles, all different. */
const puzzles = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `pz${String(i).padStart(3, '0')}`,
    fen: START,
    moves: 'e2e4 e7e5 g1f3 b8c6',
    rating: 1500,
  }));

/** `count` rounds of Arbiter: two real moves, then a knight that moves like no knight. */
const arbiterItems = (count: number) =>
  Array.from({ length: count }, () => ({
    fen: START,
    ply: 0,
    lead: ['e2e4', 'e7e5'],
    illegal: { from: 'g1', to: 'g3', kind: 'knight-shape' },
    game: 'opera-game',
  }));

/** `count` positions to judge, White better by a pawn and a half. */
const judgeItems = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ fen: START, cp: 150, game: 'opera-game', ply: i }));

const RACE = { game: 'race', opts: { format: 'best3', level: 1500 } };
const WINDOW = { game: 'race', opts: { format: 'window', level: 1500 } };
const TIMED = { game: 'race', opts: { format: 'timed', level: 1200 } };
const ARBITER = { game: 'arbiter', opts: { pace: 'normal' } };
const JUDGE = { game: 'judge' };
const ARMY = { game: 'army', opts: { budget: 30 }, tc: '5+3', color: 'white' };
const BLINDFOLD = { game: 'blindfold', tc: '5+3', color: 'white' };

const army = (over: Partial<Army>): Army => ({ q: 0, r: 0, b: 0, n: 0, p: 0, ...over });

/* ------------------------------------------------------------------ */
/* The rules                                                          */
/* ------------------------------------------------------------------ */

describe('the games’ options', () => {
  it('keeps only valid options, and nothing else', () => {
    expect(gameOptions('chess', { budget: 30 })).toEqual({});
    expect(gameOptions('army', { budget: 30, extra: 1 })).toEqual({ budget: 30 });
    expect(gameOptions('army', { budget: 31 })).toBeNull();
    expect(gameOptions('race', { format: 'window', level: 1800 })).toEqual({
      format: 'window',
      level: 1800,
    });
    expect(gameOptions('race', { format: 'window', level: 1750 })).toBeNull();
    expect(gameOptions('arbiter', { pace: 'slow' })).toEqual({ pace: 'slow' });
    expect(gameOptions('arbiter', {})).toBeNull();
    expect(gameOptions('poker', {})).toBeNull();
    expect(sameOptions({ budget: 30 }, { budget: 30 })).toBe(true);
    expect(sameOptions({ format: 'best3', level: 900 }, { format: 'best3' })).toBe(false);
  });
});

describe('the duels’ rules', () => {
  it('checks every round the host sends', () => {
    expect(duelContent('race', RACE.opts, puzzles(5))).toHaveLength(5);
    expect(duelContent('race', RACE.opts, puzzles(4))).toBeNull();
    expect(duelContent('race', TIMED.opts, puzzles(5))).toBeNull();
    expect(duelContent('race', TIMED.opts, puzzles(DUEL_RULES.race.timedMin))).not.toBeNull();
    const twice = puzzles(5).map((p) => ({ ...p, id: 'same1' }));
    expect(duelContent('race', RACE.opts, twice)).toBeNull();
    const illegal = puzzles(5).map((p, i) => (i === 2 ? { ...p, moves: 'e2e5 e7e5' } : p));
    expect(duelContent('race', RACE.opts, illegal)).toBeNull();
    const words = puzzles(5).map((p, i) => (i === 0 ? { ...p, id: 'hello there' } : p));
    expect(duelContent('race', RACE.opts, words)).toBeNull();
    // Anything else an item brings is dropped.
    const extra = puzzles(5).map((p) => ({ ...p, note: 'hi' }));
    expect(duelContent('race', RACE.opts, extra)![0]).not.toHaveProperty('note');

    expect(duelContent('arbiter', ARBITER.opts, arbiterItems(9))).toHaveLength(9);
    const odd = arbiterItems(9).map((item, i) =>
      i === 4 ? { ...item, illegal: { ...item.illegal, kind: 'made-up' } } : item,
    );
    expect(duelContent('arbiter', ARBITER.opts, odd)).toBeNull();
    const broken = arbiterItems(9).map((item, i) => (i === 0 ? { ...item, lead: ['e2e5'] } : item));
    expect(duelContent('arbiter', ARBITER.opts, broken)).toBeNull();

    expect(duelContent('judge', {}, judgeItems(5))).toHaveLength(5);
    const wild = judgeItems(5).map((item, i) => (i === 1 ? { ...item, cp: 9000 } : item));
    expect(duelContent('judge', {}, wild)).toBeNull();
    const notFen = judgeItems(5).map((item, i) =>
      i === 1 ? { ...item, fen: 'x'.repeat(30) } : item,
    );
    expect(duelContent('judge', {}, notFen)).toBeNull();
    expect(duelContent('chess', {}, [])).toBeNull();
  });

  it('checks what a player reports', () => {
    expect(duelReport('race', { ok: true, ms: 1234.4 })).toEqual({ ok: true, ms: 1234 });
    expect(duelReport('race', { ok: 'yes', ms: 1 })).toBeNull();
    expect(duelReport('race', { ok: true, ms: -1 })).toBeNull();
    expect(duelReport('arbiter', { call: 'caught', ms: 10 })).toEqual({ call: 'caught', ms: 10 });
    expect(duelReport('arbiter', { call: 'maybe', ms: 10 })).toBeNull();
    // A judgement is in pawns, kept on the scale.
    expect(duelReport('judge', { guess: 1.23 })).toEqual({ guess: 1.2 });
    expect(duelReport('judge', { guess: 12 })).toEqual({ guess: 5 });
    expect(duelReport('judge', { guess: Number.NaN })).toBeNull();
  });

  it('decides rounds', () => {
    const solve = (ms: number) => ({ ok: true, ms });
    const miss = { ok: false, ms: 1000 };
    expect(raceRound('best3', solve(9000), solve(8000))).toEqual({
      winner: 'black',
      points: { white: 0, black: 1 },
    });
    expect(raceRound('best3', miss, solve(60_000)).winner).toBe('black');
    expect(raceRound('best3', miss, null)).toEqual({
      winner: null,
      points: { white: 0, black: 0 },
    });
    expect(raceRound('best3', solve(5000), solve(5000)).winner).toBe('shared');
    expect(raceRound('window', solve(5000), solve(20_000))).toEqual({
      winner: 'shared',
      points: { white: 0.5, black: 0.5 },
    });
    expect(raceRound('window', solve(5000), solve(20_001)).winner).toBe('white');
    expect(raceRound('best3', solve(5000), solve(20_000)).winner).toBe('white');

    expect(arbiterRound({ call: 'false', ms: 100 }, { call: 'caught', ms: 9000 }).winner).toBe(
      'black',
    );
    expect(arbiterRound({ call: 'missed', ms: 0 }, null).winner).toBeNull();

    expect(judgeGuess(1.2, 150)).toEqual({ points: 91, verdict: 'spot on', truth: 1.5 });
    expect(judgeGuess(-1, 150)).toEqual({ points: 0, verdict: 'wrong side', truth: 1.5 });
    expect(judgeGuess(0, 10).verdict).toBe('spot on');
    expect(judgeRound({ guess: 1.2 }, { guess: 2.5 }, 150)).toEqual({
      winner: 'white',
      points: { white: 91, black: 70 },
    });
    expect(judgeRound(null, null, 150).winner).toBeNull();
  });

  it('decides duels', () => {
    expect(duelResult('race', { white: 2, black: 1 }, 3, 2)).toBe('1-0');
    expect(duelResult('race', { white: 1.5, black: 1.5 }, 3, 2)).toBeNull();
    expect(duelResult('race', { white: 2, black: 2 }, 4, 1)).toBe('1/2-1/2');
    expect(duelResult('race', { white: 1, black: 0 }, 5, 0)).toBe('1-0');
    expect(duelResult('race', { white: 0, black: 0 }, 5, 0)).toBe('1/2-1/2');
    expect(duelResult('arbiter', { white: 2, black: 2 }, 4, 5)).toBeNull();
    expect(duelResult('arbiter', { white: 2, black: 3 }, 5, 4)).toBe('0-1');
    expect(duelResult('judge', { white: 300, black: 200 }, 4, 1)).toBeNull();
    expect(duelResult('judge', { white: 300, black: 301 }, 5, 0)).toBe('0-1');
    expect(timedResult({ solved: 5, strikes: 3 }, { solved: 4, strikes: 0 })).toBe('1-0');
    expect(timedResult({ solved: 5, strikes: 2 }, { solved: 5, strikes: 1 })).toBe('0-1');
    expect(timedResult({ solved: 5, strikes: 1 }, { solved: 5, strikes: 1 })).toBe('1/2-1/2');
  });
});

/* ------------------------------------------------------------------ */
/* The waiting room                                                   */
/* ------------------------------------------------------------------ */

describe('the waiting room’s games', () => {
  it('lists a game with its options, and pairs only the same game with the same options', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    const b = new Client((s) => w.hub.openLobby(s));
    const c = new Client((s) => w.hub.openLobby(s));
    // A duel has no time control and no colours: the poster hosts it.
    await a.send(seek({ ...RACE, color: 'black' }));
    expect(a.last('posted')).toMatchObject({
      seek: { game: 'race', opts: RACE.opts, tc: null, color: 'random', name: NAME_A },
    });
    await b.send(seek({ ...WINDOW, name: NAME_B }));
    await c.send(seek({ name: 'Quiet Rook' }));
    expect(a.last('paired')).toBeUndefined();
    expect(c.last('lobby')!.seeks).toEqual([
      expect.objectContaining({ game: 'race', opts: RACE.opts }),
      expect.objectContaining({ game: 'race', opts: WINDOW.opts }),
      expect.objectContaining({ game: 'chess', opts: {}, tc: '5+3' }),
    ]);
    await b.send(seek({ ...RACE, name: NAME_B }));
    expect(a.last('paired')).toMatchObject({
      kind: 'race',
      opts: RACE.opts,
      color: 'white',
      tc: null,
      opponent: { name: NAME_B },
    });
    expect(b.last('paired')).toMatchObject({ kind: 'race', opts: RACE.opts, color: 'black' });
    expect(c.last('lobby')!.seeks).toEqual([expect.objectContaining({ game: 'chess' })]);
  });

  it('pairs a variant of chess by its time control and colours too', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    const b = new Client((s) => w.hub.openLobby(s));
    await a.send(seek({ ...ARMY, color: 'black' }));
    await b.send(seek({ ...ARMY, color: 'black', name: NAME_B }));
    expect(a.last('paired')).toBeUndefined();
    await b.send(seek({ ...ARMY, tc: '3+2', color: 'white', name: NAME_B }));
    expect(a.last('paired')).toBeUndefined();
    await b.send(seek({ ...ARMY, color: 'white', name: NAME_B }));
    expect(a.last('paired')).toMatchObject({
      kind: 'army',
      opts: { budget: 30 },
      tc: '5+3',
      color: 'black',
    });
  });

  it('joins a private duel by its link', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    const b = new Client((s) => w.hub.openLobby(s));
    await a.send(seek({ ...JUDGE, private: true }));
    const id = (a.last('posted')!.seek as { id: string }).id;
    expect(b.last('lobby')!.seeks).toEqual([]);
    await b.send({ t: 'join', seek: id, name: NAME_B, rating: null });
    expect(a.last('paired')).toMatchObject({ kind: 'judge', opts: {}, color: 'white' });
    expect(b.last('paired')).toMatchObject({ kind: 'judge', color: 'black' });
  });

  it('refuses a game or options that are not one', async () => {
    const w = world();
    const a = new Client((s) => w.hub.openLobby(s));
    for (const bad of [
      seek({ game: 'poker' }),
      seek({ game: 7 }),
      seek({ game: 'army' }),
      seek({ game: 'army', opts: { budget: 25 } }),
      seek({ game: 'race', opts: { format: 'best3', level: 1000 } }),
      seek({ game: 'race', opts: { format: 'fast', level: 1500 } }),
      seek({ game: 'arbiter', opts: { pace: 'fast' } }),
      seek({ game: 'blindfold', tc: 'none' }),
    ]) {
      a.clear();
      await a.send(bad);
      expect(a.last('error')).toMatchObject({ code: 'bad-request' });
      expect(a.last('posted')).toBeUndefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Army Draft                                                         */
/* ------------------------------------------------------------------ */

describe('an Army Draft game', () => {
  const mine = army({ q: 1, r: 2, p: 8 });
  const theirs = army({ r: 2, b: 2, n: 2, p: 2 });

  it('keeps each army from the other until both are in, then starts from them', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, ARMY);
    expect(white.last('game')).toMatchObject({
      game: 'army',
      opts: { budget: 30 },
      status: 'draft',
      startFen: null,
      draft: {
        budget: 30,
        inMs: LIMITS.draftMs,
        ready: { white: false, black: false },
        armies: { white: null, black: null },
      },
      firstMove: null,
      peeks: null,
    });
    // No moves, draws or takebacks while the armies are chosen.
    await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(white.last('error')).toMatchObject({ code: 'not-now' });
    await white.send({ t: 'draw', op: 'offer' });
    expect(white.last('error')).toMatchObject({ code: 'not-now' });

    for (const bad of [
      army({ q: 3, p: 8 }),
      army({ n: 8 }),
      army({}),
      { q: 1, k: 1 },
      { q: 1.5 },
      'queen',
    ]) {
      white.clear();
      await white.send({ t: 'army', army: bad });
      expect(white.last('error')).toMatchObject({ code: 'bad-request' });
    }

    await white.send({ t: 'army', army: mine });
    expect(black.last('draft')).toEqual({ t: 'draft', ready: { white: true, black: false } });
    await white.send({ t: 'army', army: theirs });
    expect(white.last('error')).toMatchObject({ code: 'not-now' });
    // Black cannot see White's army; White sees its own.
    black.clear();
    await black.send({ t: 'hello' });
    expect(black.last('game')).toMatchObject({
      draft: { ready: { white: true, black: false }, armies: { white: null, black: null } },
    });
    white.clear();
    await white.send({ t: 'hello' });
    expect(white.last('game')).toMatchObject({ draft: { armies: { white: mine, black: null } } });

    await w.advance(10_000);
    await black.send({ t: 'army', army: theirs });
    const fen = draftFen(mine, theirs);
    for (const player of [white, black]) {
      expect(player.last('game')).toMatchObject({
        status: 'playing',
        startFen: fen,
        draft: {
          inMs: null,
          ready: { white: true, black: true },
          armies: { white: mine, black: theirs },
        },
        moves: [],
        firstMove: { color: 'white', inMs: LIMITS.firstMoveMs },
      });
    }
    // The moves are those of the drafted position: White has no knights.
    await white.send({ t: 'move', uci: 'g1f3', ply: 0 });
    expect(white.last('error')).toMatchObject({ code: 'illegal' });
    await play({ white, black }, ['e2e4', 'b8c6']);
    expect(white.last('move')).toMatchObject({ uci: 'b8c6', clock: { running: 'white' } });
    await white.send({ t: 'army', army: mine });
    expect(white.last('error')).toMatchObject({ code: 'not-now' });
  });

  it('drafts a random army for whoever has not chosen in time', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, ARMY);
    await black.send({ t: 'army', army: theirs });
    await w.advance(LIMITS.draftMs - 1);
    expect(white.last('game')).toMatchObject({ status: 'draft' });
    await w.advance(1);
    const game = white.last('game')!;
    expect(game).toMatchObject({ status: 'playing', draft: { armies: { black: theirs } } });
    const drafted = (game.draft as { armies: { white: Army } }).armies.white;
    expect(armyProblem(drafted, 30)).toBeNull();
    expect(game.startFen).toBe(draftFen(drafted, theirs));
    // And then White must move, as in any game.
    await w.advance(LIMITS.firstMoveMs);
    expect(black.last('end')).toMatchObject({ result: '*', reason: 'no-start' });
  });

  it('can be aborted while the armies are chosen, and rematched as a draft', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, ARMY);
    await black.send({ t: 'resign' });
    expect(white.last('end')).toMatchObject({ result: '*', reason: 'aborted' });
    await white.send({ t: 'rematch', op: 'offer' });
    await black.send({ t: 'rematch', op: 'accept' });
    const forBlack = black.last('rematch')!;
    const next = new Client((s) => w.hub.openRoom(forBlack.game as string, s));
    await next.send({ t: 'hello', seat: forBlack.seat });
    expect(next.last('game')).toMatchObject({
      game: 'army',
      opts: { budget: 30 },
      you: 'white',
      white: { name: NAME_B },
      status: 'draft',
      tc: '5+3',
    });
  });

  it('carries on from the drafted position when the room wakes up', async () => {
    let stored: RoomState | null = null;
    const time = 5_000_000;
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
      store: (state: RoomState) => {
        stored = structuredClone(state);
        return Promise.resolve();
      },
      remove: () => Promise.resolve(),
      schedule: () => undefined,
      createGame: () => Promise.resolve(),
      now: () => time,
    });
    const seats = { white: randomId(32), black: randomId(32) };
    const first = createRoom(platform());
    await first.create({
      id: randomId(16),
      game: 'army',
      opts: { budget: 30 },
      tc: '3+2',
      white: { name: NAME_A, rating: null, seatHash: await hashToken(seats.white) },
      black: { name: NAME_B, rating: null, seatHash: await hashToken(seats.black) },
    });
    for (const id of ['w', 'b']) {
      sockets.push({
        data: { id, seat: null, openedAt: time, rateStart: 0, rateCount: 0 } as never,
        sent: [],
      });
    }
    const [w, b] = platform().connections();
    await first.message(w, JSON.stringify({ t: 'hello', seat: seats.white }));
    await first.message(b, JSON.stringify({ t: 'hello', seat: seats.black }));
    await first.message(w, JSON.stringify({ t: 'army', army: mine }));
    await first.message(b, JSON.stringify({ t: 'army', army: theirs }));
    await first.message(w, JSON.stringify({ t: 'move', uci: 'e2e4', ply: 0 }));

    // A new instance replays the moves from the drafted position: Black's rook has
    // no pawn in front of it there.
    const again = createRoom(platform());
    await again.message(b, JSON.stringify({ t: 'move', uci: 'h8h3', ply: 1 }));
    const last = JSON.parse(sockets[1].sent.at(-1)!) as Message;
    expect(last).toMatchObject({ t: 'move', uci: 'h8h3', ply: 1 });
  });
});

/* ------------------------------------------------------------------ */
/* Blindfold                                                          */
/* ------------------------------------------------------------------ */

describe('a blindfold game', () => {
  it('counts each player’s peeks', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, BLINDFOLD);
    expect(white.last('game')).toMatchObject({
      game: 'blindfold',
      status: 'playing',
      peeks: { white: 0, black: 0 },
      draft: null,
    });
    await black.send({ t: 'peek' });
    expect(white.last('peeks')).toEqual({ t: 'peeks', white: 0, black: 1 });
    for (let i = 1; i < BLINDFOLD_PEEKS; i++) await black.send({ t: 'peek' });
    expect(black.last('peeks')).toEqual({ t: 'peeks', white: 0, black: BLINDFOLD_PEEKS });
    await black.send({ t: 'peek' });
    expect(black.last('error')).toMatchObject({ code: 'not-now' });
    black.clear();
    await black.send({ t: 'hello' });
    expect(black.last('game')).toMatchObject({ peeks: { white: 0, black: BLINDFOLD_PEEKS } });
    await white.send({ t: 'abort' });
    await white.send({ t: 'peek' });
    expect(white.last('error')).toMatchObject({ code: 'over' });
  });

  it('has no peeks in a game that shows its pieces', async () => {
    const w = world();
    const { white } = await pairedWith(w, { tc: '5+3', color: 'white' });
    expect(white.last('game')).toMatchObject({ game: 'chess', opts: {}, peeks: null });
    await white.send({ t: 'peek' });
    expect(white.last('error')).toMatchObject({ code: 'bad-request' });
  });
});

/* ------------------------------------------------------------------ */
/* Duels                                                              */
/* ------------------------------------------------------------------ */

describe('a duel', () => {
  it('waits for the host’s rounds and both players, then counts down', async () => {
    const w = world();
    const p = await pairedWith(w, JUDGE, { seat: false });
    await p.white.send({ t: 'hello', seat: p.seats.white });
    expect(p.white.last('game')).toMatchObject({
      game: 'judge',
      opts: {},
      host: true,
      status: 'setup',
      setupIn: DUEL_RULES.setupMs,
      items: null,
      round: 0,
      phase: null,
      score: { white: 0, black: 0 },
      progress: null,
      result: null,
      present: { white: true, black: false },
    });
    await p.white.send({ t: 'content', items: judgeItems(5) });
    expect(p.white.last('content')).toEqual({ t: 'content', items: judgeItems(5) });
    expect(p.white.last('round')).toBeUndefined();
    await p.black.send({ t: 'hello', seat: p.seats.black });
    expect(p.black.last('game')).toMatchObject({
      host: false,
      status: 'setup',
      items: judgeItems(5),
    });
    const countdown = { t: 'round', round: 0, phase: 'countdown', inMs: DUEL_RULES.countdownMs };
    expect(p.black.last('round')).toEqual(countdown);
    expect(p.white.last('round')).toEqual(countdown);
    // A snapshot in the countdown says how long it has left.
    await w.advance(1000);
    p.black.clear();
    await p.black.send({ t: 'hello' });
    expect(p.black.last('game')).toMatchObject({
      status: 'playing',
      phase: 'countdown',
      phaseIn: DUEL_RULES.countdownMs - 1000,
    });
  });

  it('takes the rounds from the host only, checked, in one message bigger than any other', async () => {
    const w = world();
    const p = await pairedWith(w, TIMED);
    await p.black.send({ t: 'content', items: puzzles(2) });
    expect(p.black.last('error')).toMatchObject({ code: 'not-now' });
    await p.white.send({ t: 'content', items: puzzles(DUEL_RULES.race.timedMin - 1) });
    expect(p.white.last('error')).toMatchObject({ code: 'bad-request' });
    // The guest may not send that much.
    await p.black.send({ t: 'content', items: puzzles(40) });
    expect(p.black.closed?.code).toBe(CLOSE.tooBig);
    // The host may, up to a limit.
    const big = JSON.stringify({ t: 'content', items: puzzles(40) });
    expect(big.length).toBeGreaterThan(LIMITS.messageBytes);
    await p.white.send(big);
    expect(p.white.closed).toBeNull();
    expect(p.white.last('content')).toMatchObject({ items: puzzles(40) });
    await p.white.send({ t: 'content', items: puzzles(40) });
    expect(p.white.last('error')).toMatchObject({ code: 'not-now' });
    await p.white.send({ t: 'say', phrase: 'x'.repeat(LIMITS.contentBytes) });
    expect(p.white.closed?.code).toBe(CLOSE.tooBig);
  });

  it('ends when its rounds never come, and may be aborted before it starts', async () => {
    const w = world();
    const first = await pairedWith(w, JUDGE);
    await w.advance(DUEL_RULES.setupMs);
    expect(first.black.last('end')).toMatchObject({ result: '*', reason: 'no-start' });

    const second = await pairedWith(w, JUDGE);
    await second.black.send({ t: 'abort' });
    expect(second.white.last('end')).toMatchObject({ result: '*', reason: 'aborted' });

    const third = await pairedWith(w, JUDGE);
    await third.white.send({ t: 'content', items: judgeItems(5) });
    await third.black.send({ t: 'abort' });
    expect(third.black.last('error')).toMatchObject({ code: 'not-now' });
    await third.black.send({ t: 'resign' });
    expect(third.white.last('end')).toMatchObject({ result: '1-0', reason: 'resign' });
    await third.black.send({ t: 'resign' });
    expect(third.black.last('error')).toMatchObject({ code: 'over' });
  });

  it('runs a race of rounds: the first clean solve wins each, first to two', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, RACE);
    await white.send({ t: 'content', items: puzzles(5) });
    // A result in the countdown is too early.
    await white.send({ t: 'result', round: 0, ok: true, ms: 1 });
    expect(white.last('error')).toMatchObject({ code: 'not-now' });
    await w.advance(DUEL_RULES.countdownMs);
    expect(black.last('round')).toEqual({
      t: 'round',
      round: 0,
      phase: 'live',
      inMs: DUEL_RULES.race.roundMs,
    });

    // Round 0: White solves; Black's result could still be quicker for a moment, but is not.
    await w.advance(8000);
    await white.send({ t: 'result', round: 0, ok: true, ms: 7950 });
    expect(black.last('reported')).toEqual({
      t: 'reported',
      round: 0,
      by: 'white',
      result: { ok: true, ms: 7950 },
    });
    await white.send({ t: 'result', round: 0, ok: true, ms: 10 });
    expect(white.last('reported')).toMatchObject({ result: { ms: 7950 } });
    await w.advance(DUEL_RULES.race.graceMs - 1);
    expect(black.last('round-end')).toBeUndefined();
    await w.advance(1);
    expect(black.last('round-end')).toEqual({
      t: 'round-end',
      round: 0,
      results: { white: { ok: true, ms: 7950 }, black: null },
      winner: 'white',
      points: { white: 1, black: 0 },
      score: { white: 1, black: 0 },
    });
    await black.send({ t: 'result', round: 0, ok: true, ms: 9000 });
    expect(black.last('error')).toMatchObject({ code: 'not-now' });

    // Round 1: both solve; the quicker time wins, whoever reports first.
    await w.advance(DUEL_RULES.revealMs);
    expect(white.last('round')).toMatchObject({ round: 1, phase: 'countdown' });
    await w.advance(DUEL_RULES.countdownMs);
    await white.send({ t: 'result', round: 1, ok: true, ms: 9000 });
    await black.send({ t: 'result', round: 1, ok: true, ms: 8000 });
    expect(white.last('round-end')).toMatchObject({
      round: 1,
      winner: 'black',
      score: { white: 1, black: 1 },
    });

    // Round 2: a wrong move is out of the round, but does not hurry the other.
    await w.advance(DUEL_RULES.revealMs + DUEL_RULES.countdownMs);
    await black.send({ t: 'result', round: 2, ok: false, ms: 3000 });
    await w.advance(DUEL_RULES.race.graceMs * 3);
    expect(white.last('round-end')).toMatchObject({ round: 1 });
    await white.send({ t: 'result', round: 2, ok: true, ms: 20_000 });
    expect(black.last('end')).toEqual({
      t: 'end',
      result: '1-0',
      reason: 'score',
      score: { white: 2, black: 1 },
      progress: null,
    });
    black.clear();
    await black.send({ t: 'hello' });
    expect(black.last('game')).toMatchObject({
      status: 'over',
      result: '1-0',
      rounds: [{ winner: 'white' }, { winner: 'black' }, { winner: 'white' }],
    });
  });

  it('shares a round of the window race when the clean solves are within 15 seconds', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, WINDOW);
    await white.send({ t: 'content', items: puzzles(5) });
    await w.advance(DUEL_RULES.countdownMs);
    await white.send({ t: 'result', round: 0, ok: true, ms: 8000 });
    await w.advance(DUEL_RULES.race.windowMs);
    expect(white.last('round-end')).toBeUndefined();
    await black.send({ t: 'result', round: 0, ok: true, ms: 22_000 });
    expect(white.last('round-end')).toMatchObject({
      winner: 'shared',
      points: { white: 0.5, black: 0.5 },
    });
    // Past the window, the first solve takes the round alone.
    await w.advance(DUEL_RULES.revealMs + DUEL_RULES.countdownMs);
    await white.send({ t: 'result', round: 1, ok: true, ms: 5000 });
    await w.advance(DUEL_RULES.race.graceMs + DUEL_RULES.race.windowMs);
    expect(black.last('round-end')).toMatchObject({
      round: 1,
      winner: 'white',
      score: { white: 1.5, black: 0.5 },
    });
  });

  it('runs a timed race: the same puzzles at each player’s pace, three strikes and out', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, TIMED);
    const start = { index: 0, solved: 0, strikes: 0, done: false };
    expect(white.last('game')).toMatchObject({ progress: { white: start, black: start } });
    await white.send({ t: 'content', items: puzzles(DUEL_RULES.race.timedMin) });
    await w.advance(DUEL_RULES.countdownMs);
    expect(black.last('round')).toEqual({
      t: 'round',
      round: 0,
      phase: 'live',
      inMs: DUEL_RULES.race.timedMs,
    });
    await white.send({ t: 'result', index: 0, ok: true, ms: 4000 });
    expect(black.last('progress')).toEqual({
      t: 'progress',
      white: { index: 1, solved: 1, strikes: 0, done: false },
      black: start,
    });
    await white.send({ t: 'result', index: 0, ok: true, ms: 4000 });
    expect(white.last('error')).toMatchObject({ code: 'not-now' });
    await white.send({ t: 'result', round: 0, ok: true, ms: 4000 });
    expect(white.last('error')).toMatchObject({ code: 'bad-request' });
    for (let i = 0; i < DUEL_RULES.race.strikes; i++) {
      await black.send({ t: 'result', index: i, ok: false, ms: 1000 });
    }
    expect(white.last('progress')).toMatchObject({
      black: { index: 3, solved: 0, strikes: 3, done: true },
    });
    await black.send({ t: 'result', index: 3, ok: true, ms: 1000 });
    expect(white.last('progress')).toMatchObject({ black: { solved: 0 } });
    await w.advance(DUEL_RULES.race.timedMs + 1999);
    expect(black.last('end')).toBeUndefined();
    await w.advance(1);
    expect(black.last('end')).toMatchObject({
      result: '1-0',
      reason: 'score',
      progress: { white: { solved: 1 }, black: { strikes: 3 } },
    });
  });

  it('ends a timed race as soon as both players are through', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, TIMED);
    const count = DUEL_RULES.race.timedMin;
    await white.send({ t: 'content', items: puzzles(count) });
    await w.advance(DUEL_RULES.countdownMs);
    for (let i = 0; i < DUEL_RULES.race.strikes; i++) {
      await white.send({ t: 'result', index: i, ok: false, ms: 500 });
    }
    for (let i = 0; i < count; i++) {
      await black.send({ t: 'result', index: i, ok: true, ms: 2000 });
      // Within the socket's allowance of messages.
      await w.advance(1000);
    }
    expect(white.last('end')).toMatchObject({
      result: '0-1',
      progress: { black: { index: count, solved: count, done: true } },
    });
  });

  it('runs Arbiter: the quicker call on the illegal move wins the round, first to three', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, ARBITER);
    await white.send({ t: 'content', items: arbiterItems(9) });
    for (let round = 0; round < 3; round++) {
      await w.advance(DUEL_RULES.countdownMs);
      // A call on a legal move is out of the round.
      await black.send({ t: 'result', round, call: 'false', ms: 1500 });
      await white.send({ t: 'result', round, call: 'caught', ms: 6000 });
      expect(black.last('round-end')).toMatchObject({ round, winner: 'white' });
      if (round < 2) await w.advance(DUEL_RULES.revealMs);
    }
    expect(black.last('end')).toMatchObject({
      result: '1-0',
      reason: 'score',
      score: { white: 3, black: 0 },
    });
  });

  it('runs Who Stands Better?: judgements stay hidden until the round ends', async () => {
    const w = world();
    const { white, black } = await pairedWith(w, JUDGE);
    await white.send({ t: 'content', items: judgeItems(5) });
    await w.advance(DUEL_RULES.countdownMs);
    await white.send({ t: 'result', round: 0, guess: 1.2 });
    expect(black.last('reported')).toEqual({
      t: 'reported',
      round: 0,
      by: 'white',
      result: { locked: true },
    });
    black.clear();
    await black.send({ t: 'hello' });
    expect(black.last('game')).toMatchObject({ mine: null, theirs: { locked: true } });
    white.clear();
    await white.send({ t: 'hello' });
    expect(white.last('game')).toMatchObject({ mine: { guess: 1.2 }, theirs: null });
    await black.send({ t: 'result', round: 0, guess: -1 });
    expect(white.last('round-end')).toMatchObject({
      round: 0,
      results: { white: { guess: 1.2 }, black: { guess: -1 } },
      winner: 'white',
      points: { white: 91, black: 0 },
    });
    // The other positions go by with nobody judging them.
    for (let round = 1; round < 5; round++) {
      await w.advance(DUEL_RULES.revealMs + DUEL_RULES.countdownMs + DUEL_RULES.judge.roundMs);
      expect(white.last('round-end')).toMatchObject({ round, winner: null });
    }
    expect(black.last('end')).toMatchObject({
      result: '1-0',
      score: { white: 91, black: 0 },
    });
  });

  it('goes on without a player who has gone, and takes them back', async () => {
    const w = world();
    const p = await pairedWith(w, ARBITER);
    await p.white.send({ t: 'content', items: arbiterItems(9) });
    await p.black.leave();
    expect(p.white.last('present')).toEqual({
      t: 'present',
      white: true,
      black: false,
      gone: null,
    });
    await p.white.send({ t: 'claim', op: 'win' });
    expect(p.white.last('error')).toMatchObject({ code: 'bad-request' });
    await w.advance(DUEL_RULES.countdownMs + DUEL_RULES.arbiter.roundMs);
    expect(p.white.last('round-end')).toMatchObject({ round: 0, winner: null });
    const back = new Client((s) => w.hub.openRoom(p.game, s));
    await back.send({ t: 'hello', seat: p.seats.black });
    expect(back.last('game')).toMatchObject({ phase: 'reveal', rounds: [{ round: 0 }] });
    expect(p.white.last('present')).toMatchObject({ black: true });
  });

  it('passes phrases, refuses moves, and plays a rematch with the other player hosting', async () => {
    const w = world();
    const p = await pairedWith(w, RACE);
    await p.black.send({ t: 'say', phrase: 'luck' });
    expect(p.white.last('say')).toEqual({ t: 'say', by: 'black', phrase: 'luck' });
    await p.white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(p.white.last('error')).toMatchObject({ code: 'bad-request' });
    await p.white.send({ t: 'rematch', op: 'offer' });
    expect(p.white.last('error')).toMatchObject({ code: 'not-now' });
    await p.white.send({ t: 'abort' });
    await p.black.send({ t: 'rematch', op: 'offer' });
    expect(p.white.last('offers')).toMatchObject({ rematch: 'black' });
    await p.white.send({ t: 'rematch', op: 'accept' });
    const forBlack = p.black.last('rematch')!;
    expect(forBlack).toMatchObject({ color: 'white' });
    const next = new Client((s) => w.hub.openRoom(forBlack.game as string, s));
    await next.send({ t: 'hello', seat: forBlack.seat });
    expect(next.last('game')).toMatchObject({
      game: 'race',
      opts: RACE.opts,
      you: 'white',
      host: true,
      white: { name: NAME_B },
      black: { name: NAME_A },
      status: 'setup',
    });
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashToken } from './src/handler.mjs';
import {
  CHESS960_POSITIONS,
  Chess960Game,
  chess960BackRank,
  chess960StartFen,
  isChess960Position,
  randomChess960Position,
} from './src/live/chess960.mjs';
import { createRoom, newGame, type RoomState } from './src/live/room.mjs';
import { cannotMate, endOf, playUci, replay } from './src/live/rules.mjs';
import { CORRESPONDENCE_GAMES, gameOptions, isGame, LIMITS, randomId } from './src/live/shared.mjs';
import { Client, type Message, NAME_A, NAME_B, pairedWith, play, seek, world } from './testWorld';

/** Kings on f1 and f8 with a knight and a rook beside them: both sides castle short in two moves. */
const KNR = 192;
const CLASSICAL = 518;
const CHESS960 = { game: 'chess960', tc: '5+3', color: 'white' };

/** A Chess960 game played from `fen` through `moves` (each must be legal). */
function game(fen: string, moves: string[] = []) {
  const chess = new Chess960Game(fen);
  for (const uci of moves) {
    if (!playUci(chess, uci)) throw new Error(`Not legal: ${uci} in ${chess.fen()}`);
  }
  return chess;
}

/* ------------------------------------------------------------------ */
/* The start positions                                                */
/* ------------------------------------------------------------------ */

describe('Chess960’s start positions', () => {
  it('numbers the 960 as the standard numbering does', () => {
    expect(chess960BackRank(CLASSICAL)).toBe('RNBQKBNR');
    expect(chess960BackRank(0)).toBe('BBQNNRKR');
    expect(chess960BackRank(KNR)).toBe('BBQNRKNR');
    expect(chess960BackRank(959)).toBe('RKRNNQBB');
    expect(chess960StartFen(274)).toBe('bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w KQkq - 0 1');
    expect(() => chess960BackRank(960)).toThrow(RangeError);
    expect(() => chess960BackRank(1.5)).toThrow(RangeError);
    expect(isChess960Position(0)).toBe(true);
    expect(isChess960Position(-1)).toBe(false);
    expect(isChess960Position('5')).toBe(false);
  });

  it('gives 960 different positions, each a legal Chess960 start', () => {
    const ranks = new Set<string>();
    for (let n = 0; n < CHESS960_POSITIONS; n++) {
      const rank = chess960BackRank(n);
      ranks.add(rank);
      const files = [...rank];
      const bishops = files.flatMap((piece, file) => (piece === 'B' ? [file] : []));
      expect(bishops.map((file) => file % 2).sort()).toEqual([0, 1]);
      expect(rank.replace(/[^RK]/g, '')).toBe('RKR');
      expect(files.filter((piece) => piece === 'Q')).toHaveLength(1);
      expect(files.filter((piece) => piece === 'N')).toHaveLength(2);
      // chessops takes every one, castling rights and all.
      expect(new Chess960Game(chess960StartFen(n)).fen()).toBe(chess960StartFen(n));
    }
    expect(ranks.size).toBe(CHESS960_POSITIONS);
  });

  it('draws one at random', () => {
    const drawn = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = randomChess960Position();
      expect(isChess960Position(n)).toBe(true);
      drawn.add(n);
    }
    expect(drawn.size).toBeGreaterThan(700);
  });
});

/* ------------------------------------------------------------------ */
/* The referee                                                        */
/* ------------------------------------------------------------------ */

describe('refereeing a Chess960 game', () => {
  it('castles both ways as the king taking its own rook', () => {
    // The classical position: the king goes to g1 or c1, the rook beside it.
    const classical = game(chess960StartFen(CLASSICAL), [
      'e2e4',
      'e7e5',
      'g1f3',
      'b8c6',
      'f1c4',
      'd7d6',
    ]);
    // Standard chess's "e1g1" is not how a Chess960 board castles.
    expect(playUci(classical, 'e1g1')).toBeNull();
    expect(playUci(classical, 'e1h1')).toMatchObject({ san: 'O-O', from: 'e1', to: 'h1' });
    expect(classical.fen()).toMatch(/^\S+\/RNBQ1RK1 b kq /);

    const long = game(chess960StartFen(CLASSICAL), [
      'd2d4',
      'd7d5',
      'b1c3',
      'b8c6',
      'c1f4',
      'c8f5',
      'd1d2',
      'd8d7',
    ]);
    expect(playUci(long, 'e1a1')).toMatchObject({ san: 'O-O-O' });
    expect(playUci(long, 'e8a8')).toMatchObject({ san: 'O-O-O' });
    expect(long.fen()).toMatch(/^2kr1/);
    expect(long.fen()).toMatch(/\/2KR1BNR w - /);

    // Position 192, BBQNRKNR: once the knight is out, the king steps to g1 and the rook to f1.
    const short = game(chess960StartFen(KNR), ['g1h3', 'g8h6']);
    expect(playUci(short, 'f1h1')).toMatchObject({ san: 'O-O' });
    expect(playUci(short, 'f8h8')).toMatchObject({ san: 'O-O' });
    expect(short.fen()).toMatch(/^bbqnrrk1\/.*\/BBQNRRK1 w - /);

    // Position 3, BQNNRKRB: king and rook side by side swap places at once.
    const swap = game(chess960StartFen(3));
    expect(playUci(swap, 'f1g1')).toMatchObject({ san: 'O-O' });
    expect(swap.fen()).toMatch(/\/BQNNRRKB b kq /);

    // Position 249, NRKBBQNR: castling long, the king stays on c1 and the rook comes to d1.
    const still = game(chess960StartFen(249), ['c2c3', 'c7c6', 'd1a4', 'd8a5']);
    expect(playUci(still, 'c1b1')).toMatchObject({ san: 'O-O-O' });
    expect(still.fen()).toMatch(/\/N1KRBQNR b kq /);
  });

  it('refuses castling out of, through or into check, and without the right', () => {
    // Shredder-FEN castling rights by file: the king on b1 castles onto its rook on h1.
    const through = new Chess960Game('4r1k1/8/8/8/8/8/8/1K5R w H - 0 1');
    expect(playUci(through, 'b1h1')).toBeNull();
    const into = new Chess960Game('k5r1/8/8/8/8/8/8/1K5R w H - 0 1');
    expect(playUci(into, 'b1h1')).toBeNull();
    const inCheck = new Chess960Game('1r4k1/8/8/8/8/8/8/1K5R w H - 0 1');
    expect(playUci(inCheck, 'b1h1')).toBeNull();
    const free = new Chess960Game('k7/8/8/8/8/8/8/1K5R w H - 0 1');
    expect(playUci(free, 'b1h1')).toMatchObject({ san: 'O-O' });
    expect(free.fen()).toBe('k7/8/8/8/8/8/8/5RK1 b - - 1 1');
    const noRight = new Chess960Game('k7/8/8/8/8/8/8/1K5R w - - 0 1');
    expect(playUci(noRight, 'b1h1')).toBeNull();
  });

  it('refuses a king move of two files that is not castling', () => {
    // chessops alone would castle "d1f1"; only the king onto its rook castles.
    const chess = new Chess960Game('4k3/8/8/8/8/8/8/3K3R w H - 0 1');
    expect(playUci(chess, 'd1f1')).toBeNull();
    expect(playUci(chess, 'd1b1')).toBeNull();
    expect(chess.fen()).toBe('4k3/8/8/8/8/8/8/3K3R w K - 0 1');
    // A king next to its castling square steps there as a king.
    const step = game(chess960StartFen(KNR), ['g1h3', 'g8h6']);
    expect(playUci(step, 'f1g1')).toMatchObject({ san: 'Kg1' });
    expect(step.fen()).toMatch(/\/BBQNR1KR b kq /);
  });

  it('takes promotions only with their piece, and moves of the side to move only', () => {
    const chess = new Chess960Game('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    expect(playUci(chess, 'b7b8')).toBeNull();
    expect(playUci(chess, 'e8e7')).toBeNull();
    expect(playUci(chess, 'e1e2q')).toBeNull();
    expect(playUci(chess, 'b7b8n')).toMatchObject({ san: 'b8=N', promotion: 'n' });
    expect(playUci(chess, 'nonsense')).toBeNull();
    expect(playUci(chess, 42)).toBeNull();
  });

  it('ends the game as chess ends', () => {
    expect(
      endOf(replay(['f2f3', 'e7e5', 'g2g4', 'd8h4'], chess960StartFen(CLASSICAL), 'chess960')!),
    ).toEqual({ result: '0-1', reason: 'checkmate' });
    expect(endOf(game('7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', ['f1f7']))).toEqual({
      result: '1/2-1/2',
      reason: 'stalemate',
    });
    expect(endOf(game('4k3/8/8/8/8/8/3n4/4K3 w - - 0 1', ['e1d2']))).toEqual({
      result: '1/2-1/2',
      reason: 'insufficient',
    });
    const knights = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const twice = replay(
      [...knights, ...knights.slice(0, 3)],
      chess960StartFen(CLASSICAL),
      'chess960',
    );
    expect(endOf(twice!)).toBeNull();
    expect(playUci(twice!, 'f6g8')).not.toBeNull();
    expect(endOf(twice!)).toEqual({ result: '1/2-1/2', reason: 'repetition' });
    expect(endOf(game('4k3/8/8/8/8/8/8/R3K3 w - - 99 80', ['a1a2']))).toEqual({
      result: '1/2-1/2',
      reason: 'fifty-moves',
    });
    expect(endOf(game(chess960StartFen(KNR), ['g1h3']))).toBeNull();
  });

  it('knows who can no longer mate when a flag falls', () => {
    const bishop = new Chess960Game('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1');
    expect(cannotMate(bishop, 'w')).toBe(true);
    expect(cannotMate(bishop, 'b')).toBe(true);
    const rook = new Chess960Game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(cannotMate(rook, 'w')).toBe(false);
    const knightEach = new Chess960Game('4k1n1/8/8/8/8/8/8/1N2K3 w - - 0 1');
    expect(cannotMate(knightEach, 'w')).toBe(false);
  });

  it('takes moves back one at a time, repetitions with them', () => {
    const chess = game(chess960StartFen(KNR), ['g1h3', 'g8h6', 'f1h1']);
    expect(chess.undo()).toBe(true);
    expect(chess.fen()).toMatch(/\/BBQNRK1R w KQkq /);
    expect(playUci(chess, 'f1g1')).toMatchObject({ san: 'Kg1' });
    chess.undo();
    chess.undo();
    chess.undo();
    expect(chess.fen()).toBe(chess960StartFen(KNR));
    expect(chess.undo()).toBeNull();
  });

  it('replays nothing without its start position', () => {
    expect(replay([], null, 'chess960')).toBeNull();
    expect(replay([], 'not a fen', 'chess960')).toBeNull();
    expect(replay(['e1g1'], chess960StartFen(CLASSICAL), 'chess960')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The game rooms                                                     */
/* ------------------------------------------------------------------ */

/** A world whose Chess960 games start from `positions`, one after the other. */
function worldOf(...positions: number[]) {
  const drawn: number[] = [];
  const w = world({
    chess960Position: () => {
      const n = positions[drawn.length] ?? 0;
      drawn.push(n);
      return n;
    },
  });
  return { w, drawn };
}

/** The last snapshot a client was sent. */
const snapshot = (client: Client) => client.last('game') as Message;

describe('a Chess960 game on the relay', () => {
  it('is a game kind without options, paired only with the same kind and time control', async () => {
    expect(isGame('chess960')).toBe(true);
    expect(gameOptions('chess960', { budget: 30 })).toEqual({});
    expect(CORRESPONDENCE_GAMES).toContain('chess960');

    const w = world();
    const chess = new Client((s) => w.hub.openLobby(s));
    const fischer = new Client((s) => w.hub.openLobby(s));
    const faster = new Client((s) => w.hub.openLobby(s));
    await chess.send(seek({ tc: '5+3' }));
    await fischer.send(seek({ game: 'chess960', tc: '5+3', name: NAME_B }));
    await faster.send(seek({ game: 'chess960', tc: '3+0', name: 'Bold Rook' }));
    expect(fischer.last('paired')).toBeUndefined();
    expect(faster.last('paired')).toBeUndefined();
    expect(fischer.last('posted')).toMatchObject({ seek: { game: 'chess960', tc: '5+3' } });
    await w.listed();
    const lobby = chess.last('lobby') as { seeks: Message[] };
    expect(lobby.seeks.map((s) => [s.game, s.tc])).toEqual([
      ['chess', '5+3'],
      ['chess960', '5+3'],
      ['chess960', '3+0'],
    ]);

    const joiner = new Client((s) => w.hub.openLobby(s));
    await joiner.send(seek({ game: 'chess960', tc: '5+3', name: 'Calm Pawn' }));
    expect(joiner.last('paired')).toMatchObject({ kind: 'chess960', opts: {}, tc: '5+3' });
    expect(fischer.last('paired')).toMatchObject({ kind: 'chess960', tc: '5+3' });
    expect(chess.last('paired')).toBeUndefined();
  });

  it('starts from the position the room draws, and keeps it', async () => {
    const w = world();
    const players = await pairedWith(w, CHESS960);
    const first = snapshot(players.white);
    expect(first).toMatchObject({ game: 'chess960', opts: {}, you: 'white', moves: [] });
    const n = [...Array(CHESS960_POSITIONS).keys()].find(
      (i) => chess960StartFen(i) === first.startFen,
    );
    expect(n).toBeDefined();
    expect(snapshot(players.black).startFen).toBe(first.startFen);
    // Again after a hello: the room does not draw anew.
    await players.black.send({ t: 'hello', seat: players.seats.black });
    expect(snapshot(players.black).startFen).toBe(first.startFen);
  });

  it('referees the moves: castling as the king takes its rook, the illegal refused', async () => {
    const { w } = worldOf(KNR);
    const players = await pairedWith(w, CHESS960);
    expect(snapshot(players.white).startFen).toBe(chess960StartFen(KNR));
    await play(players, ['g1h3', 'g8h6']);
    // The king onto its rook on e1 would castle long, but the queen and a knight are in the way.
    await players.white.send({ t: 'move', uci: 'f1e1', ply: 2 });
    expect(players.white.last('error')).toMatchObject({ code: 'illegal' });
    await players.white.send({ t: 'move', uci: 'f1h1', ply: 2 });
    expect(players.black.last('move')).toMatchObject({ uci: 'f1h1', ply: 2 });
    await players.black.send({ t: 'move', uci: 'f8h8', ply: 3 });
    expect(players.white.last('move')).toMatchObject({ uci: 'f8h8', ply: 3 });
    await players.white.send({ t: 'hello', seat: players.seats.white });
    expect(snapshot(players.white)).toMatchObject({
      moves: ['g1h3', 'g8h6', 'f1h1', 'f8h8'],
      status: 'playing',
    });
  });

  it('ends by mate, repetition and the flag, as chess does', async () => {
    const { w } = worldOf(CLASSICAL, CLASSICAL, KNR);
    const mate = await pairedWith(w, CHESS960);
    await play(mate, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(mate.white.last('end')).toMatchObject({ result: '0-1', reason: 'checkmate' });

    const again = await pairedWith(w, CHESS960);
    const knights = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    await play(again, [...knights, ...knights]);
    expect(again.black.last('end')).toMatchObject({ result: '1/2-1/2', reason: 'repetition' });

    const flag = await pairedWith(w, CHESS960);
    await play(flag, ['g1h3', 'g8h6', 'f1h1']);
    await w.advance(5 * 60_000 + 1000);
    expect(flag.white.last('end')).toMatchObject({ result: '1-0', reason: 'time' });
  });

  it('takes a castling move back on request, and plays on', async () => {
    const { w } = worldOf(KNR);
    const players = await pairedWith(w, CHESS960);
    await play(players, ['g1h3', 'g8h6', 'f1h1']);
    await players.white.send({ t: 'takeback', op: 'offer' });
    await players.black.send({ t: 'takeback', op: 'accept' });
    expect(players.black.last('undo')).toMatchObject({ plies: 1 });
    // The king steps to g1 instead, and castling is gone for good.
    await players.white.send({ t: 'move', uci: 'f1g1', ply: 2 });
    await players.black.send({ t: 'move', uci: 'f8h8', ply: 3 });
    expect(players.white.last('error')).toBeUndefined();
    await players.white.send({ t: 'move', uci: 'g1h1', ply: 4 });
    expect(players.white.last('error')).toMatchObject({ code: 'illegal' });
    expect(players.black.last('move')).toMatchObject({ uci: 'f8h8', ply: 3 });
  });

  it('is aborted, drawn and claimed as a game of chess is', async () => {
    const { w } = worldOf(KNR, KNR, KNR);
    const aborted = await pairedWith(w, CHESS960);
    await play(aborted, ['g1h3']);
    await aborted.black.send({ t: 'abort' });
    expect(aborted.white.last('end')).toMatchObject({ result: '*', reason: 'aborted' });

    const drawn = await pairedWith(w, CHESS960);
    await play(drawn, ['g1h3', 'g8h6', 'f1h1']);
    await drawn.black.send({ t: 'draw', op: 'offer' });
    await drawn.white.send({ t: 'draw', op: 'accept' });
    expect(drawn.black.last('end')).toMatchObject({ result: '1/2-1/2', reason: 'agreement' });

    const claimed = await pairedWith(w, CHESS960);
    await play(claimed, ['g1h3', 'g8h6']);
    await claimed.black.leave();
    await w.advance(LIMITS.goneClaimMs);
    await claimed.white.send({ t: 'claim', op: 'win' });
    expect(claimed.white.last('end')).toMatchObject({ result: '1-0', reason: 'abandoned' });
  });

  it('keeps the position in a rematch, the colours swapped; a new game draws another', async () => {
    const { w, drawn } = worldOf(KNR, 700);
    const players = await pairedWith(w, CHESS960);
    await play(players, ['g1h3', 'g8h6']);
    await players.white.send({ t: 'resign' });
    await players.white.send({ t: 'rematch', op: 'offer' });
    await players.black.send({ t: 'rematch', op: 'accept' });
    const next = players.white.last('rematch') as { game: string; seat: string; color: string };
    expect(next.color).toBe('black');
    const white = new Client((s) => w.hub.openRoom(next.game, s));
    await white.send({ t: 'hello', seat: (players.black.last('rematch') as Message).seat });
    expect(snapshot(white)).toMatchObject({
      game: 'chess960',
      you: 'white',
      startFen: chess960StartFen(KNR),
      white: { name: NAME_B },
    });
    expect(drawn).toEqual([KNR]);

    const other = await pairedWith(w, CHESS960);
    expect(snapshot(other.white).startFen).toBe(chess960StartFen(700));
    expect(drawn).toEqual([KNR, 700]);
  });

  it('is watched with its position, and played by correspondence', async () => {
    const { w } = worldOf(KNR);
    const poster = new Client((s) => w.hub.openLobby(s));
    await poster.send({
      t: 'create',
      game: 'chess960',
      tc: '3d',
      color: 'white',
      name: NAME_A,
      rating: 1500,
    });
    const created = poster.last('created') as Message;
    expect(created).toMatchObject({ kind: 'chess960', tc: '3d', color: 'white' });
    const game = created.game as string;
    const visitor = new Client((s) => w.hub.openRoom(game, s));
    await visitor.send({ t: 'hello', watch: true });
    expect(snapshot(visitor)).toMatchObject({
      game: 'chess960',
      open: 'black',
      startFen: chess960StartFen(KNR),
    });
    await visitor.send({ t: 'join', name: NAME_B, rating: null });
    const seat = visitor.last('seat') as Message;
    const black = new Client((s) => w.hub.openRoom(game, s));
    await black.send({ t: 'hello', seat: seat.seat });
    const white = new Client((s) => w.hub.openRoom(game, s));
    await white.send({ t: 'hello', seat: created.seat });
    await play({ white, black }, ['g1h3', 'g8h6', 'f1h1']);
    expect(black.last('move')).toMatchObject({ uci: 'f1h1' });

    // Army Draft is still no correspondence game.
    await poster.send({ t: 'create', game: 'army', tc: '3d', color: 'white', name: NAME_A });
    expect(poster.last('error')).toMatchObject({ code: 'bad-request' });
    // And a Chess960 game over days is no seek either.
    await poster.send(seek({ game: 'chess960', tc: '3d' }));
    expect(poster.last('error')).toMatchObject({ message: /by invitation/ });
  });

  it('carries on from its position when the room wakes up', async () => {
    let stored: RoomState | null = null;
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
      now: () => 5_000_000,
      chess960Position: () => KNR,
    });
    const seats = { white: randomId(32), black: randomId(32) };
    const first = createRoom(platform());
    await first.create({
      id: randomId(16),
      game: 'chess960',
      tc: '5+3',
      white: { name: NAME_A, rating: null, seatHash: await hashToken(seats.white) },
      black: { name: NAME_B, rating: null, seatHash: await hashToken(seats.black) },
    });
    expect(stored).toMatchObject({ position: KNR, startFen: chess960StartFen(KNR) });
    for (const id of ['w', 'b']) {
      sockets.push({
        data: { id, seat: null, openedAt: 5_000_000, rateStart: 0, rateCount: 0 } as never,
        sent: [],
      });
    }
    const [w, b] = platform().connections();
    await first.message(w, JSON.stringify({ t: 'hello', seat: seats.white }));
    await first.message(b, JSON.stringify({ t: 'hello', seat: seats.black }));
    for (const [i, uci] of ['g1h3', 'g8h6'].entries()) {
      await first.message(i % 2 === 0 ? w : b, JSON.stringify({ t: 'move', uci, ply: i }));
    }
    // A new instance replays the moves from the Chess960 start: White castles there.
    const again = createRoom(platform());
    await again.message(w, JSON.stringify({ t: 'move', uci: 'f1h1', ply: 2 }));
    expect(JSON.parse(sockets[1].sent.at(-1)!)).toMatchObject({ t: 'move', uci: 'f1h1' });
  });

  it('makes a game only from a position there is', () => {
    const spec = {
      id: randomId(16),
      game: 'chess960',
      tc: '5+3',
      white: { name: NAME_A, rating: null, seatHash: '' },
      black: { name: NAME_B, rating: null, seatHash: '' },
    };
    expect(newGame({ ...spec, position: CLASSICAL }, 0)).toMatchObject({
      position: CLASSICAL,
      startFen: chess960StartFen(CLASSICAL),
    });
    expect(newGame(spec, 0, () => 12).position).toBe(12);
    // A position that is no number is drawn again, and a draw out of range is refused.
    expect(newGame({ ...spec, position: 960 }, 0, () => 5).position).toBe(5);
    expect(() => newGame(spec, 0, () => 960)).toThrow();
    expect(newGame({ ...spec, game: 'chess' }, 0)).toMatchObject({
      position: null,
      startFen: null,
    });
  });
});

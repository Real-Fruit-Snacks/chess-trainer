/**
 * The stand-in Lichess's Board API (`fakeLichess.ts` routes to it): live
 * games against strangers — seeks, the event stream, a game's stream, and the
 * moves, offers and claims of a game — answering as lila (the Lichess server)
 * does, its source the reference for every rule below; and the controls a
 * test uses to play the opponent.
 *
 * Lila's rules it keeps to:
 * - Every endpoint wants a token with `board:play` (the event stream takes
 *   `challenge:read` too); a game that is not the account's is not found.
 * - Seeks: real time, standard chess, rapid and slower only (the initial time
 *   plus forty increments at least eight minutes: lila's
 *   `isBoardCompatible`); one open seek per account (another is refused with a
 *   429). A seek stays up while its answer is open, and closing the answer
 *   withdraws it; when an opponent takes it, the game starts (a `gameStart` on
 *   the event stream) and the answer ends, empty.
 * - The event stream: one per token (a new one ends the one before); it opens
 *   with a `gameStart` for each game in progress, and says `gameFinish` at
 *   each end.
 * - A game's stream: `gameFull` first; then `gameState` after a move, a draw
 *   offer, a takeback offer or answer, and at the end, after which the stream
 *   ends; `opponentGone`. One per game for the account (a new one ends the one
 *   before). A finished game's stream is its `gameFull`, then the end.
 * - Clocks run from Black's first move, with the increment after each move
 *   from then on. Until both sides have moved, the state carries `expiration`:
 *   30 seconds to move in rapid, 35 in classical.
 * - Abort while fewer than two moves are played; resign after (resigning
 *   earlier aborts). Resigning, or offering a draw, when the other side cannot
 *   mate is a draw (`insufficientMaterialClaim`).
 * - Draw offers: from the second ply, and not within 20 plies of one's last.
 *   An offer stands until the other side declines it or moves (which declines
 *   it); a decline is not sent on the game stream, as lila sends nothing then.
 *   Offering while the other side offers agrees; offering in a threefold
 *   repetition claims the draw.
 * - Takebacks: once both sides have moved, one proposal at a time; accepting
 *   takes back one ply when the proposer moved last, else two (lila's
 *   `Takebacker.acceptedPlies`). A move declines the other side's proposal.
 * - An opponent who leaves (`leave`): `opponentGone` with the seconds until a
 *   claim, again on each new connection to the game and at each `advance`
 *   (lila repeats it every few seconds). Once it is due, the side not to move
 *   may claim victory (status `timeout`; a draw when the claimer cannot mate)
 *   or a draw (`timeout`, no winner).
 * - Ends: checkmate, stalemate, insufficient material and fifty moves (draws)
 *   after a move; a flag (`outoftime`: a draw when the other side cannot mate
 *   or offers a draw); no first move in time (aborted; `noStart` in a
 *   tournament game).
 * - Draw and takeback answers are "ok" even when there was nothing to answer:
 *   lila hands them to the game and does not wait.
 *
 * Time is the stand-in's `clock`, which stands still unless a test moves it
 * (`advance`), or runs with real time after `runClockInRealTime()`.
 *
 * Streams come in two kinds, one for each kind of client:
 * - open (`handle(request, { streams: true })`: the unit tests' `fetch`
 *   stub): the answer carries a `stream` that stays open and gets each line
 *   as it happens, as Lichess's streams do;
 * - long polls (the default, for Playwright routes, which cannot stream): the
 *   answer is the stream's opening lines plus whatever comes within `pollMs`,
 *   and then it ends, like a stream cut short. A seek's answer ends at once,
 *   and the seek lingers as if its answer were still open until it is taken,
 *   posted again (which replaces it) or withdrawn (`withdrawSeeks`): the
 *   stand-in cannot see a long poll's client go away.
 */
import { Chess, type Square } from 'chess.js';
import type { FakeHandleOptions, FakeRequest, FakeResponse } from './fakeLichess';

export type BoardSide = 'white' | 'black';

export type BoardStatus =
  | 'created'
  | 'started'
  | 'aborted'
  | 'mate'
  | 'resign'
  | 'stalemate'
  | 'timeout'
  | 'draw'
  | 'outoftime'
  | 'cheat'
  | 'noStart'
  | 'unknownFinish'
  | 'insufficientMaterialClaim'
  | 'variantEnd';

/** Lila's status ids (`chess.Status`). */
const STATUS_IDS: Record<BoardStatus, number> = {
  created: 10,
  started: 20,
  aborted: 25,
  mate: 30,
  resign: 31,
  stalemate: 32,
  timeout: 33,
  draw: 34,
  outoftime: 35,
  cheat: 36,
  noStart: 37,
  unknownFinish: 38,
  insufficientMaterialClaim: 39,
  variantEnd: 60,
};

export type BoardSource = 'lobby' | 'pool' | 'friend' | 'ai' | 'api' | 'tournament';

type Speed = 'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical';

const PERF_NAMES: Record<Speed, string> = {
  ultraBullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
};

export interface FakeBoardPlayer {
  id: string;
  name: string;
  title: string | null;
  rating: number;
  provisional?: boolean;
}

export interface FakeSeek {
  id: string;
  userId: string;
  /** Minutes. */
  time: number;
  /** Seconds. */
  increment: number;
  rated: boolean;
  color: 'random' | BoardSide;
  postedAt: number;
}

export interface FakeBoardGame {
  id: string;
  source: BoardSource;
  rated: boolean;
  white: FakeBoardPlayer;
  black: FakeBoardPlayer;
  initialMs: number;
  incrementMs: number;
  createdAt: number;
  /** A tournament game: a missing first move loses (`noStart`) instead of aborting. */
  mandatory: boolean;
  /** UCI, castling as the king's two-square move (lila's Board API writes it so). */
  moves: string[];
  status: BoardStatus;
  winner: BoardSide | null;
  /** Each side's time when its clock last stopped (ms). */
  times: Record<BoardSide, number>;
  /** The last move (or the start): the running clock counts from here. */
  movedAt: number;
  drawOffer: Record<BoardSide, boolean>;
  /** The ply of each side's last draw offer: lila refuses another within 20 plies. */
  lastDrawOffer: Record<BoardSide, number | null>;
  /** The ply at which each side proposed a takeback (0: no proposal). */
  takebackAt: Record<BoardSide, number>;
  /** The side that left, and when the other may claim. */
  gone: { side: BoardSide; claimAt: number } | null;
}

/** What the board needs from the rest of the stand-in. */
export interface BoardHost {
  /** Lichess's clock (ms). */
  clock(): number;
  advanceClock(ms: number): void;
  /** The signed-in account. */
  account(): {
    id: string;
    name: string;
    perfs: Record<string, { rating: number; prov?: boolean } | undefined>;
  };
  /** The request's token and its scopes, or null without a token Lichess knows. */
  tokenOf(req: FakeRequest): { token: string; scopes: string[] } | null;
  nextId(prefix: string, length?: number): string;
}

/** Where a streamed answer goes, for a client that reads it as it comes. */
export interface FakeStreamSink {
  write(text: string): void;
  end(): void;
  /** The connection broke (not a clean end). */
  fail(error: Error): void;
}

/** The open end of a streamed answer. */
export interface FakeStream {
  /** Starts the delivery: what was sent so far at once, then each piece as it comes. */
  attach(sink: FakeStreamSink): void;
  /** The client went away (it aborted the request, or cancelled the body). */
  detach(): void;
}

/** One streamed answer, as Lichess holds it open. */
class Pipe implements FakeStream {
  private queued: string[] = [];
  private sink: FakeStreamSink | null = null;
  private wake: (() => void) | null = null;
  private broken = false;
  private readonly cleanups: (() => void)[] = [];
  /** Lichess finished the answer. */
  ended = false;
  /** The client went away. */
  gone = false;

  constructor(
    readonly label: string,
    private readonly registry: Set<Pipe>,
  ) {
    registry.add(this);
  }

  get open(): boolean {
    return !this.ended && !this.gone;
  }

  /** Runs once the answer is over, whichever side ended it. */
  onClose(cleanup: () => void): void {
    if (this.open) this.cleanups.push(cleanup);
    else cleanup();
  }

  /** Sends an object as one line, or (null) a keep-alive blank line. */
  send(value: object | null): void {
    if (!this.open) return;
    const text = value === null ? '\n' : `${JSON.stringify(value)}\n`;
    if (this.sink) this.sink.write(text);
    else this.queued.push(text);
    this.wake?.();
  }

  end(): void {
    if (!this.open) return;
    this.ended = true;
    this.sink?.end();
    this.wake?.();
    this.release();
  }

  /** The connection breaks halfway. */
  drop(): void {
    if (!this.open) return;
    this.ended = true;
    this.broken = true;
    this.sink?.fail(new TypeError('network error'));
    this.wake?.();
    this.release();
  }

  attach(sink: FakeStreamSink): void {
    this.sink = sink;
    for (const text of this.queued.splice(0)) sink.write(text);
    if (this.broken) sink.fail(new TypeError('network error'));
    else if (this.ended) sink.end();
  }

  detach(): void {
    if (this.gone) return;
    this.gone = true;
    this.wake?.();
    this.release();
  }

  private release(): void {
    this.registry.delete(this);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  /**
   * A long poll: the lines sent so far, with whatever comes next within
   * `pollMs`; the client is gone once it has its answer.
   */
  poll(pollMs: number, signal?: AbortSignal): Promise<string> {
    const opening = this.queued.length;
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const answer = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', answer);
        this.wake = null;
        const text = this.queued.splice(0).join('');
        this.detach();
        resolve(text);
      };
      if (!this.open || signal?.aborted) {
        answer();
        return;
      }
      timer = setTimeout(answer, pollMs);
      signal?.addEventListener('abort', answer, { once: true });
      this.wake = () => {
        if (!this.open || this.queued.length > opening) {
          this.wake = null;
          clearTimeout(timer);
          // Whatever else is sent in the same turn goes in the same answer.
          timer = setTimeout(answer, 0);
        }
      };
    });
  }
}

const CORS = { 'access-control-allow-origin': '*' };
const NDJSON_HEADERS = { ...CORS, 'content-type': 'application/x-ndjson' };

const json = (value: unknown, status = 200): FakeResponse => ({
  status,
  headers: { ...CORS, 'content-type': 'application/json' },
  body: JSON.stringify(value),
});
const failure = (status: number, error: string): FakeResponse => json({ error }, status);
/** Lila's answer to a form it cannot take. */
const formError = (message: string): FakeResponse => json({ error: { global: [message] } }, 400);
const OK = json({ ok: true });

type Outcome = { ok: true } | { error: string };
const done: Outcome = { ok: true };

const opposite = (side: BoardSide): BoardSide => (side === 'white' ? 'black' : 'white');

/** Lichess's speed of a clock, from its estimated length (initial + 40 increments). */
function speedOf(initialMs: number, incrementMs: number): Speed {
  const seconds = (initialMs + 40 * incrementMs) / 1000;
  if (seconds < 30) return 'ultraBullet';
  if (seconds < 180) return 'bullet';
  if (seconds < 480) return 'blitz';
  if (seconds < 1500) return 'rapid';
  return 'classical';
}

/** Castling written as the king taking its own rook, which Lichess takes too. */
const KING_TAKES_ROOK: Partial<Record<string, Square>> = {
  e1h1: 'g1',
  e1a1: 'c1',
  e8h8: 'g8',
  e8a8: 'c8',
};

/** Plays a UCI move on `chess`; the move as the stream writes it, or null when it is not legal. */
function playUci(chess: Chess, uci: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const from = uci.slice(0, 2) as Square;
  let to = uci.slice(2, 4) as Square;
  const promotion = uci.slice(4) || undefined;
  const piece = chess.get(from);
  const target = chess.get(to);
  const castle = KING_TAKES_ROOK[uci.slice(0, 4)];
  if (castle && piece?.type === 'k' && target?.type === 'r' && target.color === piece.color) {
    to = castle;
  }
  try {
    const move = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    return `${move.from}${move.to}${move.promotion ?? ''}`;
  } catch {
    return null;
  }
}

export class FakeBoard {
  /** How long a long poll waits for something new (ms). */
  pollMs = 1000;
  /** Who takes the next seek, unless `pairSeek` names someone else. */
  opponent: FakeBoardPlayer = { id: 'stranger', name: 'Stranger', title: null, rating: 1650 };
  readonly games = new Map<string, FakeBoardGame>();
  readonly seeks: FakeSeek[] = [];
  private readonly pipes = new Set<Pipe>();
  /** The event stream of each token. */
  private readonly eventPipes = new Map<string, Pipe>();
  /** The account's stream of each game. */
  private readonly gamePipes = new Map<string, Pipe>();
  /** The open answer that keeps each seek up (none for a long poll's lingering seek). */
  private readonly seekPipes = new Map<string, Pipe>();
  private realSince: number | null = null;

  constructor(private readonly host: BoardHost) {}

  /** Lichess's time now. */
  now(): number {
    return this.host.clock() + (this.realSince === null ? 0 : Date.now() - this.realSince);
  }

  /** Lets Lichess's clock run with real time from now on (end-to-end tests). */
  runClockInRealTime(): void {
    this.realSince ??= Date.now();
  }

  /* ---------------------------------------------------------------- */
  /* Test controls                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * An opponent takes the account's seek (the oldest): the game starts, the
   * event stream says so, and the seek's answer ends.
   */
  pairSeek(
    options: { opponent?: Partial<FakeBoardPlayer>; color?: BoardSide; source?: BoardSource } = {},
  ): FakeBoardGame {
    const seek = this.seeks[0];
    if (!seek) throw new Error('No seek to take.');
    this.removeSeek(seek);
    const color = options.color ?? (seek.color === 'random' ? 'white' : seek.color);
    const game = this.createGame({
      color,
      opponent: options.opponent,
      initialMs: seek.time * 60_000,
      incrementMs: seek.increment * 1000,
      rated: seek.rated,
      source: options.source ?? 'lobby',
    });
    this.announce(game, 'gameStart');
    this.seekPipes.get(seek.id)?.end();
    return game;
  }

  /**
   * A game of the account's that did not come from a seek here: one already
   * in progress (`moves`), a challenge accepted elsewhere (`source: 'friend'`)…
   * The event stream hears of it unless `announce` is false.
   */
  startGame(
    options: {
      color?: BoardSide;
      opponent?: Partial<FakeBoardPlayer>;
      /** "15+10": minutes + seconds. */
      tc?: string;
      rated?: boolean;
      source?: BoardSource;
      moves?: string[];
      mandatory?: boolean;
      announce?: boolean;
    } = {},
  ): FakeBoardGame {
    const [minutes, seconds] = (options.tc ?? '15+10').split('+').map(Number);
    const game = this.createGame({
      color: options.color ?? 'white',
      opponent: options.opponent,
      initialMs: (minutes ?? 15) * 60_000,
      incrementMs: (seconds ?? 0) * 1000,
      rated: options.rated ?? false,
      source: options.source ?? 'lobby',
      mandatory: options.mandatory ?? false,
    });
    const chess = new Chess();
    for (const uci of options.moves ?? []) {
      const played = playUci(chess, uci);
      if (!played) throw new Error(`Not a legal move here: ${uci}`);
      game.moves.push(played);
    }
    if (options.announce !== false) this.announce(game, 'gameStart');
    return game;
  }

  /** The account's opponent in a game, acting as lila lets a player act (each refusal throws). */
  opponentIn(gameId: string) {
    const game = this.game(gameId);
    const side = opposite(this.accountSide(game));
    const act = (outcome: Outcome) => {
      if ('error' in outcome) throw new Error(outcome.error);
    };
    return {
      side,
      move: (uci: string) => {
        // A player who moves is back.
        if (game.gone?.side === side) this.comeBack(gameId);
        act(this.play(game, side, uci));
      },
      /** Offers a draw, or accepts the account's offer. */
      offerDraw: () => act(this.drawYes(game, side)),
      declineDraw: () => act(this.drawNo(game, side)),
      /** Proposes a takeback, or accepts the account's proposal. */
      proposeTakeback: () => act(this.takebackYes(game, side)),
      declineTakeback: () => act(this.takebackNo(game, side)),
      resign: () => act(this.resign(game, side)),
      abort: () => act(this.abort(game, side)),
    };
  }

  /**
   * The account's opponent leaves: the account may claim `claimInSeconds`
   * later. Lila says so only once both sides have moved.
   */
  leave(gameId: string, claimInSeconds = 30): void {
    const game = this.game(gameId);
    if (!this.playable(game)) throw new Error('The game is over.');
    if (game.moves.length < 2) {
      throw new Error('Lila reports a player gone only once both sides have moved.');
    }
    game.gone = {
      side: opposite(this.accountSide(game)),
      claimAt: this.now() + claimInSeconds * 1000,
    };
    this.sendGone(game);
  }

  comeBack(gameId: string): void {
    const game = this.game(gameId);
    if (!game.gone) return;
    game.gone = null;
    this.gamePipes.get(game.id)?.send({ type: 'opponentGone', gone: false });
  }

  /** The side to move runs out of time. */
  flag(gameId: string): void {
    const game = this.game(gameId);
    if (!this.running(game)) throw new Error('The clocks are not running.');
    const side = this.turn(game);
    game.times[side] = 0;
    game.movedAt = this.now();
    this.timeUp(game);
  }

  /** The player who must make a first move has not made it in time. */
  expire(gameId: string): void {
    const game = this.game(gameId);
    if (!this.expirable(game)) throw new Error('This game no longer waits for a first move.');
    const culprit = this.turn(game);
    if (game.mandatory) this.finish(game, 'noStart', opposite(culprit));
    else this.finish(game, 'aborted', null);
  }

  /** Ends a game in any way Lichess may (a cheat detected, an unknown finish…). */
  end(gameId: string, status: BoardStatus, winner: BoardSide | null = null): void {
    this.finish(this.game(gameId), status, winner);
  }

  /** Moves Lichess's clock on; an opponent still gone is announced again, as lila does. */
  advance(ms: number): void {
    this.host.advanceClock(ms);
    for (const game of this.games.values()) if (game.gone) this.sendGone(game);
  }

  /** Lichess's keep-alive blank line on every open stream. */
  keepAlive(): void {
    for (const pipe of this.pipes) pipe.send(null);
  }

  /** Lichess ends open streams (all of them, or those whose label starts with `label`). */
  endStreams(label = ''): void {
    for (const pipe of [...this.pipes]) if (pipe.label.startsWith(label)) pipe.end();
  }

  /** Open streams break halfway, as when a connection drops. */
  dropStreams(label = ''): void {
    for (const pipe of [...this.pipes]) if (pipe.label.startsWith(label)) pipe.drop();
  }

  /** Withdraws every seek, as Lichess does when their answers close. */
  withdrawSeeks(): void {
    for (const seek of [...this.seeks]) {
      this.removeSeek(seek);
      this.seekPipes.get(seek.id)?.end();
    }
  }

  /** The streams Lichess holds open: "events", "seek", "game <id>". */
  openStreams(): string[] {
    return [...this.pipes].filter((pipe) => pipe.open).map((pipe) => pipe.label);
  }

  /* ---------------------------------------------------------------- */
  /* Requests                                                         */
  /* ---------------------------------------------------------------- */

  /** Answers a Board API request; null for any other address. */
  route(
    req: FakeRequest,
    url: URL,
    options: FakeHandleOptions,
  ): Promise<FakeResponse> | FakeResponse | null {
    const { pathname: path } = url;
    const m = req.method;
    let match: RegExpExecArray | null;
    if (m === 'GET' && path === '/api/stream/event') return this.eventStream(req, options);
    if (m === 'POST' && path === '/api/board/seek') return this.seek(req, options);
    if (m === 'GET' && (match = /^\/api\/board\/game\/stream\/(\w+)$/.exec(path))) {
      return this.gameStream(req, match[1] ?? '', options);
    }
    if (m === 'POST' && (match = /^\/api\/board\/game\/(\w+)\/(.+)$/.exec(path))) {
      return this.command(req, match[1] ?? '', match[2] ?? '');
    }
    return null;
  }

  private authorise(
    req: FakeRequest,
    anyOf: readonly string[],
  ): { userId: string; token: string; refusal?: undefined } | { refusal: FakeResponse } {
    const found = this.host.tokenOf(req);
    if (!found) return { refusal: failure(401, 'No such token') };
    if (!anyOf.some((scope) => found.scopes.includes(scope))) {
      return { refusal: failure(403, `Missing scope: ${anyOf[0] ?? ''}`) };
    }
    return { userId: this.host.account().id, token: found.token };
  }

  private answerWith(pipe: Pipe, options: FakeHandleOptions): FakeResponse | Promise<FakeResponse> {
    if (options.streams) return { status: 200, headers: NDJSON_HEADERS, body: '', stream: pipe };
    return pipe
      .poll(this.pollMs, options.signal)
      .then((body) => ({ status: 200, headers: NDJSON_HEADERS, body }));
  }

  private eventStream(req: FakeRequest, options: FakeHandleOptions) {
    const auth = this.authorise(req, ['board:play', 'challenge:read', 'bot:play']);
    if (auth.refusal) return auth.refusal;
    // Lichess keeps one event stream per token: a new one ends the one before.
    this.eventPipes.get(auth.token)?.end();
    const pipe = new Pipe('events', this.pipes);
    this.eventPipes.set(auth.token, pipe);
    pipe.onClose(() => {
      if (this.eventPipes.get(auth.token) === pipe) this.eventPipes.delete(auth.token);
    });
    for (const game of this.games.values()) {
      if (this.playable(game)) pipe.send(this.eventJson(game, 'gameStart'));
    }
    return this.answerWith(pipe, options);
  }

  private seek(req: FakeRequest, options: FakeHandleOptions): FakeResponse {
    const auth = this.authorise(req, ['board:play']);
    if (auth.refusal) return auth.refusal;
    const form = new URLSearchParams(req.body);
    if (form.has('days')) return failure(400, 'The stand-in takes real-time seeks only.');
    const time = Number(form.get('time') ?? '10');
    const increment = Number(form.get('increment') ?? '5');
    if (
      !Number.isFinite(time) ||
      time < 0 ||
      time > 180 ||
      !Number.isInteger(increment) ||
      increment < 0 ||
      increment > 180 ||
      time + increment <= 0
    ) {
      return formError('Invalid clock');
    }
    if ((form.get('variant') ?? 'standard') !== 'standard') {
      return failure(400, 'The stand-in plays standard chess only.');
    }
    const color = form.get('color') ?? 'random';
    if (color !== 'random' && color !== 'white' && color !== 'black') {
      return formError('Invalid color');
    }
    const speed = speedOf(time * 60_000, increment * 1000);
    if (speed !== 'rapid' && speed !== 'classical') return formError('Invalid time control');
    const mine = this.seeks.filter((seek) => seek.userId === auth.userId);
    if (options.streams && mine.some((seek) => this.seekPipes.get(seek.id)?.open)) {
      return {
        status: 429,
        headers: { ...CORS, 'content-type': 'text/plain' },
        body: 'Please only run 1 request(s) at a time',
      };
    }
    // A long poll's seek lingers until it is posted again: the new one replaces it.
    for (const seek of mine) this.removeSeek(seek);
    const seek: FakeSeek = {
      id: this.host.nextId('sk'),
      userId: auth.userId,
      time,
      increment,
      rated: form.get('rated') === 'true',
      color,
      postedAt: this.now(),
    };
    this.seeks.push(seek);
    if (!options.streams) return { status: 200, headers: NDJSON_HEADERS, body: '\n' };
    const pipe = new Pipe('seek', this.pipes);
    this.seekPipes.set(seek.id, pipe);
    // Closing the answer withdraws the seek.
    pipe.onClose(() => {
      this.seekPipes.delete(seek.id);
      this.removeSeek(seek);
    });
    return { status: 200, headers: NDJSON_HEADERS, body: '', stream: pipe };
  }

  private gameStream(req: FakeRequest, id: string, options: FakeHandleOptions) {
    const auth = this.authorise(req, ['board:play']);
    if (auth.refusal) return auth.refusal;
    const found = this.findGame(id);
    if ('refusal' in found) return found.refusal;
    const { game } = found;
    // One stream per game for the account: a new one ends the one before.
    this.gamePipes.get(id)?.end();
    const pipe = new Pipe(`game ${id}`, this.pipes);
    pipe.send(this.fullJson(game));
    if (!this.playable(game)) {
      pipe.end();
    } else {
      this.gamePipes.set(id, pipe);
      pipe.onClose(() => {
        if (this.gamePipes.get(id) === pipe) this.gamePipes.delete(id);
      });
      if (game.gone) this.sendGone(game);
    }
    return this.answerWith(pipe, options);
  }

  private findGame(id: string): { game: FakeBoardGame } | { refusal: FakeResponse } {
    const game = this.games.get(id);
    if (!game) return { refusal: failure(404, 'No such game') };
    if (!this.isAccountGame(game)) return { refusal: failure(404, 'Not your game') };
    if (!this.boardCompatible(game)) {
      return { refusal: failure(400, 'This game cannot be played with the Board API.') };
    }
    return { game };
  }

  private command(req: FakeRequest, id: string, command: string): FakeResponse {
    const auth = this.authorise(req, ['board:play']);
    if (auth.refusal) return auth.refusal;
    const found = this.findGame(id);
    if ('refusal' in found) return found.refusal;
    const { game } = found;
    const side = this.accountSide(game);
    const yes = (value: string) => ['yes', 'true', '1', 'on'].includes(value);
    let match: RegExpExecArray | null;
    let outcome: Outcome;
    if ((match = /^move\/([^/]+)$/.exec(command))) outcome = this.play(game, side, match[1] ?? '');
    else if (command === 'abort') outcome = this.abort(game, side);
    else if (command === 'resign') outcome = this.resign(game, side);
    else if ((match = /^draw\/(\w+)$/.exec(command))) {
      outcome = yes(match[1] ?? '') ? this.drawYes(game, side) : this.drawNo(game, side);
    } else if ((match = /^takeback\/(\w+)$/.exec(command))) {
      outcome = yes(match[1] ?? '') ? this.takebackYes(game, side) : this.takebackNo(game, side);
    } else if (command === 'claim-victory') outcome = this.claimVictory(game, side);
    else if (command === 'claim-draw') outcome = this.claimDraw(game, side);
    else return failure(404, 'No such command');
    return 'error' in outcome ? failure(400, outcome.error) : OK;
  }

  /* ---------------------------------------------------------------- */
  /* The rules                                                        */
  /* ---------------------------------------------------------------- */

  private game(id: string): FakeBoardGame {
    const game = this.games.get(id);
    if (!game) throw new Error(`No game ${id}.`);
    return game;
  }

  private createGame(options: {
    color: BoardSide;
    opponent?: Partial<FakeBoardPlayer> | undefined;
    initialMs: number;
    incrementMs: number;
    rated: boolean;
    source: BoardSource;
    mandatory?: boolean;
  }): FakeBoardGame {
    const speed = speedOf(options.initialMs, options.incrementMs);
    const account = this.host.account();
    const perf = account.perfs[speed];
    const mine: FakeBoardPlayer = {
      id: account.id,
      name: account.name,
      title: null,
      rating: perf?.rating ?? 1500,
      ...(perf?.prov ? { provisional: true } : {}),
    };
    const theirs: FakeBoardPlayer = { ...this.opponent, ...options.opponent };
    const now = this.now();
    const game: FakeBoardGame = {
      id: this.host.nextId('lg'),
      source: options.source,
      rated: options.rated,
      white: options.color === 'white' ? mine : theirs,
      black: options.color === 'white' ? theirs : mine,
      initialMs: options.initialMs,
      incrementMs: options.incrementMs,
      createdAt: now,
      mandatory: options.mandatory ?? false,
      moves: [],
      status: 'started',
      winner: null,
      times: { white: options.initialMs, black: options.initialMs },
      movedAt: now,
      drawOffer: { white: false, black: false },
      lastDrawOffer: { white: null, black: null },
      takebackAt: { white: 0, black: 0 },
      gone: null,
    };
    this.games.set(game.id, game);
    return game;
  }

  private removeSeek(seek: FakeSeek): void {
    const index = this.seeks.indexOf(seek);
    if (index >= 0) this.seeks.splice(index, 1);
  }

  private isAccountGame(game: FakeBoardGame): boolean {
    const id = this.host.account().id;
    return game.white.id === id || game.black.id === id;
  }

  private accountSide(game: FakeBoardGame): BoardSide {
    return game.white.id === this.host.account().id ? 'white' : 'black';
  }

  private speed(game: FakeBoardGame): Speed {
    return speedOf(game.initialMs, game.incrementMs);
  }

  private boardCompatible(game: FakeBoardGame): boolean {
    const speed = this.speed(game);
    return speed === 'rapid' || speed === 'classical';
  }

  private turn(game: FakeBoardGame): BoardSide {
    return game.moves.length % 2 === 0 ? 'white' : 'black';
  }

  private playable(game: FakeBoardGame): boolean {
    return game.status === 'created' || game.status === 'started';
  }

  /** The clocks run from Black's first move. */
  private running(game: FakeBoardGame): boolean {
    return this.playable(game) && game.moves.length >= 2;
  }

  private abortable(game: FakeBoardGame): boolean {
    return game.status === 'started' && game.moves.length < 2 && !game.mandatory;
  }

  private resignable(game: FakeBoardGame): boolean {
    return this.playable(game) && !this.abortable(game);
  }

  private expirable(game: FakeBoardGame): boolean {
    return this.playable(game) && game.moves.length < 2;
  }

  /** Lila's time for a first move (`timeForFirstMove`), in ms. */
  private firstMoveMs(game: FakeBoardGame): number {
    const table: Record<Speed, number> = game.mandatory
      ? { ultraBullet: 11, bullet: 16, blitz: 21, rapid: 25, classical: 30 }
      : { ultraBullet: 15, bullet: 20, blitz: 25, rapid: 30, classical: 35 };
    return table[this.speed(game)] * 1000;
  }

  private remaining(game: FakeBoardGame, side: BoardSide): number {
    const time = game.times[side];
    if (!this.running(game) || this.turn(game) !== side) return time;
    return Math.max(0, time - (this.now() - game.movedAt));
  }

  private position(game: FakeBoardGame): Chess {
    const chess = new Chess();
    for (const uci of game.moves) playUci(chess, uci);
    return chess;
  }

  /** Whether `side` has too little to mate with (lila's rule, simplified to the clear cases). */
  private cannotMate(game: FakeBoardGame, side: BoardSide): boolean {
    const color = side === 'white' ? 'w' : 'b';
    const pieces = this.position(game)
      .board()
      .flat()
      .filter((square) => square !== null);
    const own = pieces.filter((piece) => piece.color === color && piece.type !== 'k');
    const theirs = pieces.filter((piece) => piece.color !== color && piece.type !== 'k');
    if (own.length === 0) return true;
    return own.length === 1 && (own[0]?.type === 'n' || own[0]?.type === 'b') && !theirs.length;
  }

  private canOfferDraw(game: FakeBoardGame, side: BoardSide): boolean {
    const last = game.lastDrawOffer[side];
    return (
      this.playable(game) &&
      game.moves.length >= 2 &&
      !game.drawOffer[side] &&
      !(last !== null && last >= game.moves.length - 20)
    );
  }

  private play(game: FakeBoardGame, side: BoardSide, uci: string): Outcome {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return { error: `Invalid UCI: ${uci}` };
    if (!this.playable(game) || this.turn(game) !== side) {
      return { error: 'Not your turn, or game already over' };
    }
    const chess = this.position(game);
    const played = playUci(chess, uci);
    if (!played) return { error: `Piece on ${uci.slice(0, 2)} cannot move to ${uci.slice(2, 4)}` };
    const now = this.now();
    if (this.running(game)) {
      const left = game.times[side] - (now - game.movedAt);
      if (left <= 0) {
        // The flag fell before the move arrived.
        game.times[side] = 0;
        this.timeUp(game);
        return { error: 'Not your turn, or game already over' };
      }
      game.times[side] = left + game.incrementMs;
    }
    game.moves.push(played);
    game.movedAt = now;
    if (chess.isCheckmate()) this.finish(game, 'mate', side);
    else if (chess.isStalemate()) this.finish(game, 'stalemate', null);
    else if (chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) {
      this.finish(game, 'draw', null);
    } else {
      this.pushState(game);
      // The mover declines what the other side offered (lila's MovePlayer): a
      // draw quietly, a takeback with a new state.
      const other = opposite(side);
      game.drawOffer[other] = false;
      if (game.takebackAt[other] > 0) {
        game.takebackAt[other] = 0;
        this.pushState(game);
      }
    }
    return done;
  }

  private abort(game: FakeBoardGame, _side: BoardSide): Outcome {
    if (!this.abortable(game)) return { error: 'This game can no longer be aborted' };
    this.finish(game, 'aborted', null);
    return done;
  }

  private resign(game: FakeBoardGame, side: BoardSide): Outcome {
    if (this.abortable(game)) return this.abort(game, side);
    if (!this.resignable(game)) return { error: 'This game cannot be resigned' };
    const other = opposite(side);
    if (this.cannotMate(game, other)) this.finish(game, 'insufficientMaterialClaim', null);
    else this.finish(game, 'resign', other);
    return done;
  }

  private drawYes(game: FakeBoardGame, side: BoardSide): Outcome {
    if (!this.resignable(game)) return done;
    const other = opposite(side);
    if (this.position(game).isThreefoldRepetition() || game.drawOffer[other]) {
      this.finish(game, 'draw', null);
    } else if (this.canOfferDraw(game, side)) {
      if (this.cannotMate(game, other)) {
        this.finish(game, 'insufficientMaterialClaim', null);
      } else {
        game.drawOffer[side] = true;
        game.lastDrawOffer[side] = game.moves.length;
        this.pushState(game);
      }
    }
    return done;
  }

  private drawNo(game: FakeBoardGame, side: BoardSide): Outcome {
    // Declined quietly: lila sends nothing on the game stream for it.
    if (this.resignable(game)) game.drawOffer[opposite(side)] = false;
    return done;
  }

  private takebackYes(game: FakeBoardGame, side: BoardSide): Outcome {
    if (!this.playable(game) || game.mandatory) return done;
    const other = opposite(side);
    const proposedAt = game.takebackAt[other];
    if (proposedAt > 0) {
      // Lila's `acceptedPlies`: one ply when the proposer moved last, two when it was to move.
      const accepterToMove = (proposedAt % 2 === 0 ? 'white' : 'black') === side;
      const plies = Math.min(
        game.moves.length,
        Math.max(1, game.moves.length - proposedAt + (accepterToMove ? 1 : 2)),
      );
      game.moves.splice(game.moves.length - plies, plies);
      game.takebackAt = { white: 0, black: 0 };
      game.movedAt = this.now();
      this.pushState(game);
    } else if (game.moves.length >= 2 && game.takebackAt[side] === 0) {
      game.takebackAt[side] = game.moves.length;
      this.pushState(game);
    }
    return done;
  }

  private takebackNo(game: FakeBoardGame, side: BoardSide): Outcome {
    if (!this.playable(game) || game.mandatory) return done;
    const other = opposite(side);
    // One's own proposal is withdrawn; else the other side's is declined.
    const whose = game.takebackAt[side] > 0 ? side : game.takebackAt[other] > 0 ? other : null;
    if (whose) {
      game.takebackAt[whose] = 0;
      this.pushState(game);
    }
    return done;
  }

  private longGone(game: FakeBoardGame, side: BoardSide): boolean {
    return game.gone?.side === side && this.now() >= game.gone.claimAt;
  }

  private claimVictory(game: FakeBoardGame, side: BoardSide): Outcome {
    if (!this.resignable(game) || this.turn(game) === side) {
      return { error: 'This is not the time to claim victory' };
    }
    if (!this.longGone(game, opposite(side))) {
      return { error: 'You cannot claim victory in this game' };
    }
    this.finish(game, 'timeout', this.cannotMate(game, side) ? null : side);
    return done;
  }

  private claimDraw(game: FakeBoardGame, side: BoardSide): Outcome {
    if (!this.resignable(game)) return { error: 'This is not the time to claim draw' };
    if (this.turn(game) === side || !this.longGone(game, opposite(side))) {
      return { error: 'You cannot claim draw in this game' };
    }
    this.finish(game, 'timeout', null);
    return done;
  }

  /** The side to move has run out of time (lila's `Finisher.outOfTime`). */
  private timeUp(game: FakeBoardGame): void {
    const other = opposite(this.turn(game));
    if (game.drawOffer[other]) this.finish(game, 'draw', null);
    else this.finish(game, 'outoftime', this.cannotMate(game, other) ? null : other);
  }

  private finish(game: FakeBoardGame, status: BoardStatus, winner: BoardSide | null): void {
    if (!this.playable(game)) return;
    // The clocks stop where they are.
    const side = this.turn(game);
    game.times[side] = this.remaining(game, side);
    game.status = status;
    game.winner = winner;
    game.gone = null;
    this.pushState(game);
    this.gamePipes.get(game.id)?.end();
    this.announce(game, 'gameFinish');
  }

  /* ---------------------------------------------------------------- */
  /* What Lichess sends                                               */
  /* ---------------------------------------------------------------- */

  private pushState(game: FakeBoardGame): void {
    this.gamePipes.get(game.id)?.send(this.stateJson(game));
  }

  private announce(game: FakeBoardGame, type: 'gameStart' | 'gameFinish'): void {
    for (const pipe of this.eventPipes.values()) pipe.send(this.eventJson(game, type));
  }

  private sendGone(game: FakeBoardGame): void {
    if (!game.gone) return;
    this.gamePipes.get(game.id)?.send({
      type: 'opponentGone',
      gone: true,
      claimWinInSeconds: Math.max(0, Math.ceil((game.gone.claimAt - this.now()) / 1000)),
    });
  }

  private stateJson(game: FakeBoardGame): Record<string, unknown> {
    const state: Record<string, unknown> = {
      type: 'gameState',
      moves: game.moves.join(' '),
      wtime: this.remaining(game, 'white'),
      btime: this.remaining(game, 'black'),
      winc: game.incrementMs,
      binc: game.incrementMs,
      status: game.status,
    };
    if (game.drawOffer.white) state.wdraw = true;
    if (game.drawOffer.black) state.bdraw = true;
    if (game.takebackAt.white > 0) state.wtakeback = true;
    if (game.takebackAt.black > 0) state.btakeback = true;
    if (game.winner) state.winner = game.winner;
    if (this.expirable(game)) {
      state.expiration = {
        idleMillis: this.now() - game.movedAt,
        millisToMove: this.firstMoveMs(game),
      };
    }
    return state;
  }

  private fullJson(game: FakeBoardGame): Record<string, unknown> {
    const speed = this.speed(game);
    const player = (p: FakeBoardPlayer) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      rating: p.rating,
      ...(p.provisional ? { provisional: true } : {}),
    });
    return {
      id: game.id,
      variant: { key: 'standard', name: 'Standard', short: 'Std' },
      speed,
      perf: { name: PERF_NAMES[speed] },
      rated: game.rated,
      createdAt: game.createdAt,
      white: player(game.white),
      black: player(game.black),
      initialFen: 'startpos',
      clock: { initial: game.initialMs, increment: game.incrementMs },
      type: 'gameFull',
      state: this.stateJson(game),
    };
  }

  /** A `gameStart` or `gameFinish` event, as the account sees the game. */
  private eventJson(game: FakeBoardGame, type: 'gameStart' | 'gameFinish') {
    const side = this.accountSide(game);
    const opponent = game[opposite(side)];
    const speed = this.speed(game);
    const playedBySide =
      side === 'white' ? Math.ceil(game.moves.length / 2) : Math.floor(game.moves.length / 2);
    return {
      type,
      game: {
        fullId: `${game.id}${side === 'white' ? 'wxyz' : 'bxyz'}`,
        gameId: game.id,
        fen: this.position(game).fen(),
        color: side,
        lastMove: game.moves.at(-1) ?? '',
        source: game.source,
        status: { id: STATUS_IDS[game.status], name: game.status },
        variant: { key: 'standard', name: 'Standard' },
        speed,
        perf: speed,
        rated: game.rated,
        hasMoved: playedBySide > 0,
        // Lila writes a titled opponent's name with the title ("GM Name").
        opponent: {
          id: opponent.id,
          username: opponent.title ? `${opponent.title} ${opponent.name}` : opponent.name,
          rating: opponent.rating,
        },
        isMyTurn: this.playable(game) && this.turn(game) === side,
        secondsLeft: Math.floor(this.remaining(game, side) / 1000),
        ...(game.winner ? { winner: game.winner } : {}),
        compat: { bot: false, board: this.boardCompatible(game) },
        id: game.id,
      },
    };
  }
}

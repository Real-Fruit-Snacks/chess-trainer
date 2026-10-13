/**
 * The duels' own rules, free of any room: what a round's content may be (the
 * host's device sends it, and the other player's device takes it from the
 * relay, so it is checked here first), what a player may report, how a round
 * and a whole duel are decided, and Who Stands Better?'s scoring. The app
 * imports this file too (see duelRules.d.mts), so the two always agree.
 *
 * Content is chess only — positions, moves in UCI, ratings, ids — never words:
 * nothing either player's device sends ever reaches the other as text. The
 * classic game an Arbiter round or a Who Stands Better? position comes from is
 * one of the app's own (`CLASSIC_GAME_IDS`), never a name the host made up.
 */
import { Chess, validateFen } from 'chess.js';
import { ARBITER_KINDS, DUEL_RULES } from './shared.mjs';
import { playUci } from './rules.mjs';

/**
 * @typedef {'white' | 'black'} Seat
 * @typedef {{ id: string, fen: string, moves: string, rating: number }} RacePuzzle
 * @typedef {{
 *   fen: string,
 *   ply: number,
 *   lead: string[],
 *   illegal: { from: string, to: string, kind: string, promotion?: string },
 *   game: string,
 * }} ArbiterItem
 * @typedef {{ fen: string, cp: number, game: string, ply: number }} JudgeItem
 * @typedef {{ ok: boolean, ms: number }} RaceResult
 * @typedef {{ call: 'caught' | 'false' | 'missed', ms: number }} ArbiterResult
 * @typedef {{ guess: number }} JudgeResult
 * @typedef {RaceResult | ArbiterResult | JudgeResult} DuelResult
 * @typedef {{ white: number, black: number }} Points
 * @typedef {{ winner: Seat | 'shared' | null, points: Points }} RoundOutcome
 */

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const SQUARE = /^[a-h][1-8]$/;
const PUZZLE_ID = /^[A-Za-z0-9]{3,12}$/;

/**
 * The classic games a duel's round may come from: the ids of the app's own
 * (src/features/classics), which its Arbiter rounds and Who Stands Better?
 * positions are made from. The app's tests keep every one of them here; an id
 * stays even once its game has left the app, for the devices that still have it.
 * A new classic game reaches duels once the relay has its id.
 */
export const CLASSIC_GAME_IDS = Object.freeze([
  'opera-game',
  'immortal-game',
  'evergreen-game',
  'rotlewi-rubinstein',
  'lasker-bauer',
  'steinitz-bardeleben',
  'reti-tartakower',
  'byrne-fischer',
  'botvinnik-capablanca',
  'karpov-kasparov-1985',
  'kasparov-topalov',
  'capablanca-marshall',
  'lasker-capablanca-1914',
  'short-timman',
  'fischer-spassky-1972-6',
  'lasker-thomas',
  'levitsky-marshall',
  'reti-bogoljubov',
  'bernstein-capablanca',
  'nimzowitsch-samisch',
  'adams-torre',
  'alekhine-nimzowitsch',
  'paulsen-morphy',
  'zukertort-blackburne',
  'spassky-bronstein',
  'fischer-robert-byrne',
  'fischer-benko',
  'botvinnik-portisch',
  'petrosian-spassky-1966',
  'deep-blue-kasparov',
  'legall-saint-brie',
  'mcdonnell-la-bourdonnais',
  'steinitz-mongredien',
  'hamppe-meitner',
  'rubinstein-lasker-1909',
  'roesch-schlage',
  'nimzowitsch-alapin',
  'reti-capablanca-1924',
  'capablanca-tartakower-1924',
  'reti-alekhine-1925',
  'torre-lasker-1925',
  'glucksberg-najdorf',
  'canal-peruvian-immortal',
  'fischer-reshevsky-1958',
  'botvinnik-tal-1960',
  'karpov-unzicker-1974',
]);

const CLASSIC_GAMES = new Set(CLASSIC_GAME_IDS);

/** One of the classic games a round may come from. @param {unknown} id @returns {id is string} */
const isClassicGame = (id) => typeof id === 'string' && CLASSIC_GAMES.has(id);

/** The longest moment a player may report, beyond any round's own limit. */
const MAX_REPORT_MS = 10 * 60_000;

/** @param {unknown} value */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A position, or null: a FEN of a normal length that chess.js takes.
 * @param {unknown} fen
 * @returns {Chess | null}
 */
function position(fen) {
  if (typeof fen !== 'string' || fen.length < 20 || fen.length > 100) return null;
  if (!validateFen(fen).ok) return null;
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/**
 * `moves` played from `fen`: each legal in turn. False when one is not.
 * @param {string} fen @param {readonly string[]} moves
 */
function legalLine(fen, moves) {
  const chess = position(fen);
  if (!chess) return false;
  return moves.every((uci) => UCI.test(uci) && playUci(chess, uci) !== null);
}

/** @param {unknown} n @param {number} min @param {number} max */
const wholeIn = (n, min, max) =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** @param {unknown} value @returns {RacePuzzle | null} */
function racePuzzle(value) {
  if (!isObject(value)) return null;
  const { id, fen, moves, rating } = /** @type {Record<string, unknown>} */ (value);
  if (typeof id !== 'string' || !PUZZLE_ID.test(id)) return null;
  if (typeof moves !== 'string' || !wholeIn(rating, 100, 3500)) return null;
  const line = moves.split(' ');
  if (line.length < 2 || line.length > 24) return null;
  if (typeof fen !== 'string' || !legalLine(fen, line)) return null;
  return { id, fen, moves: line.join(' '), rating: /** @type {number} */ (rating) };
}

/** @param {unknown} value @returns {ArbiterItem | null} */
function arbiterItem(value) {
  if (!isObject(value)) return null;
  const { fen, ply, lead, illegal, game } = /** @type {Record<string, unknown>} */ (value);
  if (!wholeIn(ply, 0, 600) || !isClassicGame(game)) return null;
  if (!Array.isArray(lead) || lead.length < 1 || lead.length > 8) return null;
  if (!lead.every((m) => typeof m === 'string')) return null;
  if (typeof fen !== 'string' || !legalLine(fen, /** @type {string[]} */ (lead))) return null;
  if (!isObject(illegal)) return null;
  const { from, to, kind, promotion } = /** @type {Record<string, unknown>} */ (illegal);
  if (typeof from !== 'string' || !SQUARE.test(from)) return null;
  if (typeof to !== 'string' || !SQUARE.test(to)) return null;
  if (typeof kind !== 'string' || !ARBITER_KINDS.includes(kind)) return null;
  if (promotion !== undefined && (typeof promotion !== 'string' || !/^[qrbn]$/.test(promotion))) {
    return null;
  }
  return {
    fen,
    ply: /** @type {number} */ (ply),
    lead: [.../** @type {string[]} */ (lead)],
    illegal: { from, to, kind, ...(promotion ? { promotion } : {}) },
    game,
  };
}

/** @param {unknown} value @returns {JudgeItem | null} */
function judgeItem(value) {
  if (!isObject(value)) return null;
  const { fen, cp, game, ply } = /** @type {Record<string, unknown>} */ (value);
  if (!wholeIn(cp, -5000, 5000) || !wholeIn(ply, 0, 600)) return null;
  if (!isClassicGame(game) || !position(fen)) return null;
  return {
    fen: /** @type {string} */ (fen),
    cp: /** @type {number} */ (cp),
    game,
    ply: /** @type {number} */ (ply),
  };
}

/**
 * The rounds of a duel as the host's device sent them, checked and with
 * nothing else in them; null when anything is wrong (or there are too few or
 * too many).
 * @param {string} game
 * @param {Record<string, unknown>} opts
 * @param {unknown} items
 * @returns {RacePuzzle[] | ArbiterItem[] | JudgeItem[] | null}
 */
export function duelContent(game, opts, items) {
  if (!Array.isArray(items)) return null;
  /** @type {(value: unknown) => unknown} */
  let read;
  let min;
  let max;
  if (game === 'race') {
    read = racePuzzle;
    const timed = opts.format === 'timed';
    min = timed ? DUEL_RULES.race.timedMin : DUEL_RULES.race.rounds;
    max = timed ? DUEL_RULES.race.timedMax : DUEL_RULES.race.rounds;
  } else if (game === 'arbiter') {
    read = arbiterItem;
    min = max = DUEL_RULES.arbiter.rounds;
  } else if (game === 'judge') {
    read = judgeItem;
    min = max = DUEL_RULES.judge.rounds;
  } else {
    return null;
  }
  if (items.length < min || items.length > max) return null;
  const checked = items.map(read);
  if (checked.some((item) => item === null)) return null;
  // Puzzles are not repeated within a race.
  if (game === 'race') {
    const ids = new Set(checked.map((p) => /** @type {RacePuzzle} */ (p).id));
    if (ids.size !== checked.length) return null;
  }
  return /** @type {RacePuzzle[] | ArbiterItem[] | JudgeItem[]} */ (checked);
}

/** @param {unknown} ms */
const reportMs = (ms) =>
  typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= MAX_REPORT_MS
    ? Math.round(ms)
    : null;

/**
 * A round's result as a player reports it, checked; null when it is not one.
 * (A timed race reports each puzzle with its index: see `timedReport`.)
 * @param {string} game
 * @param {Record<string, unknown>} msg
 * @returns {DuelResult | null}
 */
export function duelReport(game, msg) {
  if (game === 'race') {
    const ms = reportMs(msg.ms);
    return typeof msg.ok === 'boolean' && ms !== null ? { ok: msg.ok, ms } : null;
  }
  if (game === 'arbiter') {
    const ms = reportMs(msg.ms);
    const call = msg.call;
    return (call === 'caught' || call === 'false' || call === 'missed') && ms !== null
      ? { call, ms }
      : null;
  }
  if (game === 'judge') {
    return typeof msg.guess === 'number' && Number.isFinite(msg.guess)
      ? { guess: toScale(msg.guess * 100) }
      : null;
  }
  return null;
}

/**
 * One puzzle of a timed race as a player reports it: its index in the race,
 * whether it was solved, and how long it took.
 * @param {Record<string, unknown>} msg
 * @returns {{ index: number, ok: boolean, ms: number } | null}
 */
export function timedReport(msg) {
  const ms = reportMs(msg.ms);
  if (!wholeIn(msg.index, 0, DUEL_RULES.race.timedMax) || typeof msg.ok !== 'boolean') return null;
  return ms === null ? null : { index: /** @type {number} */ (msg.index), ok: msg.ok, ms };
}

/**
 * What the other player sees of a result while the round is still on: a race's
 * and Arbiter's at once (the other then knows the time to beat), a judgement's
 * only that it is in.
 * @param {string} game
 * @param {DuelResult} result
 */
export function publicResult(game, result) {
  return game === 'judge' ? { locked: true } : result;
}

/* ------------------------------------------------------------------ */
/* Who Stands Better?                                                  */
/* ------------------------------------------------------------------ */

/** The guesses' scale: pawns, from -5 (Black winning) to +5 (White winning), in tenths. */
export const SCALE_MAX = 5;
/** Within this many pawns of the engine is spot on. */
export const SPOT_ON = 0.3;
/** Within this many pawns is close. */
export const CLOSE = 1;
/** Points lost per pawn of error. */
export const POINTS_PER_PAWN = 30;
/** Evaluations closer to zero than this are equal: neither side stands better. */
export const EQUAL_BAND = 0.3;

/** Rounds to tenths, without floating-point dust (0.30000000000000004). @param {number} value */
const tenths = (value) => Math.round(value * 10) / 10;

/** Centipawns as pawns on the scale (tenths, at most ±SCALE_MAX). @param {number} cp */
export function toScale(cp) {
  return Math.max(-SCALE_MAX, Math.min(SCALE_MAX, tenths(cp / 100)));
}

/** @param {number} value @returns {-1 | 0 | 1} */
function side(value) {
  if (value >= EQUAL_BAND) return 1;
  if (value <= -EQUAL_BAND) return -1;
  return 0;
}

/**
 * Points for a guess: 100 when exact, POINTS_PER_PAWN fewer per pawn of
 * error, and nothing at all for calling the wrong side better.
 * @param {number} guess
 * @param {number} cp
 * @returns {{ points: number, verdict: 'spot on' | 'close' | 'right side' | 'wrong side', truth: number }}
 */
export function judgeGuess(guess, cp) {
  const truth = toScale(cp);
  const diff = tenths(Math.abs(guess - truth));
  if (side(guess) !== 0 && side(truth) !== 0 && side(guess) !== side(truth)) {
    return { points: 0, verdict: 'wrong side', truth };
  }
  const points = Math.max(0, Math.round(100 - diff * POINTS_PER_PAWN));
  const verdict = diff <= SPOT_ON ? 'spot on' : diff <= CLOSE ? 'close' : 'right side';
  return { points, verdict, truth };
}

/* ------------------------------------------------------------------ */
/* Deciding rounds and duels                                          */
/* ------------------------------------------------------------------ */

/** @param {number} white @param {number} black @returns {RoundOutcome} */
const outcome = (white, black) => ({
  winner: white > black ? 'white' : black > white ? 'black' : white > 0 ? 'shared' : null,
  points: { white, black },
});

/**
 * A round of a race (best3 or window): the clean solve wins it, the faster of
 * two clean solves (in window, two within 15 seconds share it, half a point
 * each); nobody scores when neither solved.
 * @param {string} format
 * @param {RaceResult | null} white
 * @param {RaceResult | null} black
 * @returns {RoundOutcome}
 */
export function raceRound(format, white, black) {
  const w = white?.ok ? white.ms : null;
  const b = black?.ok ? black.ms : null;
  if (w === null && b === null) return outcome(0, 0);
  if (w === null) return outcome(0, 1);
  if (b === null) return outcome(1, 0);
  if (w === b || (format === 'window' && Math.abs(w - b) <= DUEL_RULES.race.windowMs)) {
    return outcome(0.5, 0.5);
  }
  return w < b ? outcome(1, 0) : outcome(0, 1);
}

/**
 * A round of Arbiter: the quicker of the calls on the illegal move wins it; a
 * call on a legal move, or none, scores nothing.
 * @param {ArbiterResult | null} white
 * @param {ArbiterResult | null} black
 * @returns {RoundOutcome}
 */
export function arbiterRound(white, black) {
  const w = white?.call === 'caught' ? white.ms : null;
  const b = black?.call === 'caught' ? black.ms : null;
  if (w === null && b === null) return outcome(0, 0);
  if (w === null) return outcome(0, 1);
  if (b === null) return outcome(1, 0);
  if (w === b) return outcome(0.5, 0.5);
  return w < b ? outcome(1, 0) : outcome(0, 1);
}

/**
 * A position of Who Stands Better?: each guess scores its points (none
 * without a guess); the round goes to the higher score.
 * @param {JudgeResult | null} white
 * @param {JudgeResult | null} black
 * @param {number} cp
 * @returns {RoundOutcome}
 */
export function judgeRound(white, black, cp) {
  const w = white ? judgeGuess(white.guess, cp).points : 0;
  const b = black ? judgeGuess(black.guess, cp).points : 0;
  return outcome(w, b);
}

/**
 * Whether a duel of rounds is over, and how: after `played` rounds with
 * `score`, and `left` rounds of content still unplayed. A race (best3, window)
 * goes to the first to two points, Arbiter to the first to three — both at
 * once is a draw — or, once the rounds run out, to the higher score; Who
 * Stands Better? to the higher total after its five positions.
 * @param {string} game
 * @param {Points} score
 * @param {number} played
 * @param {number} left
 * @returns {'1-0' | '0-1' | '1/2-1/2' | null}
 */
export function duelResult(game, score, played, left) {
  const higher = () =>
    score.white > score.black ? '1-0' : score.black > score.white ? '0-1' : '1/2-1/2';
  if (game === 'judge') return played >= DUEL_RULES.judge.rounds || left === 0 ? higher() : null;
  const rules = game === 'race' ? DUEL_RULES.race : DUEL_RULES.arbiter;
  const whiteIn = score.white >= rules.target;
  const blackIn = score.black >= rules.target;
  if (whiteIn || blackIn) return whiteIn && blackIn ? '1/2-1/2' : whiteIn ? '1-0' : '0-1';
  if (played >= rules.rounds || left === 0) return higher();
  return null;
}

/**
 * A timed race's result: more puzzles solved wins; with as many, fewer strikes;
 * then a draw.
 * @param {{ solved: number, strikes: number }} white
 * @param {{ solved: number, strikes: number }} black
 * @returns {'1-0' | '0-1' | '1/2-1/2'}
 */
export function timedResult(white, black) {
  if (white.solved !== black.solved) return white.solved > black.solved ? '1-0' : '0-1';
  if (white.strikes !== black.strikes) return white.strikes < black.strikes ? '1-0' : '0-1';
  return '1/2-1/2';
}

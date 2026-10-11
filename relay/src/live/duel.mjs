/**
 * The duels of the relay's game rooms (room.mjs runs them): a puzzle race,
 * Arbiter and Who Stands Better?, played in rounds the room times and scores.
 *
 * The poster's device (the host, in the white seat) sends every round's
 * content once both players are paired (`content`): puzzles, replays,
 * positions — chess only, checked by duelRules.mjs. Once the content is in and
 * both players are here, the rounds run by the room's clock: a countdown, the
 * round itself (each device shows it at the same moment and reports how it
 * went: a solve and its time, a call, a judgement), then its result for a few
 * seconds, and the next countdown. A timed race is one long round in which each
 * player goes through the same puzzles at their own pace.
 *
 * Times are measured on each player's device (a solve takes as long as it took
 * there, whatever the network adds), and the room decides: it is the referee of
 * who did what first, and of when a round is over.
 */
import {
  arbiterRound,
  duelContent,
  duelReport,
  duelResult,
  judgeRound,
  publicResult,
  raceRound,
  timedReport,
  timedResult,
} from './duelRules.mjs';
import { DUEL_RULES } from './shared.mjs';

/**
 * @typedef {'white' | 'black'} Seat
 * @typedef {import('./duelRules.mjs').DuelResult} DuelResult
 * @typedef {{ name: string, rating: number | null, seatHash: string }} SeatSpec
 * @typedef {{ index: number, solved: number, strikes: number, done: boolean }} Progress
 * @typedef {{
 *   round: number,
 *   results: { white: DuelResult | null, black: DuelResult | null },
 *   winner: Seat | 'shared' | null,
 *   points: { white: number, black: number },
 * }} RoundRecord
 *
 * @typedef {{
 *   v: 2,
 *   id: string,
 *   createdAt: number,
 *   game: 'race' | 'arbiter' | 'judge',
 *   opts: Record<string, string | number>,
 *   tc: null,
 *   white: SeatSpec,
 *   black: SeatSpec,
 *   status: 'setup' | 'playing' | 'over',
 *   setupBy: number | null,
 *   items: unknown[] | null,
 *   round: number,
 *   phase: 'countdown' | 'live' | 'reveal' | null,
 *   phaseEndsAt: number | null,
 *   liveSince: number | null,
 *   results: { white: DuelResult | null, black: DuelResult | null },
 *   rounds: RoundRecord[],
 *   score: { white: number, black: number },
 *   progress: { white: Progress, black: Progress } | null,
 *   result: '1-0' | '0-1' | '1/2-1/2' | '*' | null,
 *   reason: string | null,
 *   endedAt: number | null,
 *   offers: { draw: null, takeback: null, rematch: Seat | null },
 *   goneSince: { white: number | null, black: number | null },
 *   chat: { by: Seat, phrase: string }[],
 *   lastPhraseAt: { white: number, black: number },
 *   next: { id: string, seats: { white: string, black: string } } | null,
 * }} DuelState
 *
 * @typedef {{
 *   tell(make: (seat: Seat) => unknown): void,
 *   refuse(conn: unknown, seat: Seat, code: string, message: string): void,
 *   present(): { white: boolean, black: boolean },
 * }} DuelContext
 */

/** @param {Seat} seat @returns {Seat} */
const other = (seat) => (seat === 'white' ? 'black' : 'white');

/** @returns {Progress} */
const fresh = () => ({ index: 0, solved: 0, strikes: 0, done: false });

/** A race against the clock (rather than one of rounds). @param {DuelState} s */
export const isTimed = (s) => s.game === 'race' && s.opts.format === 'timed';

/** After a timed race's three minutes, the last reports in flight may still come this long. */
const TIMED_GRACE_MS = 2000;

/**
 * A new duel, waiting for the host's content and both players.
 * @param {import('./lobby.mjs').GameSpec} spec
 * @param {number} now
 * @returns {DuelState}
 */
export function newDuel(spec, now) {
  const game = /** @type {DuelState['game']} */ (spec.game);
  const opts = spec.opts ?? {};
  const timed = game === 'race' && opts.format === 'timed';
  return {
    v: 2,
    id: spec.id,
    createdAt: now,
    game,
    opts,
    tc: null,
    white: spec.white,
    black: spec.black,
    status: 'setup',
    setupBy: now + DUEL_RULES.setupMs,
    items: null,
    round: 0,
    phase: null,
    phaseEndsAt: null,
    liveSince: null,
    results: { white: null, black: null },
    rounds: [],
    score: { white: 0, black: 0 },
    progress: timed ? { white: fresh(), black: fresh() } : null,
    result: null,
    reason: null,
    endedAt: null,
    offers: { draw: null, takeback: null, rematch: null },
    goneSince: { white: null, black: null },
    chat: [],
    lastPhraseAt: { white: 0, black: 0 },
    next: null,
  };
}

/**
 * What a player is told of the duel (the rest of the snapshot is the room's).
 * The other player's result in the round on shows as `publicResult` has it.
 * @param {DuelState} s
 * @param {Seat} you
 * @param {number} now
 */
export function duelView(s, you, now) {
  const theirs = s.results[other(you)];
  return {
    game: s.game,
    opts: s.opts,
    host: you === 'white',
    status: s.status,
    setupIn: s.status === 'setup' && s.setupBy !== null ? Math.max(0, s.setupBy - now) : null,
    items: s.items,
    round: s.round,
    phase: s.phase,
    phaseIn: s.phaseEndsAt !== null ? Math.max(0, s.phaseEndsAt - now) : null,
    liveFor: s.liveSince !== null ? Math.max(0, now - s.liveSince) : null,
    mine: s.results[you],
    theirs: theirs ? publicResult(s.game, theirs) : null,
    rounds: s.rounds,
    score: s.score,
    progress: s.progress,
  };
}

/** The moment the duel needs the room's attention next, or null. @param {DuelState} s */
export function duelDeadline(s) {
  if (s.status === 'setup') return s.setupBy;
  if (s.status === 'playing') return s.phaseEndsAt;
  return null;
}

/**
 * Ends the duel: `result` is the white seat's (the host's) side of it.
 * @param {DuelContext} ctx
 * @param {DuelState} s
 * @param {DuelState['result']} result
 * @param {string} reason
 * @param {number} now
 */
export function endDuel(ctx, s, result, reason, now) {
  s.status = 'over';
  s.result = result;
  s.reason = reason;
  s.endedAt = now;
  s.setupBy = null;
  s.phase = null;
  s.phaseEndsAt = null;
  s.offers = { draw: null, takeback: null, rematch: null };
  s.goneSince = { white: null, black: null };
  ctx.tell(() => ({ t: 'end', result, reason, score: s.score, progress: s.progress }));
}

/** @param {DuelContext} ctx @param {DuelState} s @param {number} round @param {number} now */
function countdown(ctx, s, round, now) {
  s.round = round;
  s.phase = 'countdown';
  s.phaseEndsAt = now + DUEL_RULES.countdownMs;
  s.liveSince = null;
  s.results = { white: null, black: null };
  ctx.tell(() => ({ t: 'round', round, phase: 'countdown', inMs: DUEL_RULES.countdownMs }));
}

/** @param {DuelContext} ctx @param {DuelState} s @param {number} now */
function goLive(ctx, s, now) {
  s.phase = 'live';
  s.liveSince = now;
  const timed = isTimed(s);
  const roundMs = timed
    ? DUEL_RULES.race.timedMs
    : s.game === 'race'
      ? DUEL_RULES.race.roundMs
      : s.game === 'arbiter'
        ? DUEL_RULES.arbiter.roundMs
        : DUEL_RULES.judge.roundMs;
  s.phaseEndsAt = now + roundMs + (timed ? TIMED_GRACE_MS : 0);
  ctx.tell(() => ({ t: 'round', round: s.round, phase: 'live', inMs: roundMs }));
}

/**
 * The duel starts once its content is in and both players are here.
 * @param {DuelContext} ctx
 * @param {DuelState} s
 * @param {number} now
 */
export function duelMaybeStart(ctx, s, now) {
  if (s.status !== 'setup' || !s.items) return false;
  const here = ctx.present();
  if (!here.white || !here.black) return false;
  s.status = 'playing';
  s.setupBy = null;
  countdown(ctx, s, 0, now);
  return true;
}

/**
 * The round on is decided: by both results, or by the time running out.
 * @param {DuelContext} ctx
 * @param {DuelState} s
 * @param {number} now
 */
function resolve(ctx, s, now) {
  const items = s.items ?? [];
  const { white, black } = s.results;
  const item = /** @type {{ cp?: number }} */ (items[s.round] ?? {});
  const decided =
    s.game === 'race'
      ? raceRound(String(s.opts.format), /** @type {never} */ (white), /** @type {never} */ (black))
      : s.game === 'arbiter'
        ? arbiterRound(/** @type {never} */ (white), /** @type {never} */ (black))
        : judgeRound(/** @type {never} */ (white), /** @type {never} */ (black), item.cp ?? 0);
  s.score = {
    white: s.score.white + decided.points.white,
    black: s.score.black + decided.points.black,
  };
  /** @type {RoundRecord} */
  const record = { round: s.round, results: { white, black }, ...decided };
  s.rounds = [...s.rounds, record];
  ctx.tell(() => ({ t: 'round-end', ...record, score: s.score }));
  const result = duelResult(s.game, s.score, s.rounds.length, items.length - (s.round + 1));
  if (result) {
    endDuel(ctx, s, result, 'score', now);
    return;
  }
  s.phase = 'reveal';
  s.phaseEndsAt = now + DUEL_RULES.revealMs;
  s.liveSince = null;
}

/** @param {DuelContext} ctx @param {DuelState} s @param {number} now */
function finishTimed(ctx, s, now) {
  const progress = /** @type {NonNullable<DuelState['progress']>} */ (s.progress);
  endDuel(ctx, s, timedResult(progress.white, progress.black), 'score', now);
}

/**
 * Whether a result ends the other player's chances in this round but for the
 * time it takes to arrive: a clean solve, a call on the illegal move.
 * @param {DuelState} s
 * @param {DuelResult} result
 */
function deciding(s, result) {
  if (s.game === 'race') return /** @type {{ ok: boolean }} */ (result).ok;
  if (s.game === 'arbiter') return /** @type {{ call: string }} */ (result).call === 'caught';
  return false;
}

/**
 * A player's report: a round's result, or one puzzle of a timed race.
 * @param {DuelContext} ctx
 * @param {unknown} conn
 * @param {DuelState} s
 * @param {Seat} seat
 * @param {Record<string, unknown>} msg
 * @param {number} now
 */
function report(ctx, conn, s, seat, msg, now) {
  if (s.status !== 'playing' || s.phase !== 'live') {
    return ctx.refuse(conn, seat, 'not-now', 'That round is over.');
  }
  if (isTimed(s)) {
    const progress = /** @type {NonNullable<DuelState['progress']>} */ (s.progress);
    const r = timedReport(msg);
    if (!r) return ctx.refuse(conn, seat, 'bad-request', 'That is not a result.');
    const mine = progress[seat];
    if (mine.done) return;
    if (r.index !== mine.index) return ctx.refuse(conn, seat, 'not-now', 'That puzzle is past.');
    const total = (s.items ?? []).length;
    const solved = mine.solved + (r.ok ? 1 : 0);
    const strikes = mine.strikes + (r.ok ? 0 : 1);
    const index = mine.index + 1;
    progress[seat] = {
      index,
      solved,
      strikes,
      done: strikes >= DUEL_RULES.race.strikes || index >= total,
    };
    ctx.tell(() => ({ t: 'progress', white: progress.white, black: progress.black }));
    if (progress.white.done && progress.black.done) finishTimed(ctx, s, now);
    return;
  }
  if (msg.round !== s.round) return ctx.refuse(conn, seat, 'not-now', 'That round is over.');
  if (s.results[seat]) return;
  const result = duelReport(s.game, msg);
  if (!result) return ctx.refuse(conn, seat, 'bad-request', 'That is not a result.');
  s.results = { ...s.results, [seat]: result };
  ctx.tell(() => ({
    t: 'reported',
    round: s.round,
    by: seat,
    result: publicResult(s.game, result),
  }));
  if (s.results[other(seat)]) {
    resolve(ctx, s, now);
    return;
  }
  // The other may still beat it, for as long as their result takes to arrive; in a race of
  // the 15-second window, also for as long as a clean solve still shares the round.
  if (deciding(s, result) && s.phaseEndsAt !== null) {
    const rules = s.game === 'race' ? DUEL_RULES.race : DUEL_RULES.arbiter;
    const extra =
      rules.graceMs +
      (s.game === 'race' && s.opts.format === 'window' ? DUEL_RULES.race.windowMs : 0);
    s.phaseEndsAt = Math.min(s.phaseEndsAt, now + extra);
  }
}

/**
 * A message from a seated player in a duel. The room handles the rest
 * (`hello`, `say`, `rematch`) itself.
 * @param {DuelContext} ctx
 * @param {unknown} conn
 * @param {DuelState} s
 * @param {Seat} seat
 * @param {Record<string, unknown>} msg
 * @param {number} now
 * @returns {boolean} whether the message was a duel's (otherwise the room's to answer)
 */
export function duelMessage(ctx, conn, s, seat, msg, now) {
  switch (msg.t) {
    case 'content': {
      if (seat !== 'white') {
        ctx.refuse(conn, seat, 'not-now', 'The host sends the rounds.');
        return true;
      }
      if (s.status !== 'setup' || s.items) {
        ctx.refuse(conn, seat, 'not-now', 'The rounds are in already.');
        return true;
      }
      const items = duelContent(s.game, s.opts, msg.items);
      if (!items) {
        ctx.refuse(conn, seat, 'bad-request', 'Those rounds cannot be played.');
        return true;
      }
      s.items = items;
      ctx.tell(() => ({ t: 'content', items }));
      duelMaybeStart(ctx, s, now);
      return true;
    }
    case 'result':
      report(ctx, conn, s, seat, msg, now);
      return true;
    case 'abort':
      if (s.status !== 'setup') {
        ctx.refuse(conn, seat, 'not-now', 'The duel is under way.');
        return true;
      }
      endDuel(ctx, s, '*', 'aborted', now);
      return true;
    case 'resign':
      if (s.status === 'over') {
        ctx.refuse(conn, seat, 'over', 'The duel is over.');
        return true;
      }
      if (s.status === 'setup') endDuel(ctx, s, '*', 'aborted', now);
      else endDuel(ctx, s, seat === 'white' ? '0-1' : '1-0', 'resign', now);
      return true;
    default:
      return false;
  }
}

/**
 * Something the duel waits for is due: the setup's end, a countdown's, a
 * round's, or a result's time on screen.
 * @param {DuelContext} ctx
 * @param {DuelState} s
 * @param {number} now
 */
export function duelTimer(ctx, s, now) {
  if (s.status === 'setup') {
    if (s.setupBy !== null && now >= s.setupBy) endDuel(ctx, s, '*', 'no-start', now);
    return;
  }
  if (s.status !== 'playing' || s.phaseEndsAt === null || now < s.phaseEndsAt) return;
  if (s.phase === 'countdown') {
    goLive(ctx, s, now);
  } else if (s.phase === 'live') {
    if (isTimed(s)) finishTimed(ctx, s, now);
    else resolve(ctx, s, now);
  } else if (s.phase === 'reveal') {
    countdown(ctx, s, s.round + 1, now);
  }
}

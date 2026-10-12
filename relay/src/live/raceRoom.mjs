/**
 * A puzzle race for a room of up to eight (a kind of group room: group.mjs
 * runs the room, this module the races in it). The room's options are a
 * race's: `rounds` (five puzzles, each scored by the order of the clean
 * solves) or `timed` (the three-minute race), and the puzzle rating.
 *
 * The host starts a race with at least two members here: their device deals
 * the puzzles and sends them with `start` (checked as a duel's are,
 * duelRules.mjs), and the members here then are the race's racers. A race of
 * rounds runs as a duel's does, by the room's clock: a countdown, the round
 * (each racer reports a clean solve and its time as their device measured
 * it, or a miss), and the round's result for a few seconds. A round ends when
 * every racer here has reported, or at its time limit. The clean solves score
 * by their order, fastest first: 5, 4, 3 and 2 points for the first four, 1
 * for any other; the most points after the five puzzles wins. In the timed
 * race everyone gets the same puzzles and goes at their own pace; three wrong
 * answers end a racer's race, and the race ends when every racer here is
 * through, or after three minutes. The most solved wins, then the fewer wrong
 * answers. Racers who tie share a place.
 *
 * Everything in a race is public: every change goes to everyone in the room
 * as the race's state (`{t:'race', state}`), the puzzles only when it starts.
 * Members who join during a race watch it and race in the next one; the host
 * can start another whenever none is on, with the same or other options.
 */
import { duelContent, duelReport, timedReport } from './duelRules.mjs';
import { DUEL_RULES, groupOptions, RACE_ROOM } from './shared.mjs';

/**
 * @typedef {import('./duelRules.mjs').RacePuzzle} RacePuzzle
 * @typedef {{ ok: boolean, ms: number }} RaceResult
 * @typedef {{ index: number, solved: number, strikes: number, done: boolean }} Progress
 * @typedef {{ id: string, name: string, rating: number | null }} Racer
 * @typedef {{ round: number, results: Record<string, RaceResult>, points: Record<string, number> }} RoundRecord
 * @typedef {{ format: 'rounds' | 'timed', level: number }} RaceOptions
 *
 * @typedef {{
 *   number: number,
 *   format: 'rounds' | 'timed',
 *   level: number,
 *   status: 'playing' | 'over',
 *   racers: Racer[],
 *   items: RacePuzzle[],
 *   round: number,
 *   phase: 'countdown' | 'live' | 'reveal' | null,
 *   phaseEndsAt: number | null,
 *   liveSince: number | null,
 *   results: Record<string, RaceResult>,
 *   rounds: RoundRecord[],
 *   scores: Record<string, number>,
 *   progress: Record<string, Progress> | null,
 *   places: { id: string, place: number }[] | null,
 *   endedAt: number | null,
 * }} Race
 *
 * @typedef {{ opts: RaceOptions, count: number, race: Race | null }} RaceRoomState
 *
 * @typedef {import('./group.mjs').GroupContext} GroupContext
 * @typedef {import('./group.mjs').Sender} Sender
 */

/** After a timed race's three minutes, the last reports in flight may still come this long (as in duels). */
const TIMED_GRACE_MS = 2000;

/** @returns {Progress} */
const fresh = () => ({ index: 0, solved: 0, strikes: 0, done: false });

/**
 * A round's points by racer: the clean solves, fastest first, score 5, 4, 3,
 * 2, then 1 each; solves in the same time score alike.
 * @param {Record<string, RaceResult>} results
 * @returns {Record<string, number>}
 */
export function racePoints(results) {
  const clean = Object.entries(results).filter(([, result]) => result.ok);
  /** @type {Record<string, number>} */
  const points = {};
  for (const [id, result] of clean) {
    const ahead = clean.filter(([, other]) => other.ms < result.ms).length;
    points[id] = RACE_ROOM.points[ahead] ?? RACE_ROOM.others;
  }
  return points;
}

/**
 * The places at a race's end, best first: by points (rounds), or by puzzles
 * solved and then the fewer wrong answers (timed). Racers who tie share the
 * place ("1, 1, 3").
 * @param {Race} race
 * @returns {{ id: string, place: number }[]}
 */
export function racePlaces(race) {
  /** @param {string} id @returns {number[]} what ranks a racer, lower first */
  const key = (id) => {
    if (race.format === 'timed') {
      const p = race.progress?.[id] ?? fresh();
      return [-p.solved, p.strikes];
    }
    return [-(race.scores[id] ?? 0)];
  };
  /** @param {number[]} a @param {number[]} b */
  const compare = (a, b) => {
    for (let i = 0; i < a.length; i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };
  const ids = race.racers.map((racer) => racer.id);
  return ids
    .map((id) => ({
      id,
      place: 1 + ids.filter((other) => compare(key(other), key(id)) < 0).length,
    }))
    .sort((a, b) => a.place - b.place);
}

/** @param {Race} race @param {number} round @param {number} now */
function countdown(race, round, now) {
  race.round = round;
  race.phase = 'countdown';
  race.phaseEndsAt = now + DUEL_RULES.countdownMs;
  race.liveSince = null;
  race.results = {};
}

/** @param {Race} race @param {number} now */
function goLive(race, now) {
  race.phase = 'live';
  race.liveSince = now;
  race.phaseEndsAt =
    now + (race.format === 'timed' ? DUEL_RULES.race.timedMs : DUEL_RULES.race.roundMs);
}

/** @param {Race} race @param {number} now */
function finish(race, now) {
  race.status = 'over';
  race.phase = null;
  race.phaseEndsAt = null;
  race.liveSince = null;
  race.endedAt = now;
  race.places = racePlaces(race);
}

/** The round on is over: its points are counted; the race ends after its last puzzle. */
function resolveRound(/** @type {Race} */ race, /** @type {number} */ now) {
  const points = racePoints(race.results);
  for (const racer of race.racers) {
    race.scores[racer.id] = (race.scores[racer.id] ?? 0) + (points[racer.id] ?? 0);
  }
  race.rounds = [...race.rounds, { round: race.round, results: race.results, points }];
  if (race.round + 1 >= race.items.length) {
    finish(race, now);
    return;
  }
  race.phase = 'reveal';
  race.phaseEndsAt = now + DUEL_RULES.revealMs;
  race.liveSince = null;
}

/** The racers who are here (a racer who left is not waited for). */
function racersHere(/** @type {GroupContext} */ ctx, /** @type {Race} */ race) {
  const here = new Set(ctx.here());
  return race.racers.filter((racer) => here.has(racer.id));
}

/**
 * Whether the live part of the race can end before its time: every racer here
 * has reported the round (or, timed, is through). Never while nobody is here:
 * the clock decides then.
 */
function everyoneIn(/** @type {GroupContext} */ ctx, /** @type {Race} */ race) {
  const here = racersHere(ctx, race);
  if (here.length === 0) return false;
  return race.format === 'timed'
    ? here.every((racer) => race.progress?.[racer.id]?.done === true)
    : here.every((racer) => race.results[racer.id] !== undefined);
}

/** Ends the live part early when everyone here is in; whether it did. */
function endIfAllIn(
  /** @type {GroupContext} */ ctx,
  /** @type {Race} */ race,
  /** @type {number} */ now,
) {
  if (race.status !== 'playing' || race.phase !== 'live' || !everyoneIn(ctx, race)) return false;
  if (race.format === 'timed') finish(race, now);
  else resolveRound(race, now);
  return true;
}

/**
 * The race as everyone sees it; the puzzles only when `items` (the snapshot,
 * and the start). Times are durations from now, never the relay's clock.
 * @param {Race} race
 * @param {number} now
 * @param {boolean} items
 */
function raceView(race, now, items) {
  return {
    number: race.number,
    format: race.format,
    level: race.level,
    status: race.status,
    racers: race.racers,
    ...(items ? { items: race.items } : {}),
    round: race.round,
    phase: race.phase,
    phaseIn: race.phaseEndsAt !== null ? Math.max(0, race.phaseEndsAt - now) : null,
    liveFor: race.liveSince !== null ? Math.max(0, now - race.liveSince) : null,
    results: race.results,
    rounds: race.rounds,
    scores: race.scores,
    progress: race.progress,
    places: race.places,
  };
}

/**
 * What the room's state is to everyone: the next race's options, how many
 * races there have been, and the race on (or the last one).
 * @param {RaceRoomState} s
 * @param {number} now
 * @param {boolean} [items]
 */
function view(s, now, items = true) {
  return { opts: s.opts, count: s.count, race: s.race ? raceView(s.race, now, items) : null };
}

/** Tells everyone the race as it stands. @param {GroupContext} ctx @param {RaceRoomState} s */
function tellRace(ctx, s, /** @type {number} */ now, items = false) {
  ctx.announce({ t: 'race', state: view(s, now, items) });
}

/**
 * A racer's report: a round's result, or one puzzle of the timed race.
 * @param {GroupContext} ctx
 * @param {unknown} conn
 * @param {RaceRoomState} s
 * @param {Sender} sender
 * @param {Record<string, unknown>} msg
 * @param {number} now
 */
function report(ctx, conn, s, sender, msg, now) {
  const race = s.race;
  if (!race || race.status !== 'playing' || race.phase !== 'live') {
    return ctx.refuse(conn, 'not-now', 'That round is over.');
  }
  if (!race.racers.some((racer) => racer.id === sender.id)) {
    return ctx.refuse(conn, 'not-now', 'You are watching this race: you race in the next one.');
  }
  if (race.format === 'timed') {
    const r = timedReport(msg);
    if (!r) return ctx.refuse(conn, 'bad-request', 'That is not a result.');
    const progress = /** @type {Record<string, Progress>} */ (race.progress);
    const mine = progress[sender.id] ?? fresh();
    if (mine.done) return;
    if (r.index !== mine.index) return ctx.refuse(conn, 'not-now', 'That puzzle is past.');
    const solved = mine.solved + (r.ok ? 1 : 0);
    const strikes = mine.strikes + (r.ok ? 0 : 1);
    const index = mine.index + 1;
    progress[sender.id] = {
      index,
      solved,
      strikes,
      done: strikes >= DUEL_RULES.race.strikes || index >= race.items.length,
    };
  } else {
    if (msg.round !== race.round) return ctx.refuse(conn, 'not-now', 'That round is over.');
    if (race.results[sender.id]) return;
    const result = /** @type {RaceResult | null} */ (duelReport('race', msg));
    if (!result) return ctx.refuse(conn, 'bad-request', 'That is not a result.');
    race.results = { ...race.results, [sender.id]: result };
  }
  endIfAllIn(ctx, race, now);
  tellRace(ctx, s, now);
}

/**
 * The host starts a race: the puzzles their device dealt, with the options
 * (the room's own when none come), for the members here.
 * @param {GroupContext} ctx
 * @param {unknown} conn
 * @param {RaceRoomState} s
 * @param {Sender} sender
 * @param {Record<string, unknown>} msg
 * @param {number} now
 */
function start(ctx, conn, s, sender, msg, now) {
  if (!sender.host) return ctx.refuse(conn, 'not-host', 'The host starts the race.');
  if (s.race?.status === 'playing') return ctx.refuse(conn, 'not-now', 'A race is on.');
  const opts = /** @type {RaceOptions | null} */ (groupOptions('race', msg.opts ?? s.opts));
  if (!opts) return ctx.refuse(conn, 'bad-request', 'Those options are not a race.');
  const here = new Set(ctx.here());
  const racers = ctx
    .members()
    .filter((member) => here.has(member.id))
    .map(({ id, name, rating }) => ({ id, name, rating }));
  if (racers.length < RACE_ROOM.minRacers) {
    return ctx.refuse(conn, 'not-now', 'A race takes at least two players here.');
  }
  const timed = opts.format === 'timed';
  const items = /** @type {RacePuzzle[] | null} */ (duelContent('race', opts, msg.items));
  if (!items) return ctx.refuse(conn, 'bad-request', 'Those puzzles cannot be raced.');
  s.opts = opts;
  s.count += 1;
  /** @type {Race} */
  const race = {
    number: s.count,
    format: opts.format,
    level: opts.level,
    status: 'playing',
    racers,
    items,
    round: 0,
    phase: null,
    phaseEndsAt: null,
    liveSince: null,
    results: {},
    rounds: [],
    scores: Object.fromEntries(racers.map((racer) => [racer.id, 0])),
    progress: timed ? Object.fromEntries(racers.map((racer) => [racer.id, fresh()])) : null,
    places: null,
    endedAt: null,
  };
  countdown(race, 0, now);
  s.race = race;
  tellRace(ctx, s, now, true);
}

/**
 * The race room, as group.mjs takes a kind (see `GroupKindModule` there).
 * @type {import('./group.mjs').GroupKindModule<RaceRoomState>}
 */
export const raceRoom = {
  options: (opts) => groupOptions('race', opts),

  create: (opts) => ({
    opts: /** @type {RaceOptions} */ (/** @type {unknown} */ (opts)),
    count: 0,
    race: null,
  }),

  view: (s, _member, now) => view(s, now),

  deadline(s) {
    const race = s.race;
    if (!race || race.status !== 'playing' || race.phaseEndsAt === null) return null;
    return (
      race.phaseEndsAt + (race.format === 'timed' && race.phase === 'live' ? TIMED_GRACE_MS : 0)
    );
  },

  // Only the host's start, with the timed race's forty puzzles, is a big message.
  big: (msg, sender) => msg.t === 'start' && sender.host,

  message(ctx, conn, s, sender, msg, now) {
    switch (msg.t) {
      case 'options': {
        if (!sender.host) {
          ctx.refuse(conn, 'not-host', 'The host chooses the race.');
          return true;
        }
        if (s.race?.status === 'playing') {
          ctx.refuse(conn, 'not-now', 'A race is on.');
          return true;
        }
        const opts = /** @type {RaceOptions | null} */ (groupOptions('race', msg.opts));
        if (!opts) {
          ctx.refuse(conn, 'bad-request', 'Those options are not a race.');
          return true;
        }
        s.opts = opts;
        tellRace(ctx, s, now);
        return true;
      }
      case 'start':
        start(ctx, conn, s, sender, msg, now);
        return true;
      case 'result':
        report(ctx, conn, s, sender, msg, now);
        return true;
      default:
        return false;
    }
  },

  timer(ctx, s, now) {
    const race = s.race;
    const due = raceRoom.deadline(s);
    if (!race || due === null || now < due) return;
    if (race.phase === 'countdown') {
      goLive(race, now);
    } else if (race.phase === 'live') {
      if (race.format === 'timed') finish(race, now);
      else resolveRound(race, now);
    } else if (race.phase === 'reveal') {
      countdown(race, race.round + 1, now);
    }
    tellRace(ctx, s, now);
  },

  presence(ctx, s, now) {
    if (s.race && endIfAllIn(ctx, s.race, now)) tellRace(ctx, s, now);
  },
};

import { duelContent, duelReport } from '../../../relay/src/live/duelRules.mjs';
import { groupOptions, MEMBER_PATTERN } from '../../../relay/src/live/shared.mjs';
import { createRelayGroup, type GroupKindClient } from './relayGroup';
import type {
  DuelProgress,
  GroupView,
  RacePuzzle,
  RaceRoomOptions,
  RaceRoomRace,
  RaceRoomReport,
  RaceRoomRound,
  RaceRoomSession,
  RaceRoomState,
  RaceRoomView,
} from './types';

/**
 * A race room on the relay (relay/src/live/raceRoom.mjs) from this device: up
 * to eight racing the same puzzles. The room runs each race by its clock and
 * scores it; this side shows it as the room tells it, and reports this
 * player's results as this device measured them. The host's device deals the
 * puzzles when the host starts a race (`prepare`, duelRounds.ts), avoiding
 * the last race's.
 */

export type PrepareRace = (
  opts: RaceRoomOptions,
  avoid: ReadonlySet<string>,
) => Promise<RacePuzzle[]>;

const defaultPrepare: PrepareRace = async (opts, avoid) => {
  const { prepareDuel } = await import('./duelRounds');
  // Five puzzles near the level (a duel's race of rounds deals as many), or the timed race's.
  const items = await prepareDuel(
    'race',
    { format: opts.format === 'timed' ? 'timed' : 'best3', level: opts.level },
    Math.random,
    avoid,
  );
  return items as RacePuzzle[];
};

const PHASES = ['countdown', 'live', 'reveal'] as const;
const DEFAULT_OPTIONS: RaceRoomOptions = { format: 'rounds', level: 1500 };

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const whole = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
const isMemberId = (value: unknown): value is string =>
  typeof value === 'string' && MEMBER_PATTERN.test(value);

/** A record by member id, each value read by `read` (those it refuses left out). */
function byMember<T>(value: unknown, read: (item: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, item] of Object.entries(record(value))) {
    if (!isMemberId(id)) continue;
    const read1 = read(item);
    if (read1 !== null) out[id] = read1;
  }
  return out;
}

const resultOf = (item: unknown) =>
  duelReport('race', record(item)) as RaceRoomRound['results'][string] | null;

function progressOf(item: unknown): DuelProgress {
  const p = record(item);
  return {
    index: whole(p.index),
    solved: whole(p.solved),
    strikes: whole(p.strikes),
    done: p.done === true,
  };
}

/** The room's options for a race, or null. */
export function raceOptionsOf(value: unknown): RaceRoomOptions | null {
  return groupOptions('race', value) as RaceRoomOptions | null;
}

function raceOf(value: unknown, before: RaceRoomRace | null): RaceRoomRace | null {
  const r = record(value);
  const opts = raceOptionsOf({ format: r.format, level: r.level });
  const number = whole(r.number);
  if (!opts || number < 1) return null;
  const now = performance.now();
  const racers = Array.isArray(r.racers)
    ? r.racers.flatMap((item: unknown) => {
        const { id, name, rating } = record(item);
        if (!isMemberId(id) || typeof name !== 'string') return [];
        return [{ id, name, rating: finite(rating) }];
      })
    : [];
  // The puzzles come with the race's start and the snapshot only: otherwise this race's are kept.
  const items =
    'items' in r
      ? ((duelContent('race', opts, r.items) as RacePuzzle[] | null) ?? [])
      : before?.number === number
        ? before.items
        : [];
  const status = r.status === 'over' ? 'over' : 'playing';
  const phaseIn = finite(r.phaseIn);
  const liveFor = finite(r.liveFor);
  const rounds = Array.isArray(r.rounds)
    ? r.rounds.flatMap((item: unknown): RaceRoomRound[] => {
        const round = record(item);
        const n = finite(round.round);
        if (n === null) return [];
        return [
          {
            round: n,
            results: byMember(round.results, resultOf),
            points: byMember(round.points, finite),
          },
        ];
      })
    : [];
  const places = Array.isArray(r.places)
    ? r.places.flatMap((item: unknown) => {
        const { id, place } = record(item);
        return isMemberId(id) && typeof place === 'number' ? [{ id, place }] : [];
      })
    : null;
  return {
    number,
    format: opts.format,
    level: opts.level,
    status,
    racers,
    items,
    round: whole(r.round),
    phase: status === 'playing' ? (PHASES.find((p) => p === r.phase) ?? null) : null,
    phaseEnds: status === 'playing' && phaseIn !== null ? now + phaseIn : null,
    liveSince: status === 'playing' && liveFor !== null ? now - liveFor : null,
    results: byMember(r.results, resultOf),
    rounds,
    scores: byMember(r.scores, finite),
    progress: r.progress == null ? null : byMember(r.progress, progressOf),
    places,
  };
}

/** A race room's state as the room sends it; `before` keeps the race's puzzles. */
export function raceRoomStateOf(
  value: unknown,
  before: RaceRoomState | null,
): RaceRoomState | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = record(value);
  return {
    opts: raceOptionsOf(v.opts) ?? before?.opts ?? DEFAULT_OPTIONS,
    count: whole(v.count),
    race: v.race == null ? null : raceOf(v.race, before?.race ?? null),
  };
}

const RACE_CLIENT: GroupKindClient<RaceRoomState> = {
  kind: 'race',
  stateMessage: 'race',
  read: raceRoomStateOf,
};

/** Whether this device races in the race on (rather than watching it). */
export function racing(view: Pick<RaceRoomView, 'you' | 'state'>): boolean {
  const race = view.state?.race;
  return !!race && race.status === 'playing' && race.racers.some((racer) => racer.id === view.you);
}

/** The connection to race room `id`. */
export function createRaceRoom(id: string, prepare: PrepareRace = defaultPrepare): RaceRoomSession {
  const listeners = new Set<() => void>();
  let dealing = false;
  /** This device's result in the round on, until the room has it (sent again after a reconnection). */
  let pendingRound: { round: number; ok: boolean; ms: number } | null = null;
  /** The timed race's results the room has not counted yet, oldest first. */
  let pendingTimed: { index: number; ok: boolean; ms: number }[] = [];
  /** The race whose results these are. */
  let pendingRace = 0;
  let closed = false;

  const group = createRelayGroup<RaceRoomState>(id, RACE_CLIENT, (groupView, snapshot) => {
    settlePending(groupView, snapshot);
  });

  let view: RaceRoomView = { ...group.getView(), dealing };

  function refresh(): void {
    const next = { ...group.getView(), dealing };
    const changed = (Object.keys(next) as (keyof RaceRoomView)[]).some(
      (key) => next[key] !== view[key],
    );
    if (!changed) return;
    view = next;
    for (const listener of [...listeners]) listener();
  }

  group.subscribe(refresh);

  /** What the room has of this device's results: those it has are no longer pending; after a reconnection the rest go again. */
  function settlePending(groupView: GroupView<RaceRoomState>, snapshot: boolean): void {
    const race = groupView.state?.race;
    const me = groupView.you;
    if (!race || !me || race.number !== pendingRace || race.status !== 'playing') {
      pendingRound = null;
      pendingTimed = [];
      return;
    }
    if (race.phase !== 'live') {
      pendingRound = null;
    } else if (pendingRound && (pendingRound.round !== race.round || race.results[me])) {
      pendingRound = null;
    }
    const done = race.progress?.[me]?.index ?? 0;
    pendingTimed = pendingTimed.filter((r) => r.index >= done);
    if (!snapshot || race.phase !== 'live') return;
    if (pendingRound) group.send({ t: 'result', ...pendingRound });
    for (const r of pendingTimed) group.send({ t: 'result', ...r });
  }

  function setDealing(next: boolean): void {
    if (dealing === next) return;
    dealing = next;
    refresh();
  }

  function report(result: RaceRoomReport): void {
    if (closed) return;
    const race = view.state?.race;
    if (!race || !view.you || race.phase !== 'live' || !racing(view)) return;
    pendingRace = race.number;
    if ('index' in result) {
      pendingTimed.push(result);
    } else {
      if (result.round !== race.round || race.results[view.you]) return;
      pendingRound = result;
    }
    // Not connected: it goes once the room's next snapshot shows the race still on.
    group.send({ t: 'result', ...result });
  }

  function start(): void {
    if (closed || dealing) return;
    const state = view.state;
    if (!state || !view.you || view.you !== view.host || state.race?.status === 'playing') return;
    const opts = state.opts;
    const avoid = new Set(state.race?.items.map((puzzle) => puzzle.id) ?? []);
    setDealing(true);
    group.setError(null);
    prepare(opts, avoid).then(
      (items) => {
        setDealing(false);
        if (closed) return;
        group.send({ t: 'start', opts, items });
      },
      (err: unknown) => {
        setDealing(false);
        if (closed) return;
        group.setError(
          err instanceof Error && err.message ? err.message : 'The puzzles could not be dealt.',
        );
      },
    );
  }

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    join: () => group.join(),
    leave: () => group.leave(),
    say: (phrase) => group.say(phrase),
    setOptions(opts) {
      const checked = raceOptionsOf(opts);
      if (!checked || view.you !== view.host || view.state?.race?.status === 'playing') return;
      group.send({ t: 'options', opts: checked });
    },
    start,
    report,
    close() {
      if (closed) return;
      closed = true;
      pendingRound = null;
      pendingTimed = [];
      group.close();
    },
  };
}

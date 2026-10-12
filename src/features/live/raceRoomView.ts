/**
 * Race rooms in words and in order: the formats, the goal, the standings as
 * they change and the places at the end (the room's page, the setup dialog,
 * and their tests). No chess.js here.
 */
import { DUEL_RULES, RACE_ROOM } from '../../../relay/src/live/shared.mjs';
import type {
  DuelProgress,
  GroupMember,
  RaceResult,
  RaceRoomFormat,
  RaceRoomOptions,
  RaceRoomRace,
} from './types';

export const RACE_ROOM_FORMAT_NAMES: Record<RaceRoomFormat, string> = {
  rounds: 'Five rounds',
  timed: 'Three-minute race',
};

/** "7.95 s": a solve's time, as the duels show it (duelView.ts, which this module leaves unloaded). */
const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(2)} s`;

const POINTS_TEXT = `${RACE_ROOM.points.join(', ').replace(/, (\d+)$/, ' and $1')}`;

export const RACE_ROOM_FORMAT_HINTS: Record<RaceRoomFormat, string> = {
  rounds: `${RACE_ROOM.rounds} puzzles, each on every board at once. The clean solves score by their order, fastest first: ${POINTS_TEXT} points for the first ${RACE_ROOM.points.length}, ${RACE_ROOM.others} for any other.`,
  timed: `The same puzzles for everyone, each at your own pace, getting harder: the most solved in three minutes wins, then the fewer wrong answers. ${DUEL_RULES.race.strikes} wrong answers and you are out.`,
};

/** "Five rounds · 1500". */
export function describeRaceRoom(opts: Pick<RaceRoomOptions, 'format' | 'level'>): string {
  return `${RACE_ROOM_FORMAT_NAMES[opts.format]} · ${opts.level}`;
}

/** What wins: "The most points after five puzzles". */
export function raceRoomGoal(format: RaceRoomFormat): string {
  return format === 'timed'
    ? 'The most puzzles solved in three minutes'
    : `The most points after ${RACE_ROOM.rounds} puzzles`;
}

/** "1st", "2nd", "3rd", "4th"… (up to eight racers). */
export function placeText(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

/** "1 point", "9 points". */
export function pointsText(points: number): string {
  return points === 1 ? '1 point' : `${points} points`;
}

/** One racer's line in the standings. */
export interface Standing {
  id: string;
  name: string;
  rating: number | null;
  /** The place now (racers who tie share it). */
  place: number;
  /** Rounds: the points so far. */
  points: number;
  /** Timed: the race so far. */
  progress: DuelProgress;
  /** Rounds: this racer's result in the round on (or the one just played). */
  result: RaceResult | null;
  /** Rounds: the points the round just played gave them (while its result shows). */
  gained: number | null;
  /** Whether they are connected to the room. */
  here: boolean;
}

const FRESH: DuelProgress = { index: 0, solved: 0, strikes: 0, done: false };

/**
 * The race's standings, best first: by points (rounds), or by puzzles solved
 * and then the fewer wrong answers (timed). Racers who tie share a place; at
 * the end the room's own places stand.
 */
export function raceStandings(race: RaceRoomRace, members: readonly GroupMember[]): Standing[] {
  const here = new Set(members.filter((m) => m.here).map((m) => m.id));
  const timed = race.format === 'timed';
  const last = race.rounds.find((r) => r.round === race.round);
  const revealing = race.phase === 'reveal' || race.status === 'over';
  const lines = race.racers.map((racer) => ({
    id: racer.id,
    name: racer.name,
    rating: racer.rating,
    points: race.scores[racer.id] ?? 0,
    progress: race.progress?.[racer.id] ?? FRESH,
    result: (revealing && last ? last.results[racer.id] : race.results[racer.id]) ?? null,
    gained: revealing && last && !timed ? (last.points[racer.id] ?? 0) : null,
    here: here.has(racer.id),
  }));
  const key = (line: (typeof lines)[number]): [number, number] =>
    timed ? [-line.progress.solved, line.progress.strikes] : [-line.points, 0];
  const better = (a: [number, number], b: [number, number]) =>
    a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const ended = race.places ? new Map(race.places.map((p) => [p.id, p.place])) : null;
  return lines
    .map((line) => ({
      ...line,
      place:
        ended?.get(line.id) ?? 1 + lines.filter((other) => better(key(other), key(line))).length,
    }))
    .sort((a, b) => a.place - b.place);
}

/** A racer's score in words: "9 points", "7 solved". */
export function standingScore(format: RaceRoomFormat, standing: Standing): string {
  return format === 'timed' ? `${standing.progress.solved} solved` : pointsText(standing.points);
}

/** How a racer's round stands: "Solved in 7.95 s", "Missed", "Solving". */
export function roundText(standing: Standing, live: boolean): string {
  const result = standing.result;
  if (result) return result.ok ? `Solved in ${seconds(result.ms)}` : 'Missed';
  return live ? (standing.here ? 'Solving' : 'Away') : 'No answer';
}

/** How a racer's three-minute race stands: "Out", "Through", "Puzzle 6". */
export function timedText(standing: Standing, total: number): string {
  const p = standing.progress;
  if (p.strikes >= DUEL_RULES.race.strikes) return 'Out';
  if (p.done || (total > 0 && p.index >= total)) return 'Through';
  return standing.here ? `Puzzle ${p.index + 1}` : 'Away';
}

/** Whether anyone has scored yet: until then the standings show no places (everyone would be 1st). */
export function anyScore(format: RaceRoomFormat, standings: readonly Standing[]): boolean {
  return standings.some((s) =>
    format === 'timed' ? s.progress.solved > 0 || s.progress.strikes > 0 : s.points > 0,
  );
}

/** A place in the standings: "2nd", or a dash while nobody has scored. */
export function standingPlace(standing: Standing, scored: boolean): string {
  return scored ? placeText(standing.place) : '–';
}

/** How the race went for this player: "You came 2nd with 4 points.", "You shared 1st place…". */
export function raceVerdict(
  format: RaceRoomFormat,
  standings: readonly Standing[],
  mine: Standing,
): string {
  if (!anyScore(format, standings)) {
    return format === 'timed'
      ? 'Nobody solved a puzzle in this race.'
      : 'Nobody scored in this race.';
  }
  const shared = standings.filter((s) => s.place === mine.place).length > 1;
  const score = standingScore(format, mine);
  return shared
    ? `You shared ${placeText(mine.place)} place with ${score}.`
    : `You came ${placeText(mine.place)} with ${score}.`;
}

/** How the others stand on the puzzle on: "Swift Knight is solving.", "1 of the other 3 solved it." */
export function othersLine(others: readonly Standing[]): string {
  if (others.length === 0) return 'Nobody else is racing.';
  if (others.length === 1) {
    const [one] = others;
    if (!one) return 'Nobody else is racing.';
    if (!one.result) return `${one.name} is solving.`;
    return one.result.ok ? `${one.name} solved it.` : `${one.name} missed it.`;
  }
  const solved = others.filter((s) => s.result?.ok).length;
  const missed = others.filter((s) => s.result && !s.result.ok).length;
  if (solved === 0 && missed === 0) return `The other ${others.length} are solving.`;
  return `${solved} of the other ${others.length} solved it${missed ? `, ${missed} missed` : ''}.`;
}

import { describe, expect, it } from 'vitest';
import {
  anyScore,
  describeRaceRoom,
  othersLine,
  placeText,
  RACE_ROOM_FORMAT_HINTS,
  raceRoomGoal,
  raceStandings,
  raceVerdict,
  roundText,
  standingPlace,
  standingScore,
  timedText,
} from './raceRoomView';
import type { GroupMember, RaceRoomRace } from './types';

const members: GroupMember[] = [
  { id: 'a', name: 'Patient Bishop', rating: 1500, here: true },
  { id: 'b', name: 'Swift Knight', rating: null, here: true },
  { id: 'c', name: 'Quiet Rook', rating: null, here: false },
];

function race(patch: Partial<RaceRoomRace> = {}): RaceRoomRace {
  return {
    number: 1,
    format: 'rounds',
    level: 1500,
    status: 'playing',
    racers: members.map(({ id, name, rating }) => ({ id, name, rating })),
    items: [],
    round: 1,
    phase: 'live',
    phaseEnds: null,
    liveSince: null,
    results: {},
    rounds: [],
    scores: { a: 5, b: 9, c: 5 },
    progress: null,
    places: null,
    ...patch,
  };
}

describe('race rooms in words', () => {
  it('names the formats, the goal and the places', () => {
    expect(describeRaceRoom({ format: 'rounds', level: 1800 })).toBe('Five rounds · 1800');
    expect(describeRaceRoom({ format: 'timed', level: 900 })).toBe('Three-minute race · 900');
    expect(raceRoomGoal('rounds')).toBe('The most points after 5 puzzles');
    expect(RACE_ROOM_FORMAT_HINTS.rounds).toContain('5, 4, 3 and 2 points for the first 4, 1 for');
    expect([1, 2, 3, 4, 8, 11, 12, 21].map(placeText)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '8th',
      '11th',
      '12th',
      '21st',
    ]);
  });

  it('ranks the racers as the round goes, ties sharing a place', () => {
    const live = raceStandings(race({ results: { a: { ok: true, ms: 4321 } } }), members);
    expect(live.map((s) => [s.place, s.id])).toEqual([
      [1, 'b'],
      [2, 'a'],
      [2, 'c'],
    ]);
    expect(live.map((s) => roundText(s, true))).toEqual(['Solving', 'Solved in 4.32 s', 'Away']);
    expect(standingScore('rounds', live[0]!)).toBe('9 points');

    // Once the round is over, the points it gave show beside each result.
    const revealed = raceStandings(
      race({
        phase: 'reveal',
        rounds: [
          {
            round: 1,
            results: { a: { ok: true, ms: 4321 }, b: { ok: false, ms: 900 } },
            points: { a: 5 },
          },
        ],
        scores: { a: 10, b: 9, c: 5 },
      }),
      members,
    );
    expect(revealed.map((s) => [s.place, s.id, s.gained, roundText(s, false)])).toEqual([
      [1, 'a', 5, 'Solved in 4.32 s'],
      [2, 'b', 0, 'Missed'],
      [3, 'c', 0, 'No answer'],
    ]);
  });

  it('ranks the timed race by solved, then the fewer wrong answers; the end keeps the room’s places', () => {
    const timed = race({
      format: 'timed',
      items: new Array(20).fill(null) as never,
      progress: {
        a: { index: 7, solved: 5, strikes: 2, done: false },
        b: { index: 6, solved: 5, strikes: 1, done: false },
        c: { index: 3, solved: 0, strikes: 3, done: true },
      },
    });
    const standings = raceStandings(timed, members);
    expect(standings.map((s) => [s.place, s.id, timedText(s, 20)])).toEqual([
      [1, 'b', 'Puzzle 7'],
      [2, 'a', 'Puzzle 8'],
      [3, 'c', 'Out'],
    ]);
    expect(standingScore('timed', standings[0]!)).toBe('5 solved');
    const over = raceStandings(
      {
        ...timed,
        status: 'over',
        places: [
          { id: 'a', place: 1 },
          { id: 'b', place: 1 },
          { id: 'c', place: 3 },
        ],
      },
      members,
    );
    expect(over.map((s) => [s.place, s.id])).toEqual([
      [1, 'a'],
      [1, 'b'],
      [3, 'c'],
    ]);
  });

  it('shows no places until someone scores, and says how the race went', () => {
    const fresh = raceStandings(race({ scores: { a: 0, b: 0, c: 0 } }), members);
    expect(anyScore('rounds', fresh)).toBe(false);
    expect(fresh.map((s) => standingPlace(s, false))).toEqual(['–', '–', '–']);
    expect(raceVerdict('rounds', fresh, fresh[0]!)).toBe('Nobody scored in this race.');
    expect(raceVerdict('timed', fresh, fresh[0]!)).toBe('Nobody solved a puzzle in this race.');

    const tied = raceStandings(race({ scores: { a: 4, b: 4, c: 1 } }), members);
    expect(anyScore('rounds', tied)).toBe(true);
    const a = tied.find((s) => s.id === 'a')!;
    const c = tied.find((s) => s.id === 'c')!;
    expect(raceVerdict('rounds', tied, a)).toBe('You shared 1st place with 4 points.');
    expect(raceVerdict('rounds', tied, c)).toBe('You came 3rd with 1 point.');
  });

  it('says how the others stand on the puzzle', () => {
    const live = raceStandings(race({ results: { a: { ok: true, ms: 4321 } } }), members);
    const [b, a, c] = [live[0]!, live[1]!, live[2]!];
    expect(othersLine([])).toBe('Nobody else is racing.');
    expect(othersLine([a])).toBe(`${a.name} solved it.`);
    expect(othersLine([b])).toBe(`${b.name} is solving.`);
    expect(othersLine([b, c])).toBe('The other 2 are solving.');
    expect(othersLine([a, b, c])).toBe('1 of the other 3 solved it.');
  });
});

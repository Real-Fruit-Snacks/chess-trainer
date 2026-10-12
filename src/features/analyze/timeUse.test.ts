import { describe, expect, it } from 'vitest';
import type { LongColor } from '@/chess/types';
import type { MoveJudgement } from '@/components/chess/MoveList';
import type { ReviewSummary } from './gameReview';
import {
  durationWords,
  formatClockReading,
  formatSpent,
  type GameTimes,
  gameTimes,
  gameTimesOfPgn,
  type MoveTime,
  moveNumberOfPly,
  parseTimeControl,
  readTimeUse,
  timeColumns,
  timeScaleMax,
  timeTroubleSeconds,
} from './timeUse';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SANS = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+'];

/** A clock in PGN form from seconds. */
function clk(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/** A PGN of the moves with a `[%clk]` after each (null: no reading). */
function pgnOf(clocks: (number | null)[], headers: Record<string, string>, sans = SANS): string {
  const head = Object.entries(headers)
    .map(([k, v]) => `[${k} "${v}"]`)
    .join('\n');
  const body = sans
    .map((san, i) => {
      const number = i % 2 === 0 ? `${i / 2 + 1}. ` : '';
      const clock = clocks[i];
      return `${number}${san}${clock === null || clock === undefined ? '' : ` {[%clk ${clk(clock)}]}`}`;
    })
    .join(' ');
  return `${head}\n\n${body} *`;
}

describe('time controls', () => {
  it('reads the TimeControl header', () => {
    expect(parseTimeControl('600+5')).toEqual({ kind: 'clock', base: 600, increment: 5 });
    expect(parseTimeControl('600')).toEqual({ kind: 'clock', base: 600, increment: 0 });
    expect(parseTimeControl('15+0')).toEqual({ kind: 'clock', base: 15, increment: 0 });
    expect(parseTimeControl('-')).toEqual({ kind: 'clock', base: null, increment: 0 });
    expect(parseTimeControl(undefined)).toEqual({ kind: 'clock', base: null, increment: 0 });
    expect(parseTimeControl('40/7200:3600')).toEqual({ kind: 'clock', base: null, increment: 0 });
    expect(parseTimeControl('1/86400')).toEqual({ kind: 'per-move' });
  });

  it('calls a tenth of the clock time trouble, from 10 seconds to a minute', () => {
    expect(timeTroubleSeconds(60)).toBe(10);
    expect(timeTroubleSeconds(120)).toBe(10);
    expect(timeTroubleSeconds(180)).toBe(15);
    expect(timeTroubleSeconds(300)).toBe(30);
    expect(timeTroubleSeconds(600)).toBe(60);
    expect(timeTroubleSeconds(5400)).toBe(60);
    expect(timeTroubleSeconds(null)).toBe(30);
  });
});

describe('gameTimes', () => {
  it('works out each move’s time from the clocks and the increment (Lichess: clocks start after the first moves)', () => {
    const pgn = pgnOf([180, 180, 179, 178, 175, 170, 160, 168, 150, 161, 149, 120], {
      TimeControl: '180+2',
    });
    const times = gameTimesOfPgn(pgn);
    expect(times).not.toBeNull();
    expect(times?.base).toBe(180);
    expect(times?.increment).toBe(2);
    expect(times?.trouble).toBe(15);
    expect(times?.moves.map((m) => m.spent)).toEqual([0, 0, 3, 4, 6, 10, 17, 4, 12, 9, 3, 43]);
    expect(times?.moves[2]).toEqual({
      ply: 3,
      san: 'Nf3',
      mover: 'white',
      before: 180,
      after: 179,
      spent: 3,
    });
    expect(times?.moves.map((m) => m.mover).slice(0, 3)).toEqual(['white', 'black', 'white']);
  });

  it('counts the first move too where the site adds the increment to it (chess.com)', () => {
    const times = gameTimesOfPgn(
      pgnOf(
        [290.5, 302.9, 280, 290, 270, 280, 260, 270],
        { TimeControl: '300+3' },
        SANS.slice(0, 8),
      ),
    );
    expect(times?.moves.map((m) => m.spent)).toEqual([12.5, 0, 13.5, 15.9, 13, 13, 13, 13]);
  });

  it('leaves a move’s time unknown around a missing reading, and takes [%emt] as it comes', () => {
    const clocks = [600, 600, 590, 580, null, 570, 560, 560, 550, 550, 540, 540];
    const times = gameTimesOfPgn(pgnOf(clocks, { TimeControl: '600' }));
    // White's fifth ply has no reading: it and White's next move are unknown.
    expect(times?.moves.map((m) => m.spent)).toEqual([
      0,
      0,
      10,
      20,
      null,
      10,
      null,
      10,
      10,
      10,
      10,
      10,
    ]);
    const emt = gameTimesOfPgn(
      '[TimeControl "-"]\n\n1. e4 {[%emt 0:00:03]} e5 {[%emt 0:00:05]} 2. Nf3 {[%emt 0:00:01]} Nc6 {[%emt 0:00:09]} 3. Bb5 {[%emt 0:00:30]} a6 {[%emt 0:01:00]} *',
    );
    expect(emt?.moves.map((m) => m.spent)).toEqual([3, 5, 1, 9, 30, 60]);
    expect(emt?.base).toBeNull();
  });

  it('starts with Black when the position does', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const nodes = ['e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'].map((san, i) => ({
      san,
      commands: [{ name: 'clk', args: clk(300 - i * 5) }],
    }));
    const times = gameTimes(nodes, { TimeControl: '300' }, fen);
    expect(times?.moves.map((m) => m.mover)).toEqual([
      'black',
      'white',
      'black',
      'white',
      'black',
      'white',
    ]);
    expect(moveNumberOfPly(1, fen)).toBe(1);
    expect(moveNumberOfPly(2, fen)).toBe(2);
    expect(moveNumberOfPly(3, START)).toBe(2);
  });

  it('needs clock times on most moves, and none for correspondence games', () => {
    const few = [180, 180, 179, null, null, null, null, null, null, null, null, null];
    expect(gameTimesOfPgn(pgnOf(few, { TimeControl: '180+2' }))).toBeNull();
    const most = [180, 180, 179, 178, 175, 170, 160, 168, 150, null, null, null];
    // Nine of twelve is three quarters: enough.
    expect(gameTimesOfPgn(pgnOf(most, { TimeControl: '180+2' }))).not.toBeNull();
    const fewer = [180, 180, 179, 178, 175, 170, 160, 168, null, null, null, null];
    expect(gameTimesOfPgn(pgnOf(fewer, { TimeControl: '180+2' }))).toBeNull();
    const daily = pgnOf([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], { TimeControl: '1/86400' });
    expect(gameTimesOfPgn(daily)).toBeNull();
    expect(gameTimesOfPgn('not a game')).toBeNull();
  });
});

describe('words and figures', () => {
  it('writes time spent compactly and clocks as clocks', () => {
    expect(formatSpent(0.43)).toBe('0.4 s');
    expect(formatSpent(4)).toBe('4 s');
    expect(formatSpent(12.4)).toBe('12 s');
    expect(formatSpent(80)).toBe('1 min 20 s');
    expect(formatSpent(360)).toBe('6 min');
    expect(formatSpent(3900)).toBe('1 h 5 min');
    expect(formatClockReading(581.3)).toBe('9:41');
    expect(formatClockReading(3723)).toBe('1:02:03');
    expect(formatClockReading(8.44)).toBe('8.4');
  });

  it('spells durations out in sentences', () => {
    expect(durationWords(0.3)).toBe('under a second');
    expect(durationWords(1)).toBe('a second');
    expect(durationWords(30)).toBe('30 seconds');
    expect(durationWords(60)).toBe('a minute');
    expect(durationWords(95)).toBe('95 seconds');
    expect(durationWords(361)).toBe('6 minutes');
    expect(durationWords(268)).toBe('4 minutes 30 seconds');
    expect(durationWords(965)).toBe('16 minutes');
    expect(durationWords(3600)).toBe('1 hour');
    expect(durationWords(3960)).toBe('1 hour 6 minutes');
  });

  it('puts the top of the scale at a round figure', () => {
    expect(timeScaleMax(0)).toBe(5);
    expect(timeScaleMax(12)).toBe(15);
    expect(timeScaleMax(61)).toBe(90);
    expect(timeScaleMax(360)).toBe(600);
    expect(timeScaleMax(9000)).toBe(10800);
  });
});

function moveTime(
  ply: number,
  san: string,
  spent: number | null,
  before: number | null,
  after: number | null = before !== null && spent !== null ? before - spent : null,
): MoveTime {
  return { ply, san, mover: ply % 2 === 1 ? 'white' : 'black', before, after, spent };
}

function reviewOf(times: GameTimes, judgements: Record<number, MoveJudgement>): ReviewSummary {
  return {
    moves: times.moves.map((m) => ({
      ply: m.ply,
      san: m.san,
      mover: m.mover,
      winBefore: 0.5,
      winAfter: 0.5,
      loss: judgements[m.ply] ? 0.3 : 0,
      judgement: judgements[m.ply] ?? 'good',
      best: null,
      bestUci: null,
      scoreBefore: null,
      fen: START,
      scoreAfter: null,
      bestPv: [],
      replyUci: null,
      replyPv: [],
    })),
    counts: {
      white: { inaccuracy: 0, mistake: 0, blunder: 0 },
      black: { inaccuracy: 0, mistake: 0, blunder: 0 },
    },
    accuracy: { white: 90, black: 90 },
    wins: [],
    depth: 12,
  };
}

/** A 5-minute game of `count` plies: every move takes `spent` seconds unless `special` says otherwise. */
function blitz(
  count: number,
  special: Record<number, { spent: number; before?: number }> = {},
): GameTimes {
  const left: Record<LongColor, number> = { white: 300, black: 300 };
  const moves: MoveTime[] = [];
  for (let ply = 1; ply <= count; ply++) {
    const mover: LongColor = ply % 2 === 1 ? 'white' : 'black';
    const before = special[ply]?.before ?? left[mover];
    const spent = special[ply]?.spent ?? 5;
    moves.push({ ...moveTime(ply, `m${ply}`, spent, before), mover });
    left[mover] = before - spent;
  }
  return { moves, base: 300, increment: 0, trouble: 30 };
}

describe('timeColumns', () => {
  it('pairs the moves by move number with the review’s verdicts and the time-trouble flags', () => {
    const times = blitz(5, { 4: { spent: 2, before: 20 } });
    const columns = timeColumns(times, reviewOf(times, { 4: 'blunder' }), START);
    expect(columns.map((c) => c.moveNumber)).toEqual([1, 2, 3]);
    expect(columns[1]?.black).toMatchObject({ ply: 4, judgement: 'blunder', trouble: true });
    expect(columns[1]?.white).toMatchObject({ ply: 3, judgement: 'good', trouble: false });
    expect(columns[2]?.black).toBeNull();
    // A review of other moves (the main line changed) gives no verdicts.
    const stale = reviewOf(times, { 4: 'blunder' });
    stale.moves[3] = { ...stale.moves[3]!, san: 'Qh5' };
    expect(timeColumns(times, stale, START)[1]?.black?.judgement).toBeNull();
  });
});

describe('readTimeUse', () => {
  it('tells the learner how many of their mistakes came short of time, and their longest think', () => {
    const times = blitz(40, {
      11: { spent: 120 },
      9: { spent: 40 },
      35: { spent: 3, before: 25 },
      37: { spent: 2, before: 18 },
    });
    const review = reviewOf(times, { 9: 'mistake', 35: 'blunder', 37: 'mistake', 20: 'blunder' });
    expect(readTimeUse(times, review, { learner: 'white', startFen: START })).toEqual([
      '2 of your 3 mistakes came with under 30 seconds left.',
      'You spent 2 minutes on move 6, m11.',
    ]);
  });

  it('speaks of both sides when the learner’s is unknown', () => {
    const times = blitz(40, {
      28: { spent: 400 },
      35: { spent: 3, before: 25 },
      36: { spent: 3, before: 12 },
    });
    const review = reviewOf(times, { 35: 'blunder', 36: 'mistake', 28: 'mistake' });
    expect(readTimeUse(times, review, { learner: null, startFen: START })).toEqual([
      'White’s only mistake came with under 30 seconds left.',
      '1 of Black’s 2 mistakes came with under 30 seconds left.',
      'Black spent 6 minutes 40 seconds on move 14, m28 — a mistake.',
    ]);
  });

  it('notices mistakes played in a hurry with time on the clock', () => {
    const rapid = { ...blitz(30, { 12: { spent: 3, before: 400 } }), base: 600, trouble: 60 };
    const review = reviewOf(rapid, { 12: 'blunder' });
    expect(readTimeUse(rapid, review, { learner: 'black', startFen: START })).toEqual([
      'Your only mistake took 3 seconds, with 6 minutes 40 seconds on the clock.',
    ]);
    const several = blitz(30, {
      6: { spent: 2 },
      12: { spent: 4 },
      18: { spent: 25 },
    });
    expect(
      readTimeUse(several, reviewOf(several, { 6: 'mistake', 12: 'blunder', 18: 'mistake' }), {
        learner: 'black',
        startFen: START,
      })[0],
    ).toBe('2 of your 3 mistakes took under 6 seconds, with time to spare.');
  });

  it('says how low the clock ran when it cost no mistake, and nothing much for a calm game', () => {
    const times = blitz(40, { 39: { spent: 3, before: 11 } });
    expect(readTimeUse(times, reviewOf(times, {}), { learner: 'white', startFen: START })).toEqual([
      'You were down to 8 seconds by move 20.',
    ]);
    const calm = blitz(20);
    expect(readTimeUse(calm, null, { learner: null, startFen: START })).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { DailyOpeningState } from '@/store/progress';
import {
  afterGuess,
  candidateLines,
  dailyLine,
  dayToDate,
  dayToShow,
  describeToday,
  giveUp,
  gradeGuess,
  guessableLines,
  guessesTaken,
  hints,
  inProgress,
  knownPrefix,
  liveStreak,
  MAX_GUESSES,
  movesToPgn,
  searchLines,
  shareText,
  stateForDay,
} from './dailyOpening';
import type { OpeningLine } from './openingLines';

const line = (name: string, moves: string, eco = 'C50'): OpeningLine => ({
  eco,
  name,
  moves: moves.split(' '),
});

const BOOK: OpeningLine[] = [
  line('Italian Game', 'e4 e5 Nf3 Nc6 Bc4'),
  line('Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'),
  line('Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'),
  line('Scotch Game', 'e4 e5 Nf3 Nc6 d4', 'C45'),
  line('Sicilian Defense: Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'B90'),
  line('Amar Opening', 'Nh3', 'A00'),
  line(
    'Very Long Line',
    'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7',
    'C95',
  ),
];

describe('daily opening', () => {
  it('keeps unique names of a sensible length as answers', () => {
    const names = candidateLines(BOOK).map((l) => l.name);
    expect(names).toEqual(['Italian Game: Giuoco Piano', 'Sicilian Defense: Najdorf Variation']);
    expect(guessableLines(BOOK)).toHaveLength(6);
  });

  it('draws the answers from the very entries the guesses use', () => {
    // A name whose first line is too short and whose second line would fit: the second
    // line used to be the answer, while the list (and every guess) showed the first.
    const book = [
      line('Queen’s Gambit', 'd4 d5 c4'),
      line('Queen’s Gambit', 'd4 d5 c4 e6 Nc3 Nf6', 'D35'),
      line('Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5 a6', 'C70'),
    ];
    const guessable = new Map(guessableLines(book).map((l) => [l.name, l]));
    const candidates = candidateLines(book);
    expect(candidates.map((l) => l.name)).toEqual(['Ruy Lopez']);
    for (const answer of candidates) {
      // The answer is exactly the entry a guess of its name brings up.
      expect(guessable.get(answer.name)).toBe(answer);
      expect(gradeGuess(answer, answer).every((t) => t === 'hit')).toBe(true);
    }
  });

  it('picks the same line for the same day and different lines on other days', () => {
    const candidates = candidateLines(BOOK);
    const a = dailyLine(candidates, '2026-10-01');
    expect(dailyLine(candidates, '2026-10-01')).toBe(a);
    const picks = new Set(
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map(
        (d) => dailyLine(candidates, d).name,
      ),
    );
    expect(picks.size).toBe(2);
  });

  it('grades guesses move by move like Wordle', () => {
    const answer = line('Scotch Game', 'e4 e5 Nf3 Nc6 d4');
    expect(gradeGuess(line('Italian Game', 'e4 e5 Nf3 Nc6 Bc4'), answer)).toEqual([
      'hit',
      'hit',
      'hit',
      'hit',
      'miss',
    ]);
    // d4 appears later in the answer: "near"; moves beyond its length are "extra".
    expect(gradeGuess(line('Queen pawn', 'd4 d5 Nf3 Nf6 c4 e6'), answer)).toEqual([
      'near',
      'miss',
      'hit',
      'miss',
      'miss',
      'extra',
    ]);
    // Each answer move can only be matched once: the second Nf3 has nothing left to match.
    expect(gradeGuess(line('Double', 'Nf3 Nf3 e4'), line('x', 'e4 Nf3 e5'))).toEqual([
      'miss',
      'hit',
      'near',
    ]);
  });

  it('knows the prefix placed correctly so far', () => {
    const answer = line('Scotch Game', 'e4 e5 Nf3 Nc6 d4');
    expect(knownPrefix([], answer)).toEqual([]);
    expect(knownPrefix([line('a', 'e4 c5 Nf3 Nc6 d4')], answer)).toEqual(['e4']);
    expect(knownPrefix([line('a', 'e4 c5'), line('b', 'd4 e5 Nf3')], answer)).toEqual([
      'e4',
      'e5',
      'Nf3',
    ]);
  });

  it('unlocks hints as guesses go wrong', () => {
    const answer = line('Sicilian Defense: Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4', 'B90');
    expect(hints(answer, 0)).toEqual(['6 moves (3 for White).', 'ECO B.']);
    expect(hints(answer, 2)).toContain('It starts with 1. e4.');
    expect(hints(answer, 3)).toContain('ECO B90.');
    expect(hints(answer, 4)).toContain('It is a line of the Sicilian Defence.');
  });

  it('finds a name whichever way "Defence" or "Centre" is spelt', () => {
    const all = guessableLines(BOOK);
    const names = (query: string) => searchLines(all, query).map((l) => l.name);
    expect(names('sicilian defence')).toEqual(['Sicilian Defense: Najdorf Variation']);
    expect(names('sicilian defense')).toEqual(['Sicilian Defense: Najdorf Variation']);
  });

  it('searches names by every typed word, shortest first', () => {
    const all = guessableLines(BOOK);
    expect(searchLines(all, 'italian').map((l) => l.name)).toEqual([
      'Italian Game',
      'Italian Game: Giuoco Piano',
    ]);
    expect(searchLines(all, 'sic naj')).toHaveLength(1);
    expect(searchLines(all, 'x')).toEqual([]);
  });

  it('tracks a day from first guess to solve and keeps the streak across days', () => {
    const answer = line('Scotch Game', 'e4 e5 Nf3 Nc6 d4');
    let state = stateForDay(null, '2026-10-01');
    state = afterGuess(state, line('Italian Game', 'e4 e5 Nf3 Nc6 Bc4'), answer);
    expect(state.result).toBeNull();
    expect(state.guesses).toEqual(['Italian Game']);
    state = afterGuess(state, answer, answer);
    expect(state.result).toBe('solved');
    expect(state.streak).toBe(1);
    expect(state.history['2026-10-01']).toBe(2);
    // The next day keeps the history and continues the streak when solved.
    let next = stateForDay(state, '2026-10-02');
    expect(next.guesses).toEqual([]);
    expect(next.result).toBeNull();
    next = afterGuess(next, answer, answer);
    expect(next.streak).toBe(2);
    expect(next.bestStreak).toBe(2);
    // A skipped day breaks it.
    let later = stateForDay(next, '2026-10-05');
    later = afterGuess(later, answer, answer);
    expect(later.streak).toBe(1);
    expect(later.bestStreak).toBe(2);
  });

  it('fails after the last wrong guess or on giving up', () => {
    const answer = line('Scotch Game', 'e4 e5 Nf3 Nc6 d4');
    let state = stateForDay({ ...stateForDay(null, '2026-10-01'), streak: 3 }, '2026-10-01');
    for (let i = 0; i < MAX_GUESSES; i++) {
      state = afterGuess(state, line(`wrong ${i}`, 'd4 d5'), answer);
    }
    expect(state.result).toBe('failed');
    expect(state.streak).toBe(0);
    expect(state.history['2026-10-01']).toBe(0);
    const given = giveUp(stateForDay(null, '2026-10-02'));
    expect(given.result).toBe('failed');
    expect(afterGuess(given, answer, answer).result).toBe('failed');
  });

  it('formats a shareable result and numbered movetext', () => {
    expect(
      shareText(
        '2026-10-01',
        [
          ['hit', 'miss', 'near', 'extra'],
          ['hit', 'hit', 'hit'],
        ],
        true,
      ),
    ).toBe('Daily Opening 2026-10-01 2/6\nG-Y+\nGGG');
    expect(shareText('2026-10-01', [['miss']], false)).toMatch(/X\/6/);
    expect(movesToPgn(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
  });

  it('never makes a day in the history playable again', () => {
    const answer = line('Scotch Game', 'e4 e5 Nf3 Nc6 d4');
    let state = stateForDay(null, '2026-10-01');
    state = afterGuess(state, line('Italian Game', 'e4 e5 Nf3 Nc6 Bc4'), answer);
    state = afterGuess(state, answer, answer);
    const next = afterGuess(stateForDay(state, '2026-10-02'), answer, answer);
    // The clock goes back a day (a trip west): the solved day comes back finished.
    const back = stateForDay(next, '2026-10-01');
    expect(back.result).toBe('solved');
    expect(guessesTaken(back)).toBe(2);
    expect(afterGuess(back, answer, answer)).toBe(back);
    expect(giveUp(back)).toBe(back);
    expect(back.streak).toBe(next.streak);
    // A missed day stays missed.
    const missed = giveUp(stateForDay(next, '2026-10-03'));
    expect(stateForDay(missed, '2026-10-03').result).toBe('failed');
    expect(stateForDay({ ...missed, date: '2026-10-04' }, '2026-10-03').result).toBe('failed');
  });

  it('knows when a game of the day is under way', () => {
    const answer = line('Scotch Game', 'e4 e5 Nf3 Nc6 d4');
    const fresh = stateForDay(null, '2026-10-01');
    expect(inProgress(fresh, '2026-10-01')).toBe(false);
    const started = afterGuess(fresh, line('a', 'd4 d5'), answer);
    expect(inProgress(started, '2026-10-01')).toBe(true);
    expect(inProgress(started, '2026-10-02')).toBe(false);
    expect(inProgress(giveUp(started), '2026-10-01')).toBe(false);
    expect(inProgress(null, '2026-10-01')).toBe(false);
  });

  it('freezes the day while its game is under way and moves on otherwise', () => {
    const answer = line('Scotch Game', 'e4 e5 Nf3 Nc6 d4');
    const started = afterGuess(stateForDay(null, '2026-10-01'), line('a', 'd4 d5'), answer);
    // Midnight mid-game: the answer stays the one of the day the game started on.
    expect(dayToShow('2026-10-01', '2026-10-02', started, false)).toBe('2026-10-01');
    expect(dayToShow('2026-10-01', '2026-10-02', started, true)).toBe('2026-10-01');
    // Not started: the new day at once.
    expect(dayToShow('2026-10-01', '2026-10-02', null, false)).toBe('2026-10-02');
    expect(dayToShow('2026-10-01', '2026-10-02', stateForDay(null, '2026-09-30'), false)).toBe(
      '2026-10-02',
    );
    // Finished: the result stays on screen until the page is revisited.
    const finished = giveUp(started);
    expect(dayToShow('2026-10-01', '2026-10-02', finished, false)).toBe('2026-10-01');
    expect(dayToShow('2026-10-01', '2026-10-02', finished, true)).toBe('2026-10-02');
    // Same day: nothing to do.
    expect(dayToShow('2026-10-01', '2026-10-01', finished, true)).toBe('2026-10-01');
  });

  it('shows the streak only while it is unbroken', () => {
    const state: DailyOpeningState = {
      date: '2026-10-01',
      guesses: ['x'],
      result: 'solved',
      streak: 4,
      bestStreak: 6,
      history: { '2026-09-30': 2, '2026-10-01': 1 },
    };
    expect(liveStreak(state, '2026-10-01')).toBe(4);
    // Solved yesterday, today still to play: alive.
    expect(liveStreak(state, '2026-10-02')).toBe(4);
    // A day missed since: broken, whatever the stored number says.
    expect(liveStreak(state, '2026-10-03')).toBe(0);
    // Today failed: broken.
    expect(
      liveStreak({ ...state, history: { ...state.history, '2026-10-02': 0 } }, '2026-10-02'),
    ).toBe(0);
    expect(liveStreak(null, '2026-10-02')).toBe(0);
  });

  it('describes today for the hub', () => {
    const base: DailyOpeningState = {
      date: '2026-10-01',
      guesses: ['a', 'b', 'c'],
      result: 'solved',
      streak: 2,
      bestStreak: 5,
      history: { '2026-09-30': 3, '2026-10-01': 3 },
    };
    expect(describeToday(null, '2026-10-01')).toBeNull();
    expect(describeToday(base, '2026-10-01')).toBe('Today: solved in 3 · streak 2 · best 5');
    expect(describeToday(base, '2026-10-02')).toBe('Today: not played yet · streak 2 · best 5');
    // Days later the streak is gone; the best stays.
    expect(describeToday(base, '2026-10-05')).toBe('Today: not played yet · best 5');
    // After the first guess of a learner's first day: no "Streak 0 · best 0 · 0 days played".
    const first: DailyOpeningState = {
      date: '2026-10-05',
      guesses: ['a'],
      result: null,
      streak: 0,
      bestStreak: 0,
      history: {},
    };
    expect(describeToday(first, '2026-10-05')).toBe(`Today: 1 of ${MAX_GUESSES} guesses`);
    expect(
      describeToday({ ...first, result: 'failed', history: { '2026-10-05': 0 } }, '2026-10-05'),
    ).toBe('Today: missed');
  });

  it('reads a day as a local date, not as UTC midnight', () => {
    const date = dayToDate('2026-10-02');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(2);
    expect(date.getHours()).toBe(0);
  });
});

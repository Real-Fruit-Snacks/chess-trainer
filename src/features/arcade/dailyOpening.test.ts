import { describe, expect, it } from 'vitest';
import {
  afterGuess,
  candidateLines,
  dailyLine,
  giveUp,
  gradeGuess,
  guessableLines,
  hints,
  knownPrefix,
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
    expect(hints(answer, 4)).toContain('It is a line of the Sicilian Defense.');
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
});

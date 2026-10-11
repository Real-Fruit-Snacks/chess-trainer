import { describe, expect, it } from 'vitest';
import { GAMES } from '../../../relay/src/live/shared.mjs';
import {
  duelEndSentence,
  duelEndTitle,
  duelGoal,
  duelVerdict,
  points,
  resultWords,
  roundWinnerWords,
  scores,
  seconds,
} from './duelView';
import {
  describeOptions,
  describeSeek,
  gameName,
  gameNoun,
  isDuelKind,
  ONLINE_GAMES,
  optionsFor,
} from './onlineGames';
import type { DuelView } from './types';

describe('the games online', () => {
  it('names and describes every game the relay plays', () => {
    expect(ONLINE_GAMES.map((g) => g.kind).sort()).toEqual(
      GAMES.filter((g) => g !== 'chess').sort(),
    );
    expect(gameName('chess')).toBe('Chess');
    expect(gameName('judge')).toBe('Who Stands Better? duel');
    expect(isDuelKind('race')).toBe(true);
    expect(isDuelKind('army')).toBe(false);
    for (const game of ONLINE_GAMES) {
      expect(game.description).toMatch(/\.$/);
      expect(optionsFor(game.kind, game.defaults)).toEqual(game.defaults);
    }
  });

  it('describes a posted game in one line', () => {
    expect(describeSeek({ game: 'chess', opts: {}, tc: '5+3', color: 'random' })).toBe(
      '5+3 · Blitz · Random colour',
    );
    expect(describeSeek({ game: 'army', opts: { budget: 30 }, tc: '10+0', color: 'white' })).toBe(
      'Army Draft · 30 points · 10+0 · Plays white',
    );
    expect(describeSeek({ game: 'blindfold', opts: {}, tc: '15+10', color: 'black' })).toBe(
      'Blindfold · 15+10 · Plays black',
    );
    expect(
      describeSeek({
        game: 'race',
        opts: { format: 'window', level: 1800 },
        tc: null,
        color: 'random',
      }),
    ).toBe('Puzzle race · Best of three, 15-second window · 1800');
    expect(
      describeSeek({ game: 'arbiter', opts: { pace: 'slow' }, tc: null, color: 'random' }),
    ).toBe('Arbiter duel · Slow pace');
    expect(describeSeek({ game: 'judge', opts: {}, tc: null, color: 'random' })).toBe(
      'Who Stands Better? duel',
    );
    expect(describeOptions('race', { format: 'timed', level: 900 })).toBe(
      'Three-minute race · 900',
    );
    expect(gameNoun('chess', '3+0')).toBe('3+0 game');
    expect(gameNoun('race', null)).toBe('puzzle race');
    // Options that are not the game's fall back to its defaults.
    expect(optionsFor('army', { budget: 31 })).toEqual({ budget: 30 });
  });
});

function duel(patch: Partial<DuelView> = {}): DuelView {
  return {
    id: 'D',
    connection: 'open',
    missing: false,
    you: 'black',
    host: false,
    white: { name: 'Swift Knight', rating: null },
    black: { name: 'Patient Bishop', rating: 1500 },
    game: 'race',
    opts: { format: 'best3', level: 1500 },
    status: 'over',
    setupDeadline: null,
    items: null,
    round: 2,
    phase: null,
    phaseEnds: null,
    liveSince: null,
    mine: null,
    theirs: null,
    rounds: [],
    score: { white: 1.5, black: 2 },
    progress: null,
    result: '0-1',
    reason: 'score',
    offers: { rematch: null },
    opponentPresent: true,
    chat: [],
    next: null,
    error: null,
    preparing: false,
    ...patch,
  };
}

describe('duels in words', () => {
  it('says how a duel ended, from this side', () => {
    expect(duelVerdict(duel())).toBe('win');
    expect(duelVerdict(duel({ result: '1-0' }))).toBe('loss');
    expect(duelVerdict(duel({ result: '1/2-1/2' }))).toBe('draw');
    expect(duelVerdict(duel({ result: '*', reason: 'aborted' }))).toBe('aborted');
    expect(duelEndTitle('win')).toBe('You won!');
    expect(duelEndSentence(duel(), 'Swift Knight')).toBe('2 rounds to 1½.');
    expect(duelEndSentence(duel({ result: '1-0', reason: 'resign' }), 'Swift Knight')).toBe(
      'You resigned.',
    );
    expect(duelEndSentence(duel({ reason: 'resign' }), 'Swift Knight')).toBe(
      'Swift Knight resigned.',
    );
    expect(duelEndSentence(duel({ result: '*', reason: 'no-start' }), 'Swift Knight')).toMatch(
      /never started/,
    );
    const timed = duel({
      opts: { format: 'timed', level: 1200 },
      progress: {
        white: { index: 9, solved: 7, strikes: 2, done: true },
        black: { index: 12, solved: 11, strikes: 1, done: false },
      },
    });
    expect(scores(timed)).toEqual({ mine: '11', theirs: '7' });
    expect(duelEndSentence(timed, 'Swift Knight')).toBe('11 solved to 7.');
    expect(
      duelEndSentence(duel({ game: 'judge', opts: {}, score: { white: 180, black: 251 } }), 'X'),
    ).toBe('251 points to 180.');
  });

  it('says what wins, and how each result went', () => {
    expect(duelGoal(duel())).toBe('First to 2 rounds');
    expect(duelGoal(duel({ opts: { format: 'window', level: 900 } }))).toMatch(
      /15 s share a round/,
    );
    expect(duelGoal(duel({ game: 'arbiter', opts: { pace: 'normal' } }))).toBe('First to 3 rounds');
    expect(duelGoal(duel({ game: 'judge', opts: {} }))).toBe('The higher total after 5 positions');
    expect(resultWords({ ok: true, ms: 7950 })).toBe('Solved in 7.95 s');
    expect(resultWords({ ok: false, ms: 1 })).toBe('Missed');
    expect(resultWords({ call: 'caught', ms: 620 })).toBe('Called in 0.62 s');
    expect(resultWords({ call: 'false', ms: 1 })).toBe('Called a legal move');
    expect(resultWords({ call: 'missed', ms: 0 })).toBe('Missed it');
    expect(resultWords({ guess: 1.2 })).toBe('White is better (1.2)');
    expect(resultWords({ locked: true })).toBe('Locked in');
    expect(resultWords(null)).toBe('Nothing yet');
    expect(roundWinnerWords('black', 'black', 'X')).toBe('You');
    expect(roundWinnerWords('white', 'black', 'X')).toBe('X');
    expect(roundWinnerWords('shared', 'black', 'X')).toBe('Shared');
    expect(roundWinnerWords(null, 'black', 'X')).toBe('Nobody');
    expect(points(0.5)).toBe('½');
    expect(points(2)).toBe('2');
    expect(seconds(1234)).toBe('1.23 s');
  });
});

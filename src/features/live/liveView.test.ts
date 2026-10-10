import { describe, expect, it } from 'vitest';
import {
  canAskTakeback,
  clockRemaining,
  describeTimeControl,
  endSentence,
  endSummary,
  endTitle,
  formatCountdown,
  formatElapsed,
  joinLink,
  lichessStatus,
  myColorText,
  opponentOf,
  othersHere,
  posterColorText,
  relayStatus,
  speedName,
  verdictOf,
} from './liveView';
import { replayMoves } from './liveViewBoard';
import type { LiveEndReason, LiveGameView } from './types';

describe('time controls', () => {
  it('names the speed the way Lichess does', () => {
    expect(speedName('1+0')).toBe('Bullet');
    expect(speedName('2+1')).toBe('Bullet');
    expect(speedName('3+0')).toBe('Blitz');
    expect(speedName('5+3')).toBe('Blitz');
    expect(speedName('10+0')).toBe('Rapid');
    expect(speedName('15+10')).toBe('Rapid');
    expect(speedName('30+0')).toBe('Classical');
    expect(speedName('nonsense')).toBeNull();
    expect(describeTimeControl('5+3')).toBe('5+3 · Blitz');
    expect(describeTimeControl('5:3')).toBe('5:3');
  });
});

describe('words for the waiting room', () => {
  it('says which colour a poster takes, and which this device asked for', () => {
    expect(posterColorText('white')).toBe('Plays white');
    expect(posterColorText('black')).toBe('Plays black');
    expect(posterColorText('random')).toBe('Random colour');
    expect(myColorText('white')).toBe('You play white');
    expect(myColorText('random')).toBe('Random colour');
  });

  it('counts the other players, not this device', () => {
    expect(othersHere(0)).toBe('Nobody else is here right now');
    expect(othersHere(1)).toBe('Nobody else is here right now');
    expect(othersHere(2)).toBe('1 other player here');
    expect(othersHere(13)).toBe('12 other players here');
  });

  it('makes the link that joins a posted game', () => {
    expect(joinLink('abcdefghijklmnopqrstuv')).toBe(
      `${window.location.origin}/play/online?join=abcdefghijklmnopqrstuv`,
    );
  });

  it('describes where the posted game is', () => {
    expect(relayStatus('posted')).toEqual({ text: 'Here: posted', tone: 'done' });
    expect(relayStatus('posting')).toEqual({ text: 'Here: posting…', tone: 'busy' });
    expect(relayStatus('failed')).toEqual({ text: 'Here: failed', tone: 'problem' });
    const off = { status: 'off', rated: false, message: null } as const;
    expect(lichessStatus(off)).toBeNull();
    expect(lichessStatus({ ...off, status: 'posted' })?.text).toBe('On Lichess: posted');
    expect(lichessStatus({ ...off, status: 'checking' })?.tone).toBe('busy');
    expect(
      lichessStatus({ ...off, status: 'failed', message: 'Lichess did not answer.' })?.text,
    ).toBe('On Lichess: failed: Lichess did not answer.');
    expect(lichessStatus({ ...off, status: 'failed' })?.text).toBe('On Lichess: failed');
    expect(
      lichessStatus({
        ...off,
        status: 'needs-permission',
        message: 'Allow live games to play there.',
      }),
    ).toEqual({ text: 'On Lichess: Allow live games to play there.', tone: 'problem' });
    expect(lichessStatus({ ...off, status: 'not-allowed' })?.text).toBe(
      'On Lichess: apps may post rapid and slower games only.',
    );
  });
});

describe('clocks', () => {
  const clock = { white: 60_000, black: 30_000, running: 'white' as const, at: 1000 };

  it('counts the running side down from when the clock was read', () => {
    expect(clockRemaining(clock, 'white', 1000)).toBe(60_000);
    expect(clockRemaining(clock, 'white', 11_500)).toBe(49_500);
    expect(clockRemaining(clock, 'black', 11_500)).toBe(30_000);
  });

  it('never goes below zero, nor above the stored time', () => {
    expect(clockRemaining(clock, 'white', 100_000)).toBe(0);
    expect(clockRemaining(clock, 'white', 500)).toBe(60_000);
    expect(clockRemaining({ ...clock, black: -20 }, 'black', 0)).toBe(0);
  });

  it('formats time gone by and time left', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(133_900)).toBe('2:13');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
    expect(formatCountdown(42_000)).toBe('0:42');
    expect(formatCountdown(41_100)).toBe('0:42');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

function view(patch: Partial<LiveGameView>): LiveGameView {
  return {
    source: 'relay',
    id: 'g',
    connection: 'open',
    missing: false,
    you: 'white',
    white: { name: 'Patient Bishop', rating: 1500 },
    black: { name: 'Swift Knight', rating: null },
    tc: '5+3',
    rated: false,
    moves: [],
    clock: null,
    firstMove: null,
    status: 'over',
    result: null,
    reason: null,
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    claimAt: null,
    chat: [],
    next: null,
    error: null,
    url: null,
    capabilities: { phrases: true, rematch: true, takeback: true },
    ...patch,
  };
}

describe('the end of a game', () => {
  it('reads the result from this device’s side', () => {
    expect(verdictOf(view({ result: '1-0', reason: 'checkmate' }))).toBe('win');
    expect(verdictOf(view({ result: '1-0', reason: 'checkmate', you: 'black' }))).toBe('loss');
    expect(verdictOf(view({ result: '0-1', reason: 'resign', you: 'black' }))).toBe('win');
    expect(verdictOf(view({ result: '1/2-1/2', reason: 'agreement' }))).toBe('draw');
    expect(verdictOf(view({ result: '1/2-1/2', reason: 'aborted' }))).toBe('aborted');
    expect(verdictOf(view({ result: null, reason: 'no-start' }))).toBe('aborted');
    expect(verdictOf(view({ result: '*', reason: 'other' }))).toBe('unknown');
    expect(endTitle('win')).toBe('You won!');
    expect(endTitle('loss')).toBe('You lost');
    expect(endTitle('draw')).toBe('Draw');
    expect(endTitle('aborted')).toBe('Game aborted');
  });

  it('says how it ended, naming the opponent where they did it', () => {
    const say = (result: LiveGameView['result'], reason: LiveEndReason, you = 'white' as const) =>
      endSentence(view({ result, reason, you }), 'Swift Knight');
    expect(say('1-0', 'checkmate')).toBe('By checkmate.');
    expect(say('0-1', 'time')).toBe('On time.');
    expect(say('1/2-1/2', 'time')).toBe(
      'Drawn on time: the side with time left could not have mated.',
    );
    expect(say('1-0', 'resign')).toBe('Swift Knight resigned.');
    expect(say('0-1', 'resign')).toBe('You resigned.');
    expect(say('1/2-1/2', 'agreement')).toBe('By agreement.');
    expect(say('1-0', 'abandoned')).toBe('Swift Knight left the game.');
    expect(say('1/2-1/2', 'abandoned')).toBe('Drawn: Swift Knight left the game.');
    expect(say('0-1', 'abandoned')).toBe('You left the game.');
    expect(say(null, 'no-start')).toBe('Nobody moved in time.');
    expect(say('1/2-1/2', 'repetition')).toBe('By threefold repetition.');
    expect(say('1/2-1/2', 'fifty-moves')).toBe('By the fifty-move rule.');
    expect(say('1/2-1/2', 'insufficient')).toBe('Insufficient material.');
    expect(say('1/2-1/2', 'stalemate')).toBe('Stalemate.');
    expect(say('1/2-1/2', 'draw')).toBe('The game was drawn.');
    expect(endSummary(view({ result: '1-0', reason: 'checkmate' }), 'Swift Knight')).toBe(
      'You won. By checkmate.',
    );
    expect(endSummary(view({ result: null, reason: 'aborted' }), 'Swift Knight')).toBe(
      'Game aborted. Aborted before both sides had moved.',
    );
  });

  it('finds the opponent', () => {
    expect(opponentOf(view({})).name).toBe('Swift Knight');
    expect(opponentOf(view({ you: 'black' })).name).toBe('Patient Bishop');
  });
});

describe('takebacks', () => {
  const after = (moves: number, you: 'white' | 'black', source: 'relay' | 'lichess' = 'relay') =>
    canAskTakeback({ moves: Array.from({ length: moves }, () => 'e2e4'), you, source });

  it('keeps the relay’s first two moves', () => {
    expect(after(2, 'black')).toBe(false);
    expect(after(3, 'white')).toBe(true);
    expect(after(3, 'black')).toBe(false);
    expect(after(4, 'white')).toBe(true);
  });

  it('on Lichess needs only a move of yours to undo', () => {
    expect(after(0, 'white', 'lichess')).toBe(false);
    expect(after(1, 'white', 'lichess')).toBe(true);
    expect(after(1, 'black', 'lichess')).toBe(false);
    expect(after(2, 'black', 'lichess')).toBe(true);
  });
});

describe('replaying the moves', () => {
  it('gives the position, the last move, the side to move and its moves', () => {
    const start = replayMoves([]);
    expect(start.turn).toBe('white');
    expect(start.lastMove).toBeNull();
    expect(start.dests.get('e2')).toEqual(['e3', 'e4']);

    const game = replayMoves(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']);
    expect(game.history.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']);
    expect(game.lastMove).toEqual(['e1', 'g1']);
    expect(game.turn).toBe('black');
    expect(game.check).toBe(false);
  });

  it('plays promotions and sees check', () => {
    const game = replayMoves(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(game.check).toBe(true);
    expect(game.chess.isCheckmate()).toBe(true);
    const promotion = replayMoves([
      'a2a4',
      'b7b5',
      'a4b5',
      'a7a6',
      'b5a6',
      'c8b7',
      'a6b7',
      'b8c6',
      'b7a8q',
    ]);
    expect(promotion.history.at(-1)?.san).toBe('bxa8=Q');
  });

  it('stops at a move that does not fit', () => {
    const game = replayMoves(['e2e4', 'e2e4', 'e7e5']);
    expect(game.history).toHaveLength(1);
    expect(game.turn).toBe('black');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { siteConfig } from '@/site.config';
import { sortedGames, useGames } from '@/store/games';
import { randomId } from '../../../relay/src/live/shared.mjs';
import { recordLiveGame } from './record';
import { rememberSeat } from './seats';
import type { LiveGameView } from './types';

const FOOLS_MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];

/** A finished relay game (Black mated White) seen from Black's seat. */
function finished(over: Partial<LiveGameView> = {}): LiveGameView {
  return {
    source: 'relay',
    id: randomId(16),
    connection: 'open',
    missing: false,
    you: 'black',
    white: { name: 'Patient Bishop', rating: 1500 },
    black: { name: 'Swift Knight', rating: null },
    tc: '5+3',
    rated: false,
    moves: FOOLS_MATE,
    clock: { white: 1000, black: 2000, running: null, at: 0 },
    firstMove: null,
    status: 'over',
    result: '0-1',
    reason: 'checkmate',
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    claimAt: null,
    chat: [],
    next: null,
    error: null,
    url: null,
    capabilities: { phrases: true, rematch: true, takeback: true },
    ...over,
  };
}

const games = () => sortedGames(useGames.getState().games);

describe('recording a live game', () => {
  beforeEach(() => useGames.getState().clear());

  it('keeps a relay game in My games, with the learner’s side and a full PGN', () => {
    const view = finished();
    const startedAt = new Date(2026, 9, 10, 18, 30).getTime();
    rememberSeat(view.id, randomId(32), 'black', startedAt);
    recordLiveGame(view);
    expect(games()).toHaveLength(1);
    const game = games()[0]!;
    expect(game).toMatchObject({
      source: 'online',
      side: 'black',
      url: null,
      white: 'Patient Bishop',
      black: 'Swift Knight',
      result: '0-1',
      date: '2026.10.10',
      event: 'Casual game · 5+3',
      plies: 4,
      speed: 'blitz',
      rated: false,
      timestamp: startedAt,
    });
    expect(game.pgn).toBe(
      [
        '[Event "Casual game · 5+3"]',
        `[Site "${siteConfig.siteUrl}"]`,
        '[Date "2026.10.10"]',
        '[White "Patient Bishop"]',
        '[Black "Swift Knight"]',
        '[Result "0-1"]',
        '[TimeControl "300+3"]',
        '[Termination "Normal"]',
        '',
        '1. f3 e5 2. g4 Qh4# 0-1',
      ].join('\n'),
    );
    // The relay's ratings are puzzle ratings: no Elo tags.
    expect(game.pgn).not.toMatch(/Elo/);
  });

  it('keeps each game once, even when it is told again or removed meanwhile', () => {
    const view = finished();
    recordLiveGame(view);
    recordLiveGame({ ...view });
    expect(games()).toHaveLength(1);
    useGames.getState().removeGame(games()[0]!.id);
    recordLiveGame(view);
    expect(games()).toHaveLength(0);
  });

  it('leaves out games that did not finish, or barely began', () => {
    recordLiveGame(finished({ status: 'playing', result: null, reason: null }));
    recordLiveGame(finished({ result: '*', reason: 'aborted', moves: ['e2e4', 'e7e5'] }));
    recordLiveGame(finished({ result: null }));
    recordLiveGame(finished({ result: '1-0', reason: 'resign', moves: ['e2e4'] }));
    // Moves that are not legal make no PGN.
    recordLiveGame(finished({ moves: ['e2e4', 'e2e4'] }));
    expect(games()).toHaveLength(0);
  });

  it('keeps a Lichess game under its link, with Lichess’s ratings', () => {
    recordLiveGame(
      finished({
        source: 'lichess',
        id: 'AbCd1234',
        rated: true,
        tc: '10+0',
        you: 'white',
        white: { name: 'learner', rating: 1720 },
        black: { name: 'someone', rating: 1810, title: 'FM' },
        result: '1-0',
        reason: 'time',
        moves: ['e2e4', 'e7e5', 'g1f3'],
      }),
    );
    const game = games()[0]!;
    expect(game).toMatchObject({
      id: 'https://lichess.org/AbCd1234',
      source: 'lichess',
      url: 'https://lichess.org/AbCd1234',
      side: 'white',
      rated: true,
      speed: 'rapid',
      event: 'Rated game on Lichess · 10+0',
    });
    expect(game.pgn).toContain('[Site "https://lichess.org/AbCd1234"]');
    expect(game.pgn).toContain('[WhiteElo "1720"]\n[BlackElo "1810"]');
    expect(game.pgn).toContain('[TimeControl "600+0"]');
    expect(game.pgn).toContain('[Termination "Time forfeit"]');
    expect(game.pgn).toMatch(/1\. e4 e5 2\. Nf3 1-0$/);
  });

  it('names a casual Lichess game, an abandoned one, and dates a game without a seat today', () => {
    recordLiveGame(
      finished({ source: 'lichess', id: 'Zz9yX8wV', rated: false, reason: 'abandoned' }),
    );
    const game = games()[0]!;
    expect(game.event).toBe('Casual game on Lichess · 5+3');
    expect(game.pgn).toContain('[Termination "Abandoned"]');
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(game.date).toBe(
      `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`,
    );
  });

  it('wraps the moves of a long game', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const moves = ['e2e4', 'e7e5', ...shuffle, 'b1c3', 'b8c6', 'c3b1', 'c6b8', ...shuffle];
    recordLiveGame(finished({ moves, result: '1/2-1/2', reason: 'repetition' }));
    const movetext = games()[0]!.pgn.split('\n\n')[1]!;
    expect(movetext.split('\n').every((line) => line.length <= 80)).toBe(true);
    expect(movetext.replace(/\n/g, ' ')).toBe(
      '1. e4 e5 2. Nf3 Nf6 3. Ng1 Ng8 4. Nc3 Nc6 5. Nb1 Nb8 6. Nf3 Nf6 7. Ng1 Ng8 1/2-1/2',
    );
  });
});

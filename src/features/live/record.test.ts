import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clockOf, parsePgn } from '@/chess/pgn';
import { mainLineOfPgn } from '@/features/games/gameStats';
import { siteConfig } from '@/site.config';
import { sortedGames, useGames } from '@/store/games';
import { randomId } from '../../../relay/src/live/shared.mjs';
import { draftFen } from '../../../relay/src/live/army.mjs';
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
    clocks: [],
    clock: { white: 1000, black: 2000, running: null, at: 0 },
    firstMove: null,
    status: 'over',
    result: '0-1',
    reason: 'checkmate',
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    present: { white: true, black: true },
    watching: false,
    watchers: 0,
    open: null,
    joined: null,
    claimAt: null,
    chat: [],
    next: null,
    rematchesLeft: null,
    analysis: null,
    error: null,
    url: null,
    game: 'chess',
    opts: {},
    startFen: null,
    draft: null,
    peeks: null,
    capabilities: { phrases: true, rematch: true, takeback: true },
    ...over,
  };
}

const games = () => sortedGames(useGames.getState().games);

describe('recording a live game', () => {
  beforeEach(() => useGames.getState().clear());
  afterEach(() => vi.useRealTimers());

  it('keeps a relay game in My games, with the learner’s side and a full PGN', () => {
    const view = finished();
    const startedAt = new Date(2026, 9, 10, 18, 30).getTime();
    // A seat is kept a day: the game is recorded half an hour after it started.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startedAt + 30 * 60_000);
    rememberSeat(view.id, randomId(32), 'black', 'chess', startedAt);
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

  it('writes the clock after each move of a game against the clock, as Lichess does', () => {
    recordLiveGame(finished({ clocks: [300_000, 300_000, 293_400, 296_999] }));
    const game = games()[0];
    expect(game?.pgn.split('\n\n')[1]).toBe(
      [
        '1. f3 { [%clk 0:05:00] } 1... e5 { [%clk 0:05:00] } 2. g4 { [%clk 0:04:53] }',
        '2... Qh4# { [%clk 0:04:56] } 0-1',
      ].join('\n'),
    );
    // The review reads them back: the seconds left after each move.
    const moves = parsePgn(game?.pgn ?? '').moves;
    expect(moves.map((move) => move.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(moves.map((move) => clockOf(move.commands))).toEqual([300, 300, 293, 296]);

    // Readings that do not cover every move are left out, and an hour shows as one.
    recordLiveGame(finished({ clocks: [300_000, 300_000] }));
    expect(games()[0]?.pgn).not.toContain('%clk');
    recordLiveGame(finished({ tc: '60+0', clocks: [3_600_000, 3_600_000, 3_599_000, 3_541_000] }));
    expect(games()[0]?.pgn).toContain('1. f3 { [%clk 1:00:00] }');
    expect(games()[0]?.pgn).toContain('2... Qh4# { [%clk 0:59:01] } 0-1');
  });

  it('keeps a correspondence game with its days a move', () => {
    recordLiveGame(finished({ tc: '3d' }));
    const game = games()[0]!;
    expect(game).toMatchObject({
      event: 'Correspondence game · 3 days a move',
      speed: 'correspondence',
    });
    expect(game.pgn).toContain('[TimeControl "1/259200"]');
  });

  it('keeps an Army Draft game from its drafted position, and names a blindfold game', () => {
    const startFen = draftFen({ q: 1, r: 2, b: 0, n: 0, p: 8 }, { q: 0, r: 2, b: 2, n: 2, p: 2 });
    recordLiveGame(
      finished({
        game: 'army',
        opts: { budget: 30 },
        startFen,
        draft: {
          budget: 30,
          deadline: null,
          ready: { white: true, black: true },
          armies: { white: null, black: null },
        },
        // 1.e4 Rh3 2.gxh3, then Black resigns.
        moves: ['e2e4', 'h8h3', 'g2h3'],
        result: '1-0',
        reason: 'resign',
      }),
    );
    const army = games()[0]!;
    expect(army).toMatchObject({ event: 'Army Draft · 30 points · 5+3', startFen });
    expect(army.pgn).toContain('[Variant "From Position"]');
    expect(army.pgn).toContain('[SetUp "1"]');
    expect(army.pgn).toContain(`[FEN "${startFen}"]`);
    expect(army.pgn).toMatch(/1\. e4 Rh3 2\. gxh3 1-0$/);

    recordLiveGame(finished({ game: 'blindfold' }));
    expect(games().map((g) => g.event)).toContain('Blindfold game · 5+3');
  });

  it('keeps a Chess960 game with the tags that make it one, ready for the review', () => {
    const startFen = 'bbqnrknr/pppppppp/8/8/8/8/PPPPPPPP/BBQNRKNR w KQkq - 0 1';
    recordLiveGame(
      finished({
        game: 'chess960',
        startFen,
        // 1.Nh3 Nh6 2.O-O O-O (each king onto its rook), then Black resigns.
        moves: ['g1h3', 'g8h6', 'f1h1', 'f8h8'],
        clocks: [300_000, 300_000, 299_000, 298_000],
        result: '1-0',
        reason: 'resign',
      }),
    );
    const game = games()[0]!;
    expect(game).toMatchObject({ event: 'Chess960 · position 192 · 5+3', startFen, plies: 4 });
    expect(game.pgn).toContain('[Variant "Chess960"]\n[SetUp "1"]\n[FEN "' + startFen + '"]');
    expect(game.pgn).not.toContain('From Position');
    expect(game.pgn).toMatch(
      /1\. Nh3 \{ \[%clk 0:05:00\] \} 1\.\.\. Nh6 .*\s2\. O-O .*\s2\.\.\. O-O .*\s1-0$/s,
    );
    // My games and Analyze read it as Chess960, castling and all.
    const line = mainLineOfPgn(game.pgn);
    expect(line).toMatchObject({ chess960: true, sans: ['Nh3', 'Nh6', 'O-O', 'O-O'] });
    expect(line?.fens.at(-1)).toMatch(/^bbqnrrk1\/.*\/BBQNRRK1 w - /);

    // By correspondence, it says so.
    recordLiveGame(
      finished({ game: 'chess960', startFen, tc: '3d', moves: ['g1h3', 'g8h6'], result: '1-0' }),
    );
    expect(games().map((g) => g.event)).toContain('Chess960 correspondence game · 3 days a move');
    // Moves that are not legal in Chess960 (castling written the standard way) make no PGN.
    recordLiveGame(finished({ game: 'chess960', startFen, moves: ['g1h3', 'g8h6', 'f1g1x'] }));
    recordLiveGame(finished({ game: 'chess960', startFen: null, moves: ['g1h3', 'g8h6'] }));
    expect(games()).toHaveLength(2);
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

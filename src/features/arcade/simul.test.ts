import { describe, expect, it } from 'vitest';
import { getLevel } from '@/engine/levels';
import { remaining } from '@/lib/clock';
import {
  boardColors,
  boardLevels,
  boardPgn,
  createSimul,
  describeLevels,
  describeResult,
  describeSimul,
  engineBudget,
  engineInterrupted,
  engineMove,
  engineStarted,
  formatPoints,
  isFinished,
  nextBoard,
  paceSeconds,
  playerMove,
  resignAll,
  resignBoard,
  selectBoard,
  type SimulSetup,
  type SimulState,
  simulScore,
  tally,
  tick,
  timeControlOf,
} from './simul';

const SETUP: SimulSetup = {
  boards: 3,
  levelId: 2,
  rising: false,
  color: 'white',
  timeControlId: '10+5',
  autoAdvance: true,
};
const T0 = 1_000_000;

/** A board after the engine has started and answered, `ms` later. */
function engineReply(state: SimulState, index: number, uci: string, at: number, ms = 300) {
  const started = engineStarted(state, index, at);
  return engineMove(started, index, uci, at + ms).state;
}

describe('setting up a simul', () => {
  it('puts the levels and colours on the boards', () => {
    expect(boardLevels(SETUP)).toEqual([2, 2, 2]);
    expect(boardLevels({ ...SETUP, boards: 4, levelId: 6, rising: true })).toEqual([6, 7, 8, 8]);
    expect(boardColors({ ...SETUP, boards: 4, color: 'alternate' })).toEqual([
      'white',
      'black',
      'white',
      'black',
    ]);
    expect(boardColors({ ...SETUP, color: 'black' })).toEqual(['black', 'black', 'black']);
    expect(describeLevels(SETUP)).toBe('Beginner');
    expect(describeLevels({ ...SETUP, levelId: 3, rising: true })).toBe('Casual → Intermediate');
  });

  it('starts every clock at once: the player’s where the player moves first', () => {
    const state = createSimul({ ...SETUP, color: 'alternate' }, T0);
    const [white, black] = state.boards;
    expect(white?.clock?.running).toBe('white');
    expect(white?.engine).toBe('idle');
    // The engine moves first here; its clock waits for its search to begin.
    expect(black?.clock?.running).toBeNull();
    expect(black?.engine).toBe('waiting');
    expect(state.active).toBe(0);
    // Two minutes later the player's clock has run on both boards where it is their move.
    const later = T0 + 120_000;
    expect(remaining(state.boards[0]!.clock!, 'white', later)).toBe(480_000);
    expect(remaining(state.boards[2]!.clock!, 'white', later)).toBe(480_000);
  });

  it('has no clocks without a time control, and a pace estimate with one', () => {
    const state = createSimul({ ...SETUP, timeControlId: 'none' }, T0);
    expect(state.boards.every((b) => b.clock === null)).toBe(true);
    expect(timeControlOf({ ...SETUP, timeControlId: 'none' })).toBeNull();
    expect(paceSeconds({ ...SETUP, timeControlId: 'none' })).toBeNull();
    // 10 + 5 on three boards: (600 + 40 × 5) / (3 × 40) seconds a move.
    expect(paceSeconds(SETUP)).toBeCloseTo(800 / 120, 5);
  });
});

describe('playing', () => {
  it('a move presses the clock, adds the increment and moves on to the next board', () => {
    const state = createSimul(SETUP, T0);
    const { state: after, move } = playerMove(state, 0, 'e2e4', T0 + 4_000);
    expect(move?.san).toBe('e4');
    const board = after.boards[0]!;
    expect(board.sans).toEqual(['e4']);
    expect(board.engine).toBe('waiting');
    // 600 s − 4 s + 5 s increment, and no clock runs while the engine waits its turn.
    expect(board.clock?.white).toBe(601_000);
    expect(board.clock?.running).toBeNull();
    expect(after.active).toBe(1);
    // Meanwhile the clock on board 2 kept running.
    expect(remaining(after.boards[1]!.clock!, 'white', T0 + 4_000)).toBe(596_000);
  });

  it('rejects illegal moves and moves out of turn', () => {
    const state = createSimul(SETUP, T0);
    expect(playerMove(state, 0, 'e2e5', T0).move).toBeNull();
    const moved = playerMove(state, 0, 'e2e4', T0).state;
    expect(playerMove(moved, 0, 'd2d4', T0).move).toBeNull();
  });

  it('runs the engine’s clock only while it searches', () => {
    let state = playerMove(createSimul(SETUP, T0), 0, 'e2e4', T0).state;
    // Ten seconds in the queue cost the engine nothing.
    state = engineStarted(state, 0, T0 + 10_000);
    expect(state.boards[0]?.engine).toBe('thinking');
    expect(state.boards[0]?.clock?.running).toBe('black');
    const { state: after, move } = engineMove(state, 0, 'e7e5', T0 + 10_400);
    expect(move?.san).toBe('e5');
    const board = after.boards[0]!;
    // 600 s − 0.4 s of thinking + 5 s, and now the player's clock runs again.
    expect(board.clock?.black).toBe(604_600);
    expect(board.clock?.running).toBe('white');
    expect(board.engine).toBe('idle');
  });

  it('ignores an engine move for a board that is not waiting for one', () => {
    const state = createSimul(SETUP, T0);
    expect(engineMove(state, 0, 'e2e4', T0).move).toBeNull();
    const interrupted = engineInterrupted(
      engineStarted(playerMove(state, 0, 'e2e4', T0).state, 0, T0),
      0,
      T0 + 500,
    );
    expect(interrupted.boards[0]?.engine).toBe('waiting');
    expect(interrupted.boards[0]?.clock?.running).toBeNull();
  });

  it('ends a board on checkmate, from the player’s side', () => {
    let state = createSimul({ ...SETUP, timeControlId: 'none', autoAdvance: false }, T0);
    state = playerMove(state, 0, 'f2f3', T0).state;
    state = engineReply(state, 0, 'e7e5', T0);
    state = playerMove(state, 0, 'g2g4', T0).state;
    state = engineReply(state, 0, 'd8h4', T0);
    const board = state.boards[0]!;
    expect(board.result).toEqual({ result: '0-1', reason: 'checkmate', verdict: 'loss' });
    expect(board.engine).toBe('idle');
    expect(describeResult(board.result!)).toBe('Lost to checkmate');
    expect(isFinished(state)).toBe(false);
  });
});

describe('clocks and flags', () => {
  it('a flag loses for the player and wins against the engine', () => {
    const state = createSimul({ ...SETUP, timeControlId: '5+3' }, T0);
    const flagged = tick(state, T0 + 300_000);
    expect(flagged.boards.every((b) => b.result?.verdict === 'loss')).toBe(true);
    expect(describeResult(flagged.boards[0]!.result!)).toBe('Lost on time');
    // Nothing to do yet: the same object comes back.
    expect(tick(state, T0 + 1_000)).toBe(state);

    let thinking = playerMove(state, 0, 'e2e4', T0).state;
    thinking = engineStarted(thinking, 0, T0);
    const engineFlag = tick(thinking, T0 + 300_001);
    expect(engineFlag.boards[0]?.result).toEqual({ result: '1-0', reason: 'time', verdict: 'win' });
  });

  it('a flag against a side that cannot mate is a draw', () => {
    const state = createSimul({ ...SETUP, boards: 2, timeControlId: '5+3' }, T0);
    // Board 1: the engine is down to a bare king, the player to move with a rook.
    const endgame: SimulState = {
      ...state,
      boards: state.boards.map((b) =>
        b.index === 0 ? { ...b, fen: '4k3/8/8/8/8/8/8/4K2R w - - 0 1' } : b,
      ),
    };
    const flagged = tick(endgame, T0 + 300_000);
    expect(flagged.boards[0]?.result).toEqual({
      result: '1/2-1/2',
      reason: 'time, with no mating material left',
      verdict: 'draw',
    });
    // Board 2 is an ordinary flag.
    expect(flagged.boards[1]?.result?.verdict).toBe('loss');
  });

  it('a move after the flag fell is refused and the board is lost', () => {
    const state = createSimul({ ...SETUP, timeControlId: '5+3' }, T0);
    const late = playerMove(state, 0, 'e2e4', T0 + 300_500);
    expect(late.move).toBeNull();
    expect(late.state.boards[0]?.result?.reason).toBe('time');
  });

  it('gives the engine a search budget that shrinks with its clock', () => {
    const level = getLevel(8);
    let state = playerMove(createSimul({ ...SETUP, levelId: 8 }, T0), 0, 'e2e4', T0).state;
    const board = state.boards[0]!;
    // Plenty of time: the level's own 1.5 s.
    expect(engineBudget(level, board, timeControlOf(SETUP), T0)).toEqual({ movetime: 1500 });
    // Three seconds left: a quarter of it.
    state = {
      ...state,
      boards: state.boards.map((b) =>
        b.index === 0 && b.clock ? { ...b, clock: { ...b.clock, black: 3000 } } : b,
      ),
    };
    expect(engineBudget(level, state.boards[0]!, timeControlOf(SETUP), T0)).toEqual({
      movetime: 750,
    });
    // No clock: the level decides.
    expect(engineBudget(level, board, null, T0)).toEqual({});
  });
});

describe('moving round the room', () => {
  it('goes to the next board waiting for a move, in order, skipping finished ones', () => {
    let state = createSimul({ ...SETUP, boards: 4, timeControlId: 'none', autoAdvance: false }, T0);
    expect(nextBoard(state, 0)).toBe(1);
    expect(nextBoard(state, 3)).toBe(0);
    state = resignBoard(state, 1, T0);
    expect(nextBoard(state, 0)).toBe(2);
    // Boards 2 and 3 now wait for the engine; board 0 still waits for the player.
    state = playerMove(state, 2, 'e2e4', T0).state;
    state = playerMove(state, 3, 'e2e4', T0).state;
    expect(nextBoard(state, 0)).toBe(0);
    state = playerMove(state, 0, 'e2e4', T0).state;
    // Nobody waits for the player: the next board still in play.
    expect(nextBoard(state, 0)).toBe(2);
    expect(selectBoard(state, 3).active).toBe(3);
    expect(selectBoard(state, 9)).toBe(state);
  });

  it('auto-advance follows the same order', () => {
    let state = createSimul({ ...SETUP, timeControlId: 'none' }, T0);
    state = playerMove(state, 0, 'e2e4', T0).state;
    expect(state.active).toBe(1);
    state = playerMove(state, 1, 'd2d4', T0).state;
    expect(state.active).toBe(2);
    state = playerMove(state, 2, 'c2c4', T0).state;
    // Every engine is thinking: round to the first board.
    expect(state.active).toBe(0);
  });
});

describe('results', () => {
  it('scores each win by its board’s level and a draw by half', () => {
    let state = createSimul({ ...SETUP, boards: 4, levelId: 3, rising: true }, T0);
    const set = (index: number, verdict: 'win' | 'loss' | 'draw') => {
      state = {
        ...state,
        boards: state.boards.map((b) =>
          b.index === index
            ? {
                ...b,
                result: {
                  result: verdict === 'draw' ? '1/2-1/2' : verdict === 'win' ? '1-0' : '0-1',
                  reason: 'checkmate',
                  verdict,
                },
              }
            : b,
        ),
      };
    };
    set(0, 'win');
    set(1, 'draw');
    set(2, 'loss');
    expect(isFinished(state)).toBe(false);
    set(3, 'win');
    expect(isFinished(state)).toBe(true);
    // Levels 3, 4, 5 and 6: 3 + 4/2 + 0 + 6.
    expect(simulScore(state)).toBe(11);
    expect(tally(state)).toEqual({ wins: 2, draws: 1, losses: 1, points: 2.5, finished: 4 });
    expect(describeSimul(state)).toBe('2½/4 · Casual → Advanced · 10 + 5');
  });

  it('writes points with halves', () => {
    expect(formatPoints(0)).toBe('0');
    expect(formatPoints(0.5)).toBe('½');
    expect(formatPoints(3.5)).toBe('3½');
    expect(formatPoints(4)).toBe('4');
  });

  it('resigning ends a board, or all of them', () => {
    const state = createSimul(SETUP, T0);
    const one = resignBoard(state, 1, T0);
    expect(one.boards[1]?.result).toEqual({
      result: '0-1',
      reason: 'resignation',
      verdict: 'loss',
    });
    expect(describeResult(one.boards[1]!.result!)).toBe('Resigned');
    expect(resignBoard(one, 1, T0)).toBe(one);
    const all = resignAll(state, T0);
    expect(isFinished(all)).toBe(true);
    expect(tally(all).losses).toBe(3);
    expect(describeSimul(all)).toBe('0/3 · Beginner · 10 + 5');
  });

  it('describes draws and wins', () => {
    expect(describeResult({ result: '1-0', reason: 'checkmate', verdict: 'win' })).toBe(
      'Won by checkmate',
    );
    expect(describeResult({ result: '1-0', reason: 'time', verdict: 'win' })).toBe('Won on time');
    expect(describeResult({ result: '1/2-1/2', reason: 'stalemate', verdict: 'draw' })).toBe(
      'Draw by stalemate',
    );
    expect(describeResult({ result: '1/2-1/2', reason: 'fifty-move rule', verdict: 'draw' })).toBe(
      'Draw by the fifty-move rule',
    );
    expect(
      describeResult({
        result: '1/2-1/2',
        reason: 'time, with no mating material left',
        verdict: 'draw',
      }),
    ).toBe('Draw: flag fell with no mating material left');
  });

  it('saves each board as a PGN with the simul in its headers', () => {
    let state = createSimul({ ...SETUP, color: 'black', timeControlId: 'none' }, T0);
    state = engineReply(state, 1, 'e2e4', T0);
    state = playerMove(state, 1, 'e7e5', T0).state;
    state = resignBoard(state, 1, T0);
    const pgn = boardPgn(state, state.boards[1]!, new Date(2026, 9, 2));
    expect(pgn).toContain('[Event "Chess Trainer — simul on 3 boards"]');
    expect(pgn).toContain('[Round "2"]');
    expect(pgn).toContain('[White "Stockfish (level 2 · Beginner)"]');
    expect(pgn).toContain('[Black "You"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[TimeControl "-"]');
    expect(pgn).toContain('[Date "2026.10.02"]');
    expect(pgn).toContain('1. e4 e5');
  });
});

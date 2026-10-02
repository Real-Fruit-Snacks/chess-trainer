import { Chess, type Move, type Square } from 'chess.js';
import {
  canStillMate,
  gameStatus,
  opposite,
  START_FEN,
  toLongColor,
  toUci,
  tryMove,
} from '@/chess/helpers';
import type { Fen, LongColor, PromotionPiece, San, Uci } from '@/chess/types';
import { ENGINE_LEVELS, type EngineLevel, getLevel } from '@/engine/levels';
import {
  type ClockState,
  createClock,
  getTimeControl,
  pauseClock,
  pressClock,
  remaining,
  startClock,
  type TimeControl,
} from '@/lib/clock';
import type { SimulPrefs } from '@/store/settings';

/**
 * Simul: the player against several engines at once, each on its own board.
 *
 * Every board has its own clock for both sides, as in a clock simul: the
 * player's clock on a board runs whenever it is the player's move there —
 * including while the player is busy on another board — so time spent on one
 * board is time lost on all the others. The engine's clock runs only while it
 * actually searches, never while it waits its turn for the one engine, so the
 * queue can never cost it a game.
 *
 * Everything here is pure: the hook (useSimul) owns the engine and the side effects.
 */
export type SimulSetup = SimulPrefs;

export const SIMUL_BOARD_COUNTS = [2, 3, 4, 6, 8] as const;
export const SIMUL_TIME_CONTROLS = ['none', '5+3', '10+5', '15+10', '30+0'] as const;
/** Below this the player hears the low-time tick, once per board. */
export const SIMUL_LOW_TIME_MS = 10_000;
/** A typical game length, for the pace estimate. */
const MOVES_PER_GAME = 40;

export interface BoardResult {
  result: '1-0' | '0-1' | '1/2-1/2';
  /** "checkmate", "time", "resignation", "stalemate"… */
  reason: string;
  /** From the player's side. */
  verdict: 'win' | 'loss' | 'draw';
}

export type EngineState = 'idle' | 'waiting' | 'thinking';

export interface SimulBoard {
  index: number;
  levelId: number;
  /** The player's colour on this board. */
  color: LongColor;
  sans: San[];
  ucis: Uci[];
  fen: Fen;
  turn: LongColor;
  lastMove: [Square, Square] | null;
  check: boolean;
  clock: ClockState | null;
  /** The engine on this board: nothing to do, queued for the engine, or searching. */
  engine: EngineState;
  result: BoardResult | null;
}

export interface SimulState {
  /** Distinguishes one simul from the next (and keys the boards). */
  id: number;
  setup: SimulSetup;
  boards: SimulBoard[];
  /** The board on the big board. */
  active: number;
  startedAt: number;
}

/** The time control of a setup, or null when it is played without clocks. */
export function timeControlOf(setup: SimulSetup): TimeControl | null {
  const control = getTimeControl(setup.timeControlId);
  return control.initialMs > 0 ? control : null;
}

const MAX_LEVEL = Math.max(...ENGINE_LEVELS.map((l) => l.id));

/** The engine level on each board: all the same, or one stronger per board up to the top. */
export function boardLevels(setup: SimulSetup): number[] {
  return Array.from({ length: setup.boards }, (_, i) =>
    setup.rising ? Math.min(setup.levelId + i, MAX_LEVEL) : setup.levelId,
  );
}

/** The player's colour on each board. */
export function boardColors(setup: SimulSetup): LongColor[] {
  return Array.from({ length: setup.boards }, (_, i) =>
    setup.color === 'alternate' ? (i % 2 === 0 ? 'white' : 'black') : setup.color,
  );
}

/**
 * Roughly how many seconds the player has per move: the clock and the
 * increments of one board, shared out over every board, since the player's
 * clocks run side by side. Null without clocks.
 */
export function paceSeconds(setup: SimulSetup): number | null {
  const control = timeControlOf(setup);
  if (!control) return null;
  const perBoard = control.initialMs + MOVES_PER_GAME * control.incrementMs;
  return perBoard / (setup.boards * MOVES_PER_GAME) / 1000;
}

export function createSimul(setup: SimulSetup, now: number, id: number = now): SimulState {
  const control = timeControlOf(setup);
  const levels = boardLevels(setup);
  const colors = boardColors(setup);
  const boards = levels.map((levelId, index): SimulBoard => {
    const color = colors[index] ?? 'white';
    const playerFirst = color === 'white';
    let clock = control ? createClock(control) : null;
    // A clock simul starts every clock at once: the player's runs from the first second.
    if (clock && playerFirst) clock = startClock(clock, 'white', now);
    return {
      index,
      levelId,
      color,
      sans: [],
      ucis: [],
      fen: START_FEN,
      turn: 'white',
      lastMove: null,
      check: false,
      clock,
      engine: playerFirst ? 'idle' : 'waiting',
      result: null,
    };
  });
  const first = boards.findIndex((b) => b.color === 'white');
  return { id, setup, boards, active: first === -1 ? 0 : first, startedAt: now };
}

/** The game on a board, replayed so repetitions and the fifty-move count are right. */
export function replay(board: Pick<SimulBoard, 'ucis'>): Chess {
  const chess = new Chess();
  for (const uci of board.ucis) {
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci[4] as PromotionPiece | undefined;
    chess.move(promotion ? { from, to, promotion } : { from, to });
  }
  return chess;
}

export function isPlayerTurn(board: SimulBoard): boolean {
  return !board.result && board.turn === board.color;
}

export function isFinished(state: SimulState): boolean {
  return state.boards.every((b) => b.result);
}

function withBoard(state: SimulState, board: SimulBoard): SimulState {
  return { ...state, boards: state.boards.map((b) => (b.index === board.index ? board : b)) };
}

function finish(board: SimulBoard, result: BoardResult, now: number): SimulBoard {
  return {
    ...board,
    result,
    clock: board.clock ? pauseClock(board.clock, now) : null,
    engine: 'idle',
  };
}

function outcomeOf(board: SimulBoard, chess: Chess): BoardResult | null {
  const status = gameStatus(chess);
  if (!status.over || status.result === '*') return null;
  const verdict = status.winner ? (status.winner === board.color ? 'win' : 'loss') : 'draw';
  return { result: status.result, reason: status.reason ?? 'game over', verdict };
}

export interface Applied {
  state: SimulState;
  /** The move as chess.js played it (for sounds), or null when nothing was played. */
  move: Move | null;
  /** Whether the move gives check. */
  check: boolean;
}

/** Plays one move for `mover` on a board and presses that board's clock. */
function applyMove(
  state: SimulState,
  index: number,
  uci: Uci,
  mover: 'player' | 'engine',
  now: number,
): Applied {
  const board = state.boards[index];
  if (!board) return { state, move: null, check: false };
  const chess = replay(board);
  const promotion = uci[4] as PromotionPiece | undefined;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const move = tryMove(chess, promotion ? { from, to, promotion } : { from, to });
  if (!move) return { state, move: null, check: false };

  const control = timeControlOf(state.setup);
  const moverColor = mover === 'player' ? board.color : opposite(board.color);
  let clock = board.clock;
  if (clock && control) {
    clock = pressClock(clock, moverColor, control, now);
    // The engine's clock starts when its search does, not while it waits in the queue.
    if (mover === 'player') clock = pauseClock(clock, now);
  }
  const next: SimulBoard = {
    ...board,
    sans: [...board.sans, move.san],
    ucis: [...board.ucis, toUci(move)],
    fen: chess.fen(),
    turn: toLongColor(chess.turn()),
    lastMove: [move.from, move.to],
    check: chess.inCheck(),
    clock,
    engine: mover === 'player' ? 'waiting' : 'idle',
  };
  const outcome = outcomeOf(next, chess);
  return {
    state: withBoard(state, outcome ? finish(next, outcome, now) : next),
    move,
    check: chess.inCheck(),
  };
}

/**
 * Ends every board whose running clock has run out. A flag loses, unless the
 * side with time left could never mate — then it is a draw. Returns the same
 * object when nothing changed, so it can run on a timer.
 */
export function tick(state: SimulState, now: number): SimulState {
  let changed = false;
  const boards = state.boards.map((board) => {
    const side = board.clock?.running;
    if (board.result || !board.clock || !side) return board;
    if (remaining(board.clock, side, now) > 0) return board;
    changed = true;
    const winner = opposite(side);
    // Material is all that matters here, so the position alone will do.
    const decisive = canStillMate(new Chess(board.fen), winner);
    const result: BoardResult = decisive
      ? {
          result: winner === 'white' ? '1-0' : '0-1',
          reason: 'time',
          verdict: winner === board.color ? 'win' : 'loss',
        }
      : { result: '1/2-1/2', reason: 'time, with no mating material left', verdict: 'draw' };
    return finish(board, result, now);
  });
  return changed ? { ...state, boards } : state;
}

/**
 * The next board for the player after `from`: the first one round the room
 * that is waiting for a move, else `from` itself if it is, else the next board
 * still in play (its engine is thinking), else `from`.
 */
export function nextBoard(state: SimulState, from: number): number {
  const count = state.boards.length;
  const order = Array.from({ length: Math.max(0, count - 1) }, (_, k) => (from + 1 + k) % count);
  const at = (i: number) => state.boards[i];
  const waiting = order.find((i) => {
    const board = at(i);
    return board ? isPlayerTurn(board) : false;
  });
  if (waiting !== undefined) return waiting;
  const here = at(from);
  if (here && isPlayerTurn(here)) return from;
  const live = order.find((i) => !at(i)?.result);
  return live ?? from;
}

/** The player's move on a board; with auto-advance on, the next board comes up. */
export function playerMove(state: SimulState, index: number, uci: Uci, now: number): Applied {
  const ticked = tick(state, now);
  const board = ticked.boards[index];
  if (!board || !isPlayerTurn(board)) return { state: ticked, move: null, check: false };
  const applied = applyMove(ticked, index, uci, 'player', now);
  if (!applied.move || !ticked.setup.autoAdvance) return applied;
  return { ...applied, state: { ...applied.state, active: nextBoard(applied.state, index) } };
}

/** The engine starts its search on a board: from now on its clock runs. */
export function engineStarted(state: SimulState, index: number, now: number): SimulState {
  const board = state.boards[index];
  if (!board || board.result || board.engine !== 'waiting') return state;
  const clock = board.clock ? startClock(board.clock, opposite(board.color), now) : null;
  return withBoard(state, { ...board, engine: 'thinking', clock });
}

/** The engine's move arrives; ignored if the board finished in the meantime. */
export function engineMove(state: SimulState, index: number, uci: Uci, now: number): Applied {
  const ticked = tick(state, now);
  const board = ticked.boards[index];
  if (!board || board.result || board.engine !== 'thinking' || board.turn === board.color) {
    return { state: ticked, move: null, check: false };
  }
  return applyMove(ticked, index, uci, 'engine', now);
}

/** A search ended without a move: the board goes back to waiting for the engine. */
export function engineInterrupted(state: SimulState, index: number, now: number): SimulState {
  const board = state.boards[index];
  if (!board || board.result || board.engine !== 'thinking') return state;
  return withBoard(state, {
    ...board,
    engine: 'waiting',
    clock: board.clock ? pauseClock(board.clock, now) : null,
  });
}

/** Resigns one board. */
export function resignBoard(state: SimulState, index: number, now: number): SimulState {
  const board = state.boards[index];
  if (!board || board.result) return state;
  return withBoard(
    state,
    finish(
      board,
      {
        result: board.color === 'white' ? '0-1' : '1-0',
        reason: 'resignation',
        verdict: 'loss',
      },
      now,
    ),
  );
}

/** Resigns every board still in play: the simul ends. */
export function resignAll(state: SimulState, now: number): SimulState {
  return state.boards.reduce((s, b) => resignBoard(s, b.index, now), state);
}

export function selectBoard(state: SimulState, index: number): SimulState {
  if (index === state.active || !state.boards[index]) return state;
  return { ...state, active: index };
}

/**
 * The engine's search on a board. Without clocks, the level's own limits.
 * With clocks, at most a thirtieth of its time plus most of the increment,
 * and never more than the level would spend anyway; the level's depth limit
 * still applies, whichever comes first.
 */
export function engineBudget(
  level: EngineLevel,
  board: SimulBoard,
  control: TimeControl | null,
  now: number,
): { movetime?: number } {
  if (!control || !board.clock) return {};
  const left = remaining(board.clock, opposite(board.color), now);
  const budget = Math.min(left / 30 + control.incrementMs * 0.8, left / 4);
  return { movetime: Math.max(50, Math.round(Math.min(level.movetime ?? Infinity, budget))) };
}

export interface Tally {
  wins: number;
  draws: number;
  losses: number;
  /** Wins plus half the draws. */
  points: number;
  finished: number;
}

export function tally(state: SimulState): Tally {
  const results = state.boards.map((b) => b.result?.verdict);
  const wins = results.filter((v) => v === 'win').length;
  const draws = results.filter((v) => v === 'draw').length;
  const losses = results.filter((v) => v === 'loss').length;
  return { wins, draws, losses, points: wins + draws / 2, finished: wins + draws + losses };
}

/** The score to beat: each win counts its board's level (1 to 8), a draw half of it. */
export function simulScore(state: SimulState): number {
  return state.boards.reduce((sum, b) => {
    if (b.result?.verdict === 'win') return sum + b.levelId;
    if (b.result?.verdict === 'draw') return sum + b.levelId / 2;
    return sum;
  }, 0);
}

/** 3.5 → "3½". */
export function formatPoints(points: number): string {
  const whole = Math.floor(points);
  const half = points - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}

/** "Club", or "Casual → Expert" when the levels rise. */
export function describeLevels(setup: SimulSetup): string {
  const levels = boardLevels(setup);
  const first = getLevel(levels[0] ?? setup.levelId).name;
  const last = getLevel(levels[levels.length - 1] ?? setup.levelId).name;
  return first === last ? first : `${first} → ${last}`;
}

/** One line for the arcade hub: "3½/4 · Club · 10 + 5". */
export function describeSimul(state: SimulState): string {
  const { points } = tally(state);
  const control = timeControlOf(state.setup);
  return `${formatPoints(points)}/${state.boards.length} · ${describeLevels(state.setup)} · ${
    control ? control.label : 'no clock'
  }`;
}

/** The result of a board in words, from the player's side. */
export function describeResult(result: BoardResult): string {
  const { verdict, reason } = result;
  if (verdict === 'win') return reason === 'time' ? 'Won on time' : `Won by ${reason}`;
  if (verdict === 'loss') {
    if (reason === 'resignation') return 'Resigned';
    return reason === 'time' ? 'Lost on time' : `Lost to ${reason}`;
  }
  if (reason.startsWith('time')) return 'Draw: flag fell with no mating material left';
  return reason === 'fifty-move rule' ? 'Draw by the fifty-move rule' : `Draw by ${reason}`;
}

export function engineName(levelId: number): string {
  const level = getLevel(levelId);
  return `Stockfish · ${level.name}`;
}

/** PGN headers for a finished board, as for any game against the engine. */
export function boardHeaders(
  state: SimulState,
  board: SimulBoard,
  date: Date = new Date(),
): Record<string, string> {
  const level = getLevel(board.levelId);
  const engine = `Stockfish (level ${level.id} · ${level.name})`;
  const control = timeControlOf(state.setup);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    Event: `Chess Trainer — simul on ${state.boards.length} boards`,
    Site: 'Chess Trainer',
    Date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    Round: String(board.index + 1),
    White: board.color === 'white' ? 'You' : engine,
    Black: board.color === 'black' ? 'You' : engine,
    Result: board.result?.result ?? '*',
    TimeControl: control ? `${control.initialMs / 1000}+${control.incrementMs / 1000}` : '-',
  };
}

export function boardPgn(state: SimulState, board: SimulBoard, date?: Date): string {
  const chess = replay(board);
  for (const [key, value] of Object.entries(boardHeaders(state, board, date))) {
    chess.setHeader(key, value);
  }
  return chess.pgn();
}

import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isPromotionMove, legalDests, START_FEN } from '@/chess/helpers';
import type { PromotionPiece, Uci } from '@/chess/types';
import type { EngineClient, EngineStatus } from '@/engine/EngineClient';
import { getLevel } from '@/engine/levels';
import { useEngine } from '@/engine/useEngine';
import { chooseLevelMove, type SkillCache } from '@/features/play/engineMove';
import { remaining } from '@/lib/clock';
import { gameEndSound, playSound, soundForMove } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import {
  type Applied,
  boardPgn,
  createSimul,
  describeResult,
  describeSimul,
  engineBudget,
  engineInterrupted,
  engineMove,
  engineName,
  engineStarted,
  formatPoints,
  isFinished,
  isPlayerTurn,
  nextBoard,
  playerMove,
  replay,
  resignAll,
  resignBoard,
  selectBoard,
  SIMUL_LOW_TIME_MS,
  type SimulBoard,
  simulScore,
  type SimulSetup,
  type SimulState,
  tally,
  tick,
  timeControlOf,
} from './simul';

/** The arcade id the simul's best score is kept under. */
export const SIMUL_ARCADE_ID = 'simul';

interface RunnerDeps {
  engine: () => EngineClient;
  onState: (state: SimulState | null) => void;
  onAnnounce: (text: string) => void;
}

/**
 * Runs one simul: the state, a queue of boards waiting for the one engine, the
 * clocks and every side effect (sounds, announcements, saving the games). A
 * plain object rather than hooks, so the engine loop never sees a stale state.
 */
class SimulRunner {
  state: SimulState | null = null;
  private queue: number[] = [];
  private pumping = false;
  /** The engine failed: wait for a retry instead of spinning. */
  private stalled = false;
  private disposed = false;
  private interruptions = 0;
  private readonly skill: SkillCache = { skill: null };
  private readonly warned = new Set<number>();

  constructor(private readonly deps: RunnerDeps) {}

  start(setup: SimulSetup): void {
    this.deps.engine().stop();
    this.queue = [];
    this.warned.clear();
    this.interruptions = 0;
    const now = Date.now();
    this.commit(createSimul(setup, now, Math.max(now, (this.state?.id ?? 0) + 1)));
  }

  /** Back to the setup screen. */
  quit(): void {
    this.deps.engine().stop();
    this.queue = [];
    this.commit(null);
  }

  /** Plays the player's move on the active board. */
  move(from: Square, to: Square, promotion?: PromotionPiece): 'played' | 'promotion' | 'illegal' {
    const state = this.state;
    const board = state?.boards[state.active];
    if (!state || !board || !isPlayerTurn(board)) return 'illegal';
    let piece = promotion;
    if (!piece && isPromotionMove(new Chess(board.fen), from, to)) {
      if (!useSettings.getState().autoQueen) return 'promotion';
      piece = 'q';
    }
    const applied = playerMove(state, board.index, `${from}${to}${piece ?? ''}`, Date.now());
    this.commit(applied.state);
    if (!applied.move) return 'illegal';
    // A move that ends the game has already sounded the end of it.
    if (!applied.state.boards[board.index]?.result) this.moveSound(applied);
    return 'played';
  }

  select(index: number): void {
    if (this.state) this.commit(selectBoard(this.state, index));
  }

  /** The next board waiting for a move. */
  next(): void {
    if (this.state) this.commit(selectBoard(this.state, nextBoard(this.state, this.state.active)));
  }

  resign(index: number): void {
    if (this.state) this.commit(resignBoard(this.state, index, Date.now()));
  }

  resignAll(): void {
    if (this.state) this.commit(resignAll(this.state, Date.now()));
  }

  setAutoAdvance(on: boolean): void {
    const state = this.state;
    if (state) this.commit({ ...state, setup: { ...state.setup, autoAdvance: on } });
  }

  /** Flags and low-time warnings; called a few times a second while clocks run. */
  tick(): void {
    const state = this.state;
    if (!state || isFinished(state)) return;
    const now = Date.now();
    const next = tick(state, now);
    if (next !== state) this.commit(next);
    for (const board of next.boards) {
      if (board.result || board.clock?.running !== board.color) continue;
      if (this.warned.has(board.index)) continue;
      if (remaining(board.clock, board.color, now) <= SIMUL_LOW_TIME_MS) {
        this.warned.add(board.index);
        playSound('lowTime');
      }
    }
  }

  /** The engine is back (or was reloaded): carry on with the queue. */
  retry(): void {
    this.stalled = false;
    this.interruptions = 0;
    void this.pump();
  }

  dispose(): void {
    this.disposed = true;
    this.deps.engine().stop();
  }

  /** Development builds mount, unmount and mount again: undo `dispose`. */
  revive(): void {
    this.disposed = false;
    void this.pump();
  }

  private commit(next: SimulState | null): void {
    const prev = this.state;
    this.state = next;
    this.deps.onState(next);
    if (!next) return;
    const same = prev?.id === next.id ? prev : null;
    const ended: SimulBoard[] = [];
    for (const board of next.boards) {
      const before = same?.boards[board.index];
      if (
        board.engine === 'waiting' &&
        before?.engine !== 'waiting' &&
        !this.queue.includes(board.index)
      ) {
        this.queue.push(board.index);
      }
      if (board.result && !before?.result) ended.push(board);
    }
    if (ended.length) this.ended(next, ended, same ? isFinished(same) : false);
    void this.pump();
  }

  /** Boards that just finished: save each game, and the simul when it is over. */
  private ended(state: SimulState, boards: SimulBoard[], wasOver: boolean): void {
    const progress = useProgress.getState();
    for (const board of boards) {
      if (!board.result) continue;
      progress.recordGame({
        level: board.levelId,
        color: board.color,
        result: board.result.result,
        reason: board.result.reason,
        plies: board.ucis.length,
        pgn: boardPgn(state, board),
      });
    }
    if (isFinished(state) && !wasOver) {
      this.deps.engine().stop();
      progress.recordArcade(SIMUL_ARCADE_ID, simulScore(state), describeSimul(state));
      const { wins, losses, points } = tally(state);
      playSound(losses > wins ? 'gameLost' : 'gameEnd');
      this.deps.onAnnounce(
        `The simul is over: ${formatPoints(points)} out of ${state.boards.length}.`,
      );
      return;
    }
    const last = boards[boards.length - 1];
    if (!last?.result) return;
    playSound(gameEndSound(last.result.verdict));
    this.deps.onAnnounce(`Board ${last.index + 1}: ${describeResult(last.result).toLowerCase()}.`);
  }

  private moveSound(applied: Applied): void {
    if (applied.move) playSound(soundForMove(applied.move, { inCheck: () => applied.check }));
  }

  /** The engine loop: one board at a time, in the order they started waiting. */
  private async pump(): Promise<void> {
    if (this.pumping || this.disposed || this.stalled) return;
    this.pumping = true;
    try {
      for (;;) {
        const state = this.state;
        if (!state || this.disposed) return;
        this.queue = this.queue.filter((i) => {
          const board = state.boards[i];
          return !!board && !board.result && board.engine === 'waiting';
        });
        const index = this.queue.shift();
        if (index === undefined) return;
        const session = state.id;
        const client = this.deps.engine();
        try {
          // Loading the engine is never charged to its clock.
          await client.init();
        } catch {
          this.queue.unshift(index);
          this.stalled = true;
          return;
        }
        const ready = this.state;
        if (ready?.id !== session) continue;
        const thinking = engineStarted(ready, index, Date.now());
        const board = thinking.boards[index];
        if (board?.engine !== 'thinking') continue;
        this.commit(thinking);

        const level = getLevel(board.levelId);
        const chess = replay(board);
        let uci: Uci | null = null;
        try {
          uci = await chooseLevelMove(client, this.skill, {
            level,
            fen: START_FEN,
            moves: board.ucis,
            legal: legalDests(chess),
            pieceAt: (square) => chess.get(square),
            ...engineBudget(level, board, timeControlOf(ready.setup), Date.now()),
          });
        } catch {
          this.stalled = true;
        }
        const after = this.state;
        if (after?.id !== session || this.disposed) continue;
        if (!uci) {
          // Stopped without a move: back in the queue, unless something keeps stopping it.
          this.interruptions += 1;
          if (this.interruptions > 3) this.stalled = true;
          this.commit(engineInterrupted(after, index, Date.now()));
          if (this.stalled) return;
          continue;
        }
        this.interruptions = 0;
        const applied = engineMove(after, index, uci, Date.now());
        this.commit(applied.state);
        const moved = applied.state.boards[index];
        if (!applied.move || !moved || moved.result) continue;
        if (applied.state.active === index) {
          this.moveSound(applied);
        } else {
          this.deps.onAnnounce(
            `Board ${index + 1}: ${engineName(moved.levelId)} played ${applied.move.san}. Your move.`,
          );
        }
      }
    } finally {
      this.pumping = false;
    }
  }
}

export interface PendingPromotion {
  index: number;
  from: Square;
  to: Square;
}

export interface UseSimul {
  state: SimulState | null;
  engineStatus: EngineStatus;
  engineError: Error | null;
  retryEngine: () => Promise<void>;
  start: (setup: SimulSetup) => void;
  /** Back to the setup screen. */
  quit: () => void;
  /** The player's move on the active board. */
  move: (from: Square, to: Square) => void;
  promotion: PendingPromotion | null;
  /** The promotion piece, or null to take the move back. Returns whether a move was played. */
  resolvePromotion: (piece: PromotionPiece | null) => boolean;
  select: (index: number) => void;
  next: () => void;
  resign: (index: number) => void;
  resignAll: () => void;
  setAutoAdvance: (on: boolean) => void;
  /** The latest event on a board the player is not looking at, for screen readers. */
  announcement: string;
}

/** A simul against several engines, each on its own board, with one engine serving them all. */
export function useSimul(): UseSimul {
  const { engine, status: engineStatus, error: engineError, start: retryEngine } = useEngine();
  const [state, setState] = useState<SimulState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);
  const runnerRef = useRef<SimulRunner | null>(null);
  runnerRef.current ??= new SimulRunner({
    engine,
    onState: setState,
    onAnnounce: setAnnouncement,
  });
  const runner = runnerRef.current;

  useEffect(() => {
    runner.revive();
    return () => runner.dispose();
  }, [runner]);

  // The clocks: flags and low-time warnings, while there is a clock to watch.
  const timed = !!state && !!timeControlOf(state.setup);
  const over = !!state && isFinished(state);
  const id = state?.id;
  useEffect(() => {
    if (!timed || over || id === undefined) return;
    const timer = window.setInterval(() => runner.tick(), 100);
    return () => window.clearInterval(timer);
  }, [runner, timed, over, id]);

  // A (re)started engine picks up whatever is waiting for it.
  useEffect(() => {
    if (engineStatus === 'ready') runner.retry();
  }, [engineStatus, runner]);

  const start = useCallback(
    (setup: SimulSetup) => {
      setPromotion(null);
      setAnnouncement('');
      runner.start(setup);
    },
    [runner],
  );

  const move = useCallback(
    (from: Square, to: Square) => {
      const outcome = runner.move(from, to);
      const active = runner.state?.active;
      if (outcome === 'promotion' && active !== undefined) {
        setPromotion({ index: active, from, to });
      }
    },
    [runner],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const pending = promotion;
      setPromotion(null);
      if (!pending || !piece || runner.state?.active !== pending.index) return false;
      return runner.move(pending.from, pending.to, piece) === 'played';
    },
    [promotion, runner],
  );

  const select = useCallback(
    (index: number) => {
      setPromotion(null);
      runner.select(index);
    },
    [runner],
  );

  const next = useCallback(() => {
    setPromotion(null);
    runner.next();
  }, [runner]);

  const quit = useCallback(() => {
    setPromotion(null);
    runner.quit();
  }, [runner]);

  const resign = useCallback((index: number) => runner.resign(index), [runner]);
  const resignAllBoards = useCallback(() => runner.resignAll(), [runner]);
  const setAutoAdvance = useCallback((on: boolean) => runner.setAutoAdvance(on), [runner]);

  return useMemo(
    () => ({
      state,
      engineStatus,
      engineError,
      retryEngine,
      start,
      quit,
      move,
      promotion,
      resolvePromotion,
      select,
      next,
      resign,
      resignAll: resignAllBoards,
      setAutoAdvance,
      announcement,
    }),
    [
      state,
      engineStatus,
      engineError,
      retryEngine,
      start,
      quit,
      move,
      promotion,
      resolvePromotion,
      select,
      next,
      resign,
      resignAllBoards,
      setAutoAdvance,
      announcement,
    ],
  );
}

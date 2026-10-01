import type { Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { isValidFen, parseUci, START_FEN, toUci } from '@/chess/helpers';
import type { Fen, LongColor, PromotionPiece, Uci } from '@/chess/types';
import { useChess } from '@/chess/useChess';
import { ENGINE_LEVELS, type EngineLevel, getLevel } from '@/engine/levels';
import { useEngine } from '@/engine/useEngine';
import {
  type ClockState,
  createClock,
  flagged,
  getTimeControl,
  pauseClock,
  pressClock,
  remaining,
  startClock,
  type TimeControl,
} from '@/lib/clock';
import { playSound } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { chooseLevelMove, ensureSkill, type SkillCache } from './engineMove';
import { useSettings } from '@/store/settings';
import {
  type BookDeviation,
  type BookState,
  bookReply,
  createBook,
  followBook,
} from './openingBook';
import {
  COACH_DEPTH,
  type CoachEvaluation,
  coachShouldInterrupt,
  type CoachVerdict,
  coachVerdict,
} from './coach';

export interface GameOver {
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: string;
  /** From the player's perspective. */
  verdict: 'win' | 'loss' | 'draw';
}

export type Opponent = 'engine' | 'human';

export interface GameSetup {
  color: LongColor | 'random';
  levelId: number;
  timeControlId: string;
  /** Start from this position instead of the initial one. */
  fen?: Fen;
  /** Play the engine (default) or a second person at the same device. */
  opponent?: Opponent;
  /** Two-player games: turn the board towards the side to move after every move. */
  autoFlip?: boolean;
  /** Pause after a mistake with an explanation and the offer to take it back (untimed engine games). */
  coach?: boolean;
  /** Practise this repertoire: the opponent follows its lines while the game stays in book. */
  book?: { id: string; name: string; color: LongColor; pgn: string };
}

/** Where the game stands with respect to the practised repertoire. */
export interface BookInfo {
  repertoireId: string;
  name: string;
  status: BookState['status'];
  endedAtPly: number | null;
  deviation: BookDeviation | null;
}

/** A coach interruption: the move just played and why it was bad. */
export interface CoachAlert {
  san: string;
  verdict: CoachVerdict;
}

export interface UsePlayVsEngine {
  game: ReturnType<typeof useChess>;
  /** Who plays the other side: the engine or a second person (hot-seat). */
  opponent: Opponent;
  playerColor: LongColor;
  level: EngineLevel;
  timeControl: TimeControl;
  /** FEN the current game started from. */
  startFen: Fen;
  /** Milliseconds left per side (updated ~10×/s while a clock runs). */
  clock: { white: number; black: number; running: LongColor | null };
  engineStatus: ReturnType<typeof useEngine>['status'];
  engineError: Error | null;
  thinking: boolean;
  started: boolean;
  gameOver: GameOver | null;
  hintShapes: DrawShape[];
  hinting: boolean;
  /** Suggested level after the last game, if the results call for a change. */
  suggestedLevel: EngineLevel | null;
  /** Coach mode is on for this game. */
  coach: boolean;
  /** The coach is checking the last move or waiting for a decision on it. */
  coachAlert: CoachAlert | null;
  coachChecking: boolean;
  /** Coach interruptions so far in this game. */
  coachInterventions: number;
  /** Take the flagged move back (coach) … */
  coachTakeBack: () => void;
  /** … or keep it and let the engine reply. */
  coachPlayOn: () => void;
  /** Opening practice: the repertoire being followed, if any. */
  book: BookInfo | null;
  /** The learner just left the repertoire: shown until they take it back or play on. */
  bookAlert: BookDeviation | null;
  bookTakeBack: () => void;
  bookPlayOn: () => void;
  start: (setup: GameSetup) => void;
  playerMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  /** Plays a typed move (SAN or UCI) for the player. Returns false if illegal. */
  playerNotation: (notation: string) => boolean;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  takeBack: () => void;
  resign: () => void;
  hint: () => void;
  /** Shows what the opponent is threatening to play next. */
  showThreat: () => void;
  flip: () => void;
  orientation: LongColor;
  pgn: () => string;
  retryEngine: () => Promise<void>;
}

const MIN_THINK_MS = 350;
const LOW_TIME_MS = 10_000;

export function usePlayVsEngine(): UsePlayVsEngine {
  const autoQueen = useSettings((s) => s.autoQueen);
  const settings = useSettings();
  const recordGame = useProgress((s) => s.recordGame);

  const game = useChess(START_FEN, { autoQueen });
  const { engine, status: engineStatus, error: engineError, start: startEngine } = useEngine();

  const [playerColor, setPlayerColor] = useState<LongColor>('white');
  const [orientation, setOrientation] = useState<LongColor>('white');
  const [opponent, setOpponent] = useState<Opponent>('engine');
  const [autoFlip, setAutoFlip] = useState(false);
  const [coach, setCoach] = useState(false);
  const [coachAlert, setCoachAlert] = useState<CoachAlert | null>(null);
  const [coachChecking, setCoachChecking] = useState(false);
  const [coachInterventions, setCoachInterventions] = useState(0);
  const [bookBase, setBookBase] = useState<BookState | null>(null);
  const [bookAlert, setBookAlert] = useState<BookDeviation | null>(null);
  /** Deviations already counted as lapses this game (by ply), so take-backs do not double-count. */
  const bookLapsesRef = useRef(new Set<number>());
  /** Evaluations of positions where it was the learner's turn, by FEN (for the coach). */
  const coachEvals = useRef(new Map<string, Promise<CoachEvaluation>>());
  const coachRunRef = useRef(0);
  const [levelId, setLevelId] = useState<number>(settings.playLevel);
  const [timeControlId, setTimeControlId] = useState<string>(settings.playTimeControl);
  const [started, setStarted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  const [hintShapes, setHintShapes] = useState<DrawShape[]>([]);
  const [hinting, setHinting] = useState(false);
  const [suggestedLevel, setSuggestedLevel] = useState<EngineLevel | null>(null);

  const level = useMemo(() => getLevel(levelId), [levelId]);
  const timeControl = useMemo(() => getTimeControl(timeControlId), [timeControlId]);
  const skillCache = useRef<SkillCache>({ skill: null });
  const searchIdRef = useRef(0);
  const recordedRef = useRef(false);
  const gameRef = useRef(game);
  gameRef.current = game;

  // Clock state lives in a ref (timestamps) and is mirrored to React state for display.
  const clockRef = useRef<ClockState>(createClock(timeControl));
  const [clockView, setClockView] = useState({
    white: 0,
    black: 0,
    running: null as LongColor | null,
  });
  const lowTimeWarnedRef = useRef<Set<LongColor>>(new Set());

  const { position } = game;
  const engineColor: LongColor = playerColor === 'white' ? 'black' : 'white';
  const hasClock = timeControl.initialMs > 0;
  const hotSeat = opponent === 'human';
  /** The side whose threats "Threat" shows: the engine, or whoever is not to move. */
  const rivalColor: LongColor = hotSeat
    ? position.turn === 'white'
      ? 'black'
      : 'white'
    : engineColor;

  // Two-player games can turn the board towards the side to move.
  useEffect(() => {
    if (hotSeat && autoFlip && started && !gameOver) setOrientation(position.turn);
  }, [hotSeat, autoFlip, started, gameOver, position.turn]);

  const bookNow = useMemo(
    () => (bookBase ? followBook(bookBase, position.history) : null),
    [bookBase, position.history],
  );
  const book: BookInfo | null = bookNow
    ? {
        repertoireId: bookNow.repertoireId,
        name: bookNow.name,
        status: bookNow.status,
        endedAtPly: bookNow.endedAtPly,
        deviation: bookNow.deviation,
      }
    : null;

  // Leaving the book: pause like the coach does and mark the forgotten move as lapsed.
  useEffect(() => {
    const deviation = bookNow?.status === 'deviated' ? bookNow.deviation : null;
    if (!bookNow || !deviation || gameOver) return;
    if (bookLapsesRef.current.has(deviation.ply)) return;
    bookLapsesRef.current.add(deviation.ply);
    if (deviation.cardKey) {
      useRepertoire.getState().review(bookNow.repertoireId, deviation.cardKey, 1);
    }
    playSound('failed');
    setBookAlert(deviation);
  }, [bookNow, gameOver]);

  const syncClockView = useCallback(() => {
    const now = Date.now();
    const state = clockRef.current;
    setClockView({
      white: remaining(state, 'white', now),
      black: remaining(state, 'black', now),
      running: state.running,
    });
  }, []);

  // Tick the clock while it runs; detect flags and low time.
  useEffect(() => {
    if (!hasClock || !started || gameOver || !clockView.running) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const state = clockRef.current;
      const lost = flagged(state, now);
      if (lost) {
        clockRef.current = pauseClock(state, now);
        syncClockView();
        engine().stop();
        searchIdRef.current++;
        setThinking(false);
        const winner: LongColor = lost === 'white' ? 'black' : 'white';
        playSound('gameEnd');
        setGameOver({
          result: winner === 'white' ? '1-0' : '0-1',
          reason: 'time',
          verdict: winner === playerColor ? 'win' : 'loss',
        });
        return;
      }
      const running = state.running;
      if (
        running &&
        (running === playerColor || hotSeat) &&
        remaining(state, running, now) <= LOW_TIME_MS &&
        !lowTimeWarnedRef.current.has(running)
      ) {
        lowTimeWarnedRef.current.add(running);
        playSound('lowTime');
      }
      syncClockView();
    }, 100);
    return () => window.clearInterval(id);
  }, [hasClock, started, gameOver, clockView.running, engine, playerColor, hotSeat, syncClockView]);

  // After every move, press the clock for the side that just moved.
  const lastPliesRef = useRef(0);
  useEffect(() => {
    const plies = position.history.length;
    if (!started || !hasClock || gameOver) {
      lastPliesRef.current = plies;
      return;
    }
    if (plies === lastPliesRef.current) return;
    const now = Date.now();
    if (plies < lastPliesRef.current) {
      // Take-back: just make sure the right side is on the clock.
      clockRef.current = startClock(pauseClock(clockRef.current, now), position.turn, now);
    } else {
      const mover: LongColor = position.turn === 'white' ? 'black' : 'white';
      clockRef.current =
        clockRef.current.running === null && plies === 1
          ? startClock(clockRef.current, position.turn, now) // first move starts the clock, no increment
          : pressClock(clockRef.current, mover, timeControl, now);
    }
    lastPliesRef.current = plies;
    syncClockView();
  }, [
    position.history.length,
    position.turn,
    started,
    hasClock,
    gameOver,
    timeControl,
    syncClockView,
  ]);

  // Detect game end on the board.
  useEffect(() => {
    if (!started || gameOver) return;
    if (!position.status.over) return;
    const { result, reason, winner } = position.status;
    const verdict: GameOver['verdict'] = winner
      ? winner === playerColor
        ? 'win'
        : 'loss'
      : 'draw';
    clockRef.current = pauseClock(clockRef.current, Date.now());
    syncClockView();
    playSound('gameEnd');
    setGameOver({
      result: result === '*' ? '1/2-1/2' : result,
      reason: reason ?? 'game over',
      verdict,
    });
  }, [position.status, started, gameOver, playerColor, syncClockView]);

  // Persist finished engine games once and work out a level suggestion.
  useEffect(() => {
    if (!gameOver || recordedRef.current) return;
    recordedRef.current = true;
    if (hotSeat) {
      setSuggestedLevel(null);
      return;
    }
    recordGame({
      level: level.id,
      color: playerColor,
      result: gameOver.result,
      reason: gameOver.reason,
      plies: position.history.length,
      pgn: gameRef.current.pgn(pgnHeaders(playerColor, level, timeControl, gameOver.result)),
      ...(bookNow
        ? {
            book: {
              repertoireId: bookNow.repertoireId,
              status: bookNow.status,
              endedAtPly: bookNow.endedAtPly,
              deviationPly: bookNow.deviation?.ply ?? null,
            },
          }
        : {}),
    });
    const recent = useProgress
      .getState()
      .games.filter((g) => g.level === level.id)
      .slice(0, 2);
    const verdicts = recent.map((g) =>
      g.result === '1/2-1/2'
        ? 'draw'
        : (g.color === 'white') === (g.result === '1-0')
          ? 'win'
          : 'loss',
    );
    if (verdicts.length === 2 && verdicts.every((v) => v === 'win')) {
      setSuggestedLevel(ENGINE_LEVELS.find((l) => l.id === level.id + 1) ?? null);
    } else if (verdicts.length === 2 && verdicts.every((v) => v === 'loss')) {
      setSuggestedLevel(ENGINE_LEVELS.find((l) => l.id === level.id - 1) ?? null);
    } else {
      setSuggestedLevel(null);
    }
  }, [
    gameOver,
    level,
    playerColor,
    position.history.length,
    recordGame,
    timeControl,
    hotSeat,
    bookNow,
  ]);

  const chooseEngineMove = useCallback(
    async (fen: string, movesUci: Uci[]): Promise<Uci | null> => {
      // Never let the engine think longer than a slice of its own remaining time.
      let depth = level.depth;
      let movetime = level.movetime;
      if (hasClock) {
        const left = remaining(clockRef.current, engineColor, Date.now());
        const budget = Math.max(50, Math.floor(left / 30));
        if (movetime !== undefined) movetime = Math.min(movetime, budget);
        if (depth !== undefined && left < 15_000) {
          // Fixed-depth searches can overrun when short on time: switch to a time budget.
          depth = undefined;
          movetime = Math.min(budget, 300);
        }
      }
      return chooseLevelMove(engine(), skillCache.current, {
        level,
        fen,
        moves: movesUci,
        legal: gameRef.current.position.dests,
        pieceAt: (square) => gameRef.current.chess().get(square),
        depth,
        movetime,
      });
    },
    [engine, level, hasClock, engineColor],
  );

  const evaluateForCoach = useCallback(
    (fen: string): Promise<CoachEvaluation> => {
      const cached = coachEvals.current.get(fen);
      if (cached) return cached;
      const promise = engine()
        .search({ fen, depth: COACH_DEPTH, multipv: 1 })
        .result.then((result) => {
          const info = result.lines.get(1);
          return {
            fen,
            score: info?.score ?? null,
            best: result.bestmove.move,
            pv: (info?.pv ?? []).slice(0, 6),
          };
        });
      coachEvals.current.set(fen, promise);
      promise.catch(() => coachEvals.current.delete(fen));
      return promise;
    },
    [engine],
  );

  // Coach mode: know the engine's opinion of the position before the learner moves.
  useEffect(() => {
    if (!coach || hotSeat || !started || gameOver || engineStatus !== 'ready') return;
    if (position.turn !== playerColor || thinking || coachChecking) return;
    void evaluateForCoach(position.fen).catch(() => undefined);
  }, [
    coach,
    hotSeat,
    started,
    gameOver,
    engineStatus,
    position.turn,
    position.fen,
    playerColor,
    thinking,
    coachChecking,
    evaluateForCoach,
  ]);

  // Engine moves whenever it is its turn (from the repertoire while the game is in book).
  useEffect(() => {
    if (hotSeat) return;
    if (coachChecking || coachAlert || bookAlert) return;
    if (!started || gameOver || position.turn !== engineColor || game.pendingPromotion) return;
    if (engineStatus !== 'ready') return;
    const id = ++searchIdRef.current;
    let cancelled = false;
    setThinking(true);
    const startedAt = Date.now();
    const movesUci = position.history.map((m) => toUci(m));
    const bookMove =
      bookNow?.status === 'in-book' ? bookReply(bookNow, useRepertoire.getState().cards) : null;
    const choose = bookMove
      ? Promise.resolve<Uci | null>(bookMove)
      : chooseEngineMove(position.startFen, movesUci);

    void choose
      .then(async (uci) => {
        if (cancelled || id !== searchIdRef.current || !uci) return;
        const wait = Math.max(0, MIN_THINK_MS - (Date.now() - startedAt));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (cancelled || id !== searchIdRef.current) return;
        gameRef.current.playNotation(uci);
      })
      .catch((err: unknown) => console.error('Engine move failed', err))
      .finally(() => {
        if (id === searchIdRef.current) setThinking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    started,
    gameOver,
    position.turn,
    position.history,
    position.startFen,
    engineColor,
    engineStatus,
    chooseEngineMove,
    game.pendingPromotion,
    hotSeat,
    coachChecking,
    coachAlert,
    bookAlert,
    bookNow,
  ]);

  const start = useCallback(
    ({
      color,
      levelId: nextLevelId,
      timeControlId: nextTc,
      fen,
      opponent: nextOpponent = 'engine',
      autoFlip: nextAutoFlip = false,
      coach: nextCoach = false,
      book: nextBook,
    }: GameSetup) => {
      engine().stop();
      searchIdRef.current++;
      // A repertoire decides the colour and the opponent; the book only makes sense from the start.
      const bookState = nextBook && nextOpponent === 'engine' && !fen ? createBook(nextBook) : null;
      const chosen: LongColor = bookState
        ? bookState.color
        : color === 'random'
          ? Math.random() < 0.5
            ? 'white'
            : 'black'
          : color;
      setBookBase(bookState);
      setBookAlert(null);
      bookLapsesRef.current = new Set();
      const control = getTimeControl(nextTc);
      setOpponent(nextOpponent);
      setAutoFlip(nextAutoFlip);
      // The coach needs the engine free between moves and no clock to run down.
      setCoach(nextCoach && nextOpponent === 'engine' && control.initialMs === 0);
      setCoachAlert(null);
      setCoachChecking(false);
      setCoachInterventions(0);
      coachEvals.current = new Map();
      coachRunRef.current++;
      setPlayerColor(chosen);
      setOrientation(chosen);
      setLevelId(nextLevelId);
      setTimeControlId(control.id);
      setGameOver(null);
      setSuggestedLevel(null);
      setHintShapes([]);
      setThinking(false);
      recordedRef.current = false;
      lowTimeWarnedRef.current = new Set();
      clockRef.current = createClock(control);
      lastPliesRef.current = 0;
      setClockView({ white: control.initialMs, black: control.initialMs, running: null });
      game.reset(fen && isValidFen(fen) ? fen : START_FEN);
      void engine()
        .newGame()
        .catch(() => undefined);
      setStarted(true);
      useSettings
        .getState()
        .update({ playLevel: nextLevelId, playColor: color, playTimeControl: control.id });
    },
    [engine, game],
  );

  const canPlayerMove =
    started &&
    !gameOver &&
    !thinking &&
    !coachChecking &&
    !coachAlert &&
    !bookAlert &&
    (hotSeat || position.turn === playerColor);

  /** After the learner's move: let the coach judge it before the engine answers. */
  const coachCheck = useCallback(
    (fenBefore: string, san: string, uci: Uci) => {
      if (!coach || engineStatus !== 'ready') return;
      const run = ++coachRunRef.current;
      setCoachChecking(true);
      // The React snapshot lags one render behind; the live instance already has the move.
      const fenAfter = gameRef.current.chess().fen();
      void Promise.all([evaluateForCoach(fenBefore), evaluateForCoach(fenAfter)])
        .then(([before, after]) => {
          if (run !== coachRunRef.current) return;
          const verdict = coachVerdict(before, san, uci, after);
          if (coachShouldInterrupt(verdict)) {
            playSound('failed');
            setCoachInterventions((n) => n + 1);
            setCoachAlert({ san, verdict });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (run === coachRunRef.current) setCoachChecking(false);
        });
    },
    [coach, engineStatus, evaluateForCoach],
  );

  const playerMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (!canPlayerMove) return;
      setHintShapes([]);
      const fenBefore = position.fen;
      const move = game.playMove(from, to, promotion);
      if (move && move !== 'promotion' && !hotSeat) coachCheck(fenBefore, move.san, toUci(move));
    },
    [canPlayerMove, game, position.fen, hotSeat, coachCheck],
  );

  const playerNotation = useCallback(
    (notation: string): boolean => {
      if (!canPlayerMove) return false;
      setHintShapes([]);
      const fenBefore = position.fen;
      const move = game.playNotation(notation);
      if (move && !hotSeat) coachCheck(fenBefore, move.san, toUci(move));
      return move !== null;
    },
    [canPlayerMove, game, position.fen, hotSeat, coachCheck],
  );

  const coachTakeBack = useCallback(() => {
    if (!coachAlert) return;
    coachRunRef.current++;
    setCoachAlert(null);
    setCoachChecking(false);
    game.undo();
  }, [coachAlert, game]);

  const coachPlayOn = useCallback(() => {
    setCoachAlert(null);
  }, []);

  const bookTakeBack = useCallback(() => {
    if (!bookAlert) return;
    setBookAlert(null);
    game.undo();
  }, [bookAlert, game]);

  const bookPlayOn = useCallback(() => {
    setBookAlert(null);
  }, []);

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const fenBefore = position.fen;
      const move = game.resolvePromotion(piece);
      if (move && !hotSeat) coachCheck(fenBefore, move.san, toUci(move));
    },
    [game, position.fen, hotSeat, coachCheck],
  );

  const takeBack = useCallback(() => {
    if (!started || position.history.length === 0) return;
    engine().stop();
    searchIdRef.current++;
    coachRunRef.current++;
    setCoachAlert(null);
    setCoachChecking(false);
    setBookAlert(null);
    setThinking(false);
    setHintShapes([]);
    setGameOver(null);
    recordedRef.current = false;
    // Undo back to the player's previous turn (one ply between two people).
    if (!hotSeat && position.turn === playerColor) {
      game.undo();
      if (gameRef.current.position.history.length > 0) game.undo();
    } else {
      game.undo();
    }
  }, [started, position.history.length, position.turn, playerColor, engine, game, hotSeat]);

  const resign = useCallback(() => {
    if (!started || gameOver) return;
    engine().stop();
    searchIdRef.current++;
    setThinking(false);
    clockRef.current = pauseClock(clockRef.current, Date.now());
    syncClockView();
    // Between two people the side to move resigns.
    const resigning: LongColor = hotSeat ? position.turn : playerColor;
    setGameOver({
      result: resigning === 'white' ? '0-1' : '1-0',
      reason: 'resignation',
      verdict: resigning === playerColor ? 'loss' : 'win',
    });
  }, [started, gameOver, engine, playerColor, syncClockView, hotSeat, position.turn]);

  const askEngine = useCallback(
    async (fen: string, moves: Uci[]): Promise<Uci | null> => {
      const client = engine();
      await ensureSkill(client, skillCache.current, 20);
      const handle = client.search({ fen, moves, depth: 14, multipv: 1 });
      const result = await handle.result;
      return result.bestmove.move;
    },
    [engine],
  );

  const hint = useCallback(() => {
    if (!canPlayerMove || engineStatus !== 'ready') return;
    setHinting(true);
    const movesUci = position.history.map((m) => toUci(m));
    void askEngine(position.startFen, movesUci)
      .then((best) => {
        if (!best) return;
        const { from, to } = parseUci(best);
        setHintShapes([{ orig: from, dest: to, brush: 'paleBlue' }]);
      })
      .finally(() => setHinting(false));
  }, [canPlayerMove, engineStatus, position, askEngine]);

  const showThreat = useCallback(() => {
    if (!canPlayerMove || engineStatus !== 'ready' || position.inCheck) return;
    // Ask what the opponent would play if it were their move: flip the side to move.
    const parts = position.fen.split(' ');
    parts[1] = rivalColor === 'white' ? 'w' : 'b';
    parts[3] = '-';
    setHinting(true);
    void askEngine(parts.join(' '), [])
      .then((best) => {
        if (!best) return;
        const { from, to } = parseUci(best);
        setHintShapes([{ orig: from, dest: to, brush: 'red' }]);
      })
      .finally(() => setHinting(false));
  }, [canPlayerMove, engineStatus, position.inCheck, position.fen, rivalColor, askEngine]);

  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), []);

  const pgn = useCallback(
    () => game.pgn(pgnHeaders(playerColor, level, timeControl, gameOver?.result ?? '*', opponent)),
    [game, playerColor, level, timeControl, gameOver, opponent],
  );

  return {
    game,
    opponent,
    playerColor,
    level,
    timeControl,
    startFen: position.startFen,
    clock: clockView,
    engineStatus,
    engineError,
    thinking,
    started,
    gameOver,
    hintShapes,
    hinting,
    suggestedLevel,
    coach,
    coachAlert,
    coachChecking,
    coachInterventions,
    coachTakeBack,
    coachPlayOn,
    book,
    bookAlert,
    bookTakeBack,
    bookPlayOn,
    start,
    playerMove,
    playerNotation,
    resolvePromotion,
    takeBack,
    resign,
    hint,
    showThreat,
    flip,
    orientation,
    pgn,
    retryEngine: startEngine,
  };
}

function pgnHeaders(
  playerColor: LongColor,
  level: EngineLevel,
  timeControl: TimeControl,
  result: string,
  opponent: Opponent = 'engine',
): Record<string, string> {
  const engineName = `Stockfish (level ${level.id} · ${level.name})`;
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hotSeat = opponent === 'human';
  const headers: Record<string, string> = {
    Event: hotSeat ? 'Chess Trainer — two players' : 'Chess Trainer — play vs engine',
    Site: 'Chess Trainer',
    Date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    White: hotSeat ? 'White' : playerColor === 'white' ? 'You' : engineName,
    Black: hotSeat ? 'Black' : playerColor === 'black' ? 'You' : engineName,
    Result: result,
  };
  if (timeControl.initialMs > 0) {
    headers.TimeControl = `${timeControl.initialMs / 1000}+${timeControl.incrementMs / 1000}`;
  }
  return headers;
}

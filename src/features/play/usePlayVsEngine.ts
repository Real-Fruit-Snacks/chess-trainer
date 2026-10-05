import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { type BlunderWarning, checkBlunder } from '@/chess/blunderCheck';
import {
  canStillMate,
  isPromotionMove,
  isValidFen,
  parseUci,
  START_FEN,
  toUci,
  tryMove,
  tryNotation,
  uciToSan,
} from '@/chess/helpers';
import type { Fen, LongColor, MoveInput, PromotionPiece, Uci } from '@/chess/types';
import { useChess } from '@/chess/useChess';
import { ENGINE_LEVELS, type EngineLevel, getLevel } from '@/engine/levels';
import { humanThinkMs, sampleHumanMove } from '@/engine/maia/encoding';
import { maiaClient, type MaiaStatus, useMaiaStatus } from '@/engine/maia/maiaClient';
import { isHumanRating, stepHumanRating } from '@/engine/maia/ratings';
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
import { gameEndSound, playSound } from '@/lib/sound';
import { type GameRecordSource, useProgress } from '@/store/progress';
import { cardsFor, useRepertoire } from '@/store/repertoire';
import { chooseLevelMove, ensureSkill, type SkillCache } from './engineMove';
import { type PlayOpponent, useSettings } from '@/store/settings';
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

/**
 * Who plays the other side: the engine at one of its levels, the human-like
 * opponent (a model trained on people's games, at a rating), or a second
 * person at the same device.
 */
export type Opponent = PlayOpponent;

export interface GameSetup {
  color: LongColor | 'random';
  levelId: number;
  timeControlId: string;
  /** Start from this position instead of the initial one. */
  fen?: Fen;
  /** Play the engine (default), the human-like opponent or a second person at the same device. */
  opponent?: Opponent;
  /** Games against the human-like opponent: the rating it plays at. */
  humanRating?: number;
  /** Two-player games: turn the board towards the side to move after every move. */
  autoFlip?: boolean;
  /** Pause after a mistake with an explanation and the offer to take it back (untimed games against the computer). */
  coach?: boolean;
  /**
   * Hold back a move that hangs material or allows mate, asking "checks,
   * captures, threats?" first (games against the computer).
   */
  blunderCheck?: boolean;
  /** Practise this repertoire: the opponent follows its lines while the game stays in book. */
  book?: { id: string; name: string; color: LongColor; pgn: string };
  /**
   * Which mode the finished game is recorded under (default `'play'`; a book
   * game is recorded as `'book'` automatically). Arcade pages pass `'arcade'`
   * so handicap games stay out of the engine ladder, the courses and Progress.
   */
  source?: GameRecordSource;
  /** What the mode calls the game, e.g. "Odds Ladder · queen odds" (also the PGN Event). */
  event?: string;
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

/** A move the blunder check held back, waiting for the learner's decision. */
export interface BlunderAlert {
  warning: BlunderWarning;
  /** "Show me" was pressed: the answer is drawn and named. */
  revealed: boolean;
  /** The move as asked for, played as it is if the learner insists. */
  input: MoveInput;
}

/** What the Hint or Threat arrow shows, in words (the arrow alone is invisible to a screen reader). */
export interface HintMove {
  kind: 'hint' | 'threat';
  san: string;
}

export interface UsePlayVsEngine {
  game: ReturnType<typeof useChess>;
  /** Who plays the other side: the engine, the human-like opponent or a second person (hot-seat). */
  opponent: Opponent;
  playerColor: LongColor;
  level: EngineLevel;
  /** The rating the human-like opponent plays at (its games). */
  humanRating: number;
  /** The human-like opponent's model: loading, ready, or failed (with why). */
  humanStatus: MaiaStatus;
  humanError: string | null;
  /** Why the human-like opponent could not choose its last move (the model itself loaded). */
  humanMoveError: string | null;
  /** Loads the human-like opponent again after a failure, and asks it for its move again. */
  retryHuman: () => void;
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
  /** The move the hint or threat arrow points at, for a text alternative. */
  hintMove: HintMove | null;
  hinting: boolean;
  /** Suggested level after the last game, if the results call for a change. */
  suggestedLevel: EngineLevel | null;
  /** The same for the human-like opponent: a rating a step up or down. */
  suggestedRating: number | null;
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
  /** The blunder check is on for this game. */
  blunderCheck: boolean;
  /** A move held back by the blunder check, until the learner decides. */
  blunderAlert: BlunderAlert | null;
  /** Moves the blunder check held back in this game. */
  blunderStops: number;
  /** Dismiss the warning and choose another move. */
  blunderLookAgain: () => void;
  /** Draw and name the answer the check found. */
  blunderShowMe: () => void;
  /** Play the held-back move after all. */
  blunderPlayAnyway: () => void;
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

/** The opponent's next move, and how long to look as if thinking about it. */
interface EngineChoice {
  uci: Uci;
  thinkMs: number;
}

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
  const [blunderCheck, setBlunderCheck] = useState(false);
  const [blunderAlert, setBlunderAlert] = useState<BlunderAlert | null>(null);
  const [blunderStops, setBlunderStops] = useState(0);
  /** Held-back moves already counted this game (by position and move), so a retry is not a second stop. */
  const blunderCountedRef = useRef(new Set<string>());
  const [bookBase, setBookBase] = useState<BookState | null>(null);
  const [bookAlert, setBookAlert] = useState<BookDeviation | null>(null);
  /** Deviations already counted as lapses this game (by ply and move), so a repeat is not a second lapse. */
  const bookLapsesRef = useRef(new Set<string>());
  const [source, setSource] = useState<GameRecordSource>('play');
  const [event, setEvent] = useState<string | undefined>(undefined);
  /** Evaluations of positions where it was the learner's turn, by FEN (for the coach). */
  const coachEvals = useRef(new Map<string, Promise<CoachEvaluation>>());
  const coachRunRef = useRef(0);
  const [levelId, setLevelId] = useState<number>(settings.playLevel);
  const [timeControlId, setTimeControlId] = useState<string>(settings.playTimeControl);
  const [started, setStarted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  /** The arrow Hint or Threat drew, with its move in words. */
  const [hintArrow, setHintArrow] = useState<(HintMove & { shape: DrawShape }) | null>(null);
  const hintShapes = useMemo<DrawShape[]>(() => {
    const shapes: DrawShape[] = hintArrow ? [hintArrow.shape] : [];
    // "Show me": the move that was held back, and the answer that punishes it.
    if (blunderAlert?.revealed) {
      const { move, reply } = blunderAlert.warning;
      shapes.push({ orig: move.from, dest: move.to, brush: 'paleBlue' });
      shapes.push({ orig: reply.from, dest: reply.to, brush: 'red' });
    }
    return shapes;
  }, [hintArrow, blunderAlert]);
  const hintMove = useMemo<HintMove | null>(
    () => (hintArrow ? { kind: hintArrow.kind, san: hintArrow.san } : null),
    [hintArrow],
  );
  const [hinting, setHinting] = useState(false);
  const [suggestedLevel, setSuggestedLevel] = useState<EngineLevel | null>(null);
  const [suggestedRating, setSuggestedRating] = useState<number | null>(null);
  const [humanRating, setHumanRating] = useState<number>(settings.playHumanRating);
  const { status: humanStatus, error: humanError } = useMaiaStatus();
  const [humanMoveError, setHumanMoveError] = useState<string | null>(null);
  /** Bumped by Retry, so the opponent's turn is played again after a failed move. */
  const [humanRetries, setHumanRetries] = useState(0);

  const level = useMemo(() => getLevel(levelId), [levelId]);
  const timeControl = useMemo(() => getTimeControl(timeControlId), [timeControlId]);
  const skillCache = useRef<SkillCache>({ skill: null });
  /** The engine instance the skill cache belongs to: a fresh worker (Retry) starts at Skill 20. */
  const skillClientRef = useRef<ReturnType<typeof engine> | null>(null);
  const searchIdRef = useRef(0);
  /** Bumped by every hint or threat request (and a new game): only the latest may draw. */
  const hintRunRef = useRef(0);
  const recordedRef = useRef(false);
  const gameRef = useRef(game);
  gameRef.current = game;
  /** The latest result, for handlers that may run from a render or two ago. */
  const gameOverRef = useRef(gameOver);
  gameOverRef.current = gameOver;

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

  /** The engine client, with the skill cache reset whenever the instance changed. */
  const client = useCallback(() => {
    const instance = engine();
    if (skillClientRef.current !== instance) {
      skillClientRef.current = instance;
      skillCache.current = { skill: null };
    }
    return instance;
  }, [engine]);
  const hasClock = timeControl.initialMs > 0;
  const hotSeat = opponent === 'human';
  const humanlike = opponent === 'humanlike';
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

  // Leaving the book: pause like the coach does and mark the forgotten move as lapsed. The alert
  // shows every time the learner leaves the book (also after a take-back and the same move again);
  // the lapse is counted once per ply and move so a repeat is not a second miss.
  const playedPlies = position.history.length;
  const positionOver = position.status.over;
  useEffect(() => {
    const deviation = bookNow?.status === 'deviated' ? bookNow.deviation : null;
    if (!bookNow || !deviation || gameOver) return;
    // Only the move that left the book raises it: the deviation stays on record for the rest of a
    // game played on, and the engine's replies must not bring the alert back.
    if (playedPlies !== deviation.ply) return;
    const key = `${deviation.ply}:${deviation.played}`;
    if (!bookLapsesRef.current.has(key)) {
      bookLapsesRef.current.add(key);
      if (deviation.cardKey) {
        useRepertoire.getState().review(bookNow.repertoireId, deviation.cardKey, 1);
      }
    }
    // A move that ended the game is reported in the summary; there is nothing left to pause.
    if (positionOver) return;
    playSound('failed');
    setBookAlert(deviation);
  }, [bookNow, gameOver, playedPlies, positionOver]);

  const syncClockView = useCallback(() => {
    const now = Date.now();
    const state = clockRef.current;
    setClockView({
      white: remaining(state, 'white', now),
      black: remaining(state, 'black', now),
      running: state.running,
    });
  }, []);

  // A book alert pauses the game: neither clock runs until the learner decides. Only a clock the
  // alert stopped is restarted (the first move starts the clocks itself, without an increment).
  const alertPausedRef = useRef(false);
  useEffect(() => {
    if (!hasClock || !started || gameOver) {
      alertPausedRef.current = false;
      return;
    }
    const now = Date.now();
    if (bookAlert) {
      if (clockRef.current.running === null) return;
      clockRef.current = pauseClock(clockRef.current, now);
      alertPausedRef.current = true;
      syncClockView();
    } else if (alertPausedRef.current) {
      alertPausedRef.current = false;
      clockRef.current = startClock(clockRef.current, position.turn, now);
      syncClockView();
    }
  }, [bookAlert, hasClock, started, gameOver, position.turn, syncClockView]);

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
        // A promotion still being chosen must not land in the finished game.
        if (gameRef.current.pendingPromotion) gameRef.current.resolvePromotion(null);
        const winner: LongColor = lost === 'white' ? 'black' : 'white';
        // A flag against a side that cannot mate any more is a draw (FIDE 6.9).
        const decisive = canStillMate(gameRef.current.chess(), winner);
        const verdict: GameOver['verdict'] = !decisive
          ? 'draw'
          : winner === playerColor
            ? 'win'
            : 'loss';
        playSound(gameEndSound(verdict, hotSeat));
        setGameOver({
          result: !decisive ? '1/2-1/2' : winner === 'white' ? '1-0' : '0-1',
          reason: decisive ? 'time' : 'time, with no mating material left',
          verdict,
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
    playSound(gameEndSound(verdict, hotSeat));
    setGameOver({
      result: result === '*' ? '1/2-1/2' : result,
      reason: reason ?? 'game over',
      verdict,
    });
  }, [position.status, started, gameOver, playerColor, hotSeat, syncClockView]);

  // Persist finished games against the computer once and work out a level (or rating) suggestion.
  useEffect(() => {
    if (!gameOver || recordedRef.current) return;
    recordedRef.current = true;
    if (hotSeat) {
      setSuggestedLevel(null);
      return;
    }
    recordGame({
      // The human-like opponent has a rating rather than an engine level.
      level: humanlike ? 0 : level.id,
      ...(humanlike ? { opponentRating: humanRating } : {}),
      color: playerColor,
      result: gameOver.result,
      reason: gameOver.reason,
      plies: position.history.length,
      pgn: gameRef.current.pgn(
        pgnHeaders(playerColor, level, timeControl, gameOver.result, opponent, event, humanRating),
      ),
      source: humanlike ? 'humanlike' : bookNow ? 'book' : source,
      ...(event ? { event } : {}),
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
      .games.filter((g) =>
        humanlike
          ? g.source === 'humanlike' && g.opponentRating === humanRating
          : g.source !== 'humanlike' && g.level === level.id,
      )
      .slice(0, 2);
    const verdicts = recent.map((g) =>
      g.result === '1/2-1/2'
        ? 'draw'
        : (g.color === 'white') === (g.result === '1-0')
          ? 'win'
          : 'loss',
    );
    if (humanlike) {
      // Two wins in a row at a rating: a hundred points up; two losses: a hundred down.
      const twoWins = verdicts.length === 2 && verdicts.every((v) => v === 'win');
      const twoLosses = verdicts.length === 2 && verdicts.every((v) => v === 'loss');
      const next = stepHumanRating(humanRating, twoWins ? 1 : twoLosses ? -1 : 0);
      setSuggestedLevel(null);
      setSuggestedRating(next !== humanRating ? next : null);
      return;
    }
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
    humanlike,
    humanRating,
    opponent,
    bookNow,
    source,
    event,
  ]);

  // The human-like opponent's model loads with its first game; Retry loads it again after a failure.
  // The model loads when a game against it starts, and again if it was stopped mid-game (its
  // files deleted from another tab, say). A failure waits for Retry.
  useEffect(() => {
    if (!humanlike || !started || humanStatus !== 'idle') return;
    void maiaClient()
      .load()
      .catch(() => undefined);
  }, [humanlike, started, humanStatus]);
  const retryHuman = useCallback(() => {
    setHumanMoveError(null);
    setHumanRetries((n) => n + 1);
    if (maiaClient().status !== 'ready') {
      void maiaClient()
        .load()
        .catch(() => undefined);
    }
  }, []);

  const chooseEngineMove = useCallback(
    async (fen: string, movesUci: Uci[]): Promise<EngineChoice | null> => {
      if (humanlike) {
        // A move as a player of the rating might choose it, after a pause as long as theirs.
        const live = gameRef.current.position;
        const prediction = await maiaClient().predict(live.fen, humanRating);
        const move = sampleHumanMove(prediction.moves);
        if (!move) return null;
        const clockMs = hasClock ? remaining(clockRef.current, engineColor, Date.now()) : null;
        return {
          uci: move.uci,
          thinkMs: humanThinkMs(prediction.moves, { ply: live.history.length, clockMs }),
        };
      }
      // Never let the engine think longer than a slice of its own remaining time.
      const depth = level.depth;
      let movetime = level.movetime;
      if (hasClock) {
        const left = remaining(clockRef.current, engineColor, Date.now());
        const budget = Math.max(50, Math.floor(left / 30));
        if (movetime !== undefined) movetime = Math.min(movetime, budget);
        if (depth !== undefined && left < 15_000) {
          // Fixed-depth searches can overrun when short on time: keep the depth (so a weak level
          // stays weak) and add the time budget as a second limit — whichever comes first ends it.
          movetime = Math.min(budget, 300);
        }
      }
      const uci = await chooseLevelMove(client(), skillCache.current, {
        level,
        fen,
        moves: movesUci,
        legal: gameRef.current.position.dests,
        pieceAt: (square) => gameRef.current.chess().get(square),
        depth,
        movetime,
      });
      return uci ? { uci, thinkMs: MIN_THINK_MS } : null;
    },
    [client, level, hasClock, engineColor, humanlike, humanRating],
  );

  const evaluateForCoach = useCallback(
    (fen: string): Promise<CoachEvaluation> => {
      const cached = coachEvals.current.get(fen);
      if (cached) return cached;
      const promise = (async (): Promise<CoachEvaluation> => {
        const engineClient = client();
        // The coach judges at full strength, whatever level the learner is playing against.
        await ensureSkill(engineClient, skillCache.current, 20);
        const result = await engineClient.search({ fen, depth: COACH_DEPTH, multipv: 1 }).result;
        // A stopped search is shallow and must not be remembered for the rest of the game.
        if (result.stopped) throw new Error('Coach search stopped');
        const info = result.lines.get(1);
        return {
          fen,
          score: info?.score ?? null,
          // Skill Level can make `bestmove` differ from the top line; the line is the real opinion.
          best: info?.pv[0] ?? result.bestmove.move,
          pv: (info?.pv ?? []).slice(0, 6),
        };
      })();
      coachEvals.current.set(fen, promise);
      promise.catch(() => {
        if (coachEvals.current.get(fen) === promise) coachEvals.current.delete(fen);
      });
      return promise;
    },
    [client],
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
    if (humanlike ? humanStatus !== 'ready' || humanMoveError !== null : engineStatus !== 'ready') {
      return;
    }
    const id = ++searchIdRef.current;
    let cancelled = false;
    setThinking(true);
    const startedAt = Date.now();
    const movesUci = position.history.map((m) => toUci(m));
    const bookMove =
      bookNow?.status === 'in-book'
        ? bookReply(bookNow, cardsFor(useRepertoire.getState().cards, bookNow.repertoireId))
        : null;
    const choose = bookMove
      ? Promise.resolve<EngineChoice | null>({ uci: bookMove, thinkMs: MIN_THINK_MS })
      : chooseEngineMove(position.startFen, movesUci);

    void choose
      .then(async (choice) => {
        if (cancelled || id !== searchIdRef.current || !choice) return;
        // The "thinking" pause reads naturally, but not when it could flag the opponent.
        const engineLeft = hasClock
          ? remaining(clockRef.current, engineColor, Date.now())
          : Number.POSITIVE_INFINITY;
        const wait =
          engineLeft < LOW_TIME_MS ? 0 : Math.max(0, choice.thinkMs - (Date.now() - startedAt));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (cancelled || id !== searchIdRef.current) return;
        gameRef.current.playNotation(choice.uci);
      })
      .catch((err: unknown) => {
        if (cancelled || id !== searchIdRef.current) return;
        // A model that crashed or was stopped says so through its status (with a Retry); a
        // prediction that failed on its own would otherwise leave the game waiting for ever.
        if (humanlike && maiaClient().status === 'ready') {
          setHumanMoveError(err instanceof Error ? err.message : String(err));
          return;
        }
        console.error('Engine move failed', err);
      })
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
    humanlike,
    humanStatus,
    humanMoveError,
    humanRetries,
    coachChecking,
    coachAlert,
    bookAlert,
    bookNow,
    hasClock,
  ]);

  const start = useCallback(
    ({
      color,
      levelId: nextLevelId,
      timeControlId: nextTc,
      fen,
      opponent: nextOpponent = 'engine',
      humanRating: nextHumanRating,
      autoFlip: nextAutoFlip = false,
      coach: nextCoach = false,
      blunderCheck: nextBlunderCheck = false,
      book: nextBook,
      source: nextSource = 'play',
      event: nextEvent,
    }: GameSetup) => {
      engine().stop();
      searchIdRef.current++;
      // A repertoire decides the colour and the opponent; the book only makes sense from the start.
      let bookState: BookState | null = null;
      if (nextBook && nextOpponent !== 'human' && !fen) {
        try {
          bookState = createBook(nextBook);
        } catch (err) {
          // A damaged custom repertoire: play an ordinary game rather than not start at all.
          console.warn('The repertoire could not be read; playing without the book.', err);
        }
      }
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
      setSource(nextSource);
      setEvent(nextEvent);
      const control = getTimeControl(nextTc);
      setOpponent(nextOpponent);
      if (isHumanRating(nextHumanRating)) setHumanRating(nextHumanRating);
      setAutoFlip(nextAutoFlip);
      // The coach needs the engine free between moves and no clock to run down. Against the
      // human-like opponent it judges with Stockfish all the same.
      setCoach(nextCoach && nextOpponent !== 'human' && control.initialMs === 0);
      setCoachAlert(null);
      setCoachChecking(false);
      setCoachInterventions(0);
      coachEvals.current = new Map();
      coachRunRef.current++;
      setBlunderCheck(nextBlunderCheck && nextOpponent !== 'human');
      setBlunderAlert(null);
      setBlunderStops(0);
      blunderCountedRef.current = new Set();
      setPlayerColor(chosen);
      setOrientation(chosen);
      setLevelId(nextLevelId);
      setTimeControlId(control.id);
      setGameOver(null);
      setSuggestedLevel(null);
      setSuggestedRating(null);
      setHumanMoveError(null);
      hintRunRef.current++;
      setHintArrow(null);
      setHinting(false);
      setThinking(false);
      recordedRef.current = false;
      lowTimeWarnedRef.current = new Set();
      clockRef.current = createClock(control);
      lastPliesRef.current = 0;
      alertPausedRef.current = false;
      setClockView({ white: control.initialMs, black: control.initialMs, running: null });
      game.reset(fen && isValidFen(fen) ? fen : START_FEN);
      void engine()
        .newGame()
        .catch(() => undefined);
      setStarted(true);
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
      // The React snapshot lags one render behind; the live instance already has the move.
      const live = gameRef.current.chess();
      // A move that ends the game (mate, stalemate, a draw) is not a mistake to pause over.
      if (live.isGameOver()) return;
      const fenAfter = live.fen();
      const run = ++coachRunRef.current;
      setCoachChecking(true);
      // One search at a time: a second request would stop the first at a shallow depth.
      void evaluateForCoach(fenBefore)
        .then(async (before) => {
          if (run !== coachRunRef.current) return;
          const after = await evaluateForCoach(fenAfter);
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

  /**
   * The blunder check: holds `input` back (and says why) when it hangs
   * material or allows mate. True when the move was held back.
   */
  const holdBack = useCallback(
    (input: MoveInput): boolean => {
      if (!blunderCheck || hotSeat) return false;
      const live = gameRef.current.chess();
      // A move that ends the game — mate, or a draw by repetition the live game can see — is
      // never held back. The live game has the history a position alone lacks.
      const probe = tryMove(live, input);
      if (!probe) return false;
      const over = live.isGameOver();
      live.undo();
      if (over) return false;
      const fen = live.fen();
      const warning = checkBlunder(fen, input);
      if (!warning) return false;
      const key = `${fen}|${warning.move.uci}`;
      if (!blunderCountedRef.current.has(key)) {
        blunderCountedRef.current.add(key);
        setBlunderStops((n) => n + 1);
        useProgress.getState().recordBlunderCheck('stopped');
      }
      playSound('notify');
      setBlunderAlert({ warning, revealed: false, input });
      return true;
    },
    [blunderCheck, hotSeat],
  );

  const playerMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (!canPlayerMove) return;
      setHintArrow(null);
      setBlunderAlert(null);
      // A promotion still waiting for its piece is checked once the piece is chosen.
      const promotes = isPromotionMove(gameRef.current.chess(), from, to);
      const piece = promotion ?? (promotes && autoQueen ? 'q' : undefined);
      if ((!promotes || piece) && holdBack({ from, to, ...(piece ? { promotion: piece } : {}) })) {
        return;
      }
      const fenBefore = position.fen;
      const move = game.playMove(from, to, promotion);
      if (move && move !== 'promotion' && !hotSeat) coachCheck(fenBefore, move.san, toUci(move));
    },
    [canPlayerMove, game, position.fen, hotSeat, coachCheck, holdBack, autoQueen],
  );

  const playerNotation = useCallback(
    (notation: string): boolean => {
      if (!canPlayerMove) return false;
      setHintArrow(null);
      setBlunderAlert(null);
      if (blunderCheck && !hotSeat) {
        const typed = tryNotation(new Chess(gameRef.current.chess().fen()), notation, {
          autoQueen,
        });
        if (!typed) return false;
        const input: MoveInput = { from: typed.from, to: typed.to };
        if (typed.promotion) input.promotion = typed.promotion as PromotionPiece;
        // Held back: the typed move was understood, so the field clears.
        if (holdBack(input)) return true;
      }
      const fenBefore = position.fen;
      const move = game.playNotation(notation);
      if (move && !hotSeat) coachCheck(fenBefore, move.san, toUci(move));
      return move !== null;
    },
    [canPlayerMove, game, position.fen, hotSeat, coachCheck, blunderCheck, holdBack, autoQueen],
  );

  const blunderLookAgain = useCallback(() => setBlunderAlert(null), []);

  const blunderShowMe = useCallback(
    () => setBlunderAlert((alert) => (alert ? { ...alert, revealed: true } : alert)),
    [],
  );

  const blunderPlayAnyway = useCallback(() => {
    const alert = blunderAlert;
    setBlunderAlert(null);
    if (!alert || !canPlayerMove) return;
    useProgress.getState().recordBlunderCheck('played-anyway');
    setHintArrow(null);
    const fenBefore = position.fen;
    const { from, to, promotion } = alert.input;
    const move = game.playMove(from, to, promotion);
    if (move && move !== 'promotion' && !hotSeat) coachCheck(fenBefore, move.san, toUci(move));
  }, [blunderAlert, canPlayerMove, position.fen, game, hotSeat, coachCheck]);

  /** Dismisses the pause alerts: resolving one must not leave another standing. */
  const clearAlerts = useCallback(() => {
    coachRunRef.current++;
    setCoachAlert(null);
    setCoachChecking(false);
    setBookAlert(null);
    setBlunderAlert(null);
  }, []);

  // An alert never outlives the game (a resignation while it is up, say): its "Take it back" would
  // reopen a game that has already been recorded. A hint still being searched is dropped too.
  useEffect(() => {
    if (!gameOver) return;
    clearAlerts();
    hintRunRef.current++;
    setHinting(false);
  }, [gameOver, clearAlerts]);

  /** Takes the learner's last move back from a pause alert, with the board live again. */
  const alertTakeBack = useCallback(() => {
    clearAlerts();
    // Alerts close when the game ends; should a click still arrive, a finished game has been
    // recorded and is not reopened (that would record it twice).
    if (gameOverRef.current) return;
    setHintArrow(null);
    game.undo();
  }, [clearAlerts, game]);

  const coachTakeBack = useCallback(() => {
    if (!coachAlert) return;
    alertTakeBack();
  }, [coachAlert, alertTakeBack]);

  const coachPlayOn = useCallback(() => {
    clearAlerts();
  }, [clearAlerts]);

  const bookTakeBack = useCallback(() => {
    if (!bookAlert) return;
    alertTakeBack();
  }, [bookAlert, alertTakeBack]);

  const bookPlayOn = useCallback(() => {
    clearAlerts();
  }, [clearAlerts]);

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      // A picker left open past a resignation or flag must not play into the finished game.
      if (!canPlayerMove) {
        game.resolvePromotion(null);
        return;
      }
      const pending = game.pendingPromotion;
      if (piece && pending && holdBack({ from: pending.from, to: pending.to, promotion: piece })) {
        // Held back: the pawn goes back while the learner decides.
        game.resolvePromotion(null);
        return;
      }
      const fenBefore = position.fen;
      const move = game.resolvePromotion(piece);
      if (move && !hotSeat) coachCheck(fenBefore, move.san, toUci(move));
    },
    [canPlayerMove, game, position.fen, hotSeat, coachCheck, holdBack],
  );

  const takeBack = useCallback(() => {
    // Once the game is over it has been recorded: taking a move back would record it twice.
    if (!started || gameOver || position.history.length === 0) return;
    engine().stop();
    searchIdRef.current++;
    coachRunRef.current++;
    setCoachAlert(null);
    setCoachChecking(false);
    setBookAlert(null);
    setBlunderAlert(null);
    setThinking(false);
    setHintArrow(null);
    setHumanMoveError(null);
    // Undo back to the player's previous turn (one ply between two people).
    if (!hotSeat && position.turn === playerColor) {
      game.undo();
      if (gameRef.current.position.history.length > 0) game.undo();
    } else {
      game.undo();
    }
  }, [
    started,
    gameOver,
    position.history.length,
    position.turn,
    playerColor,
    engine,
    game,
    hotSeat,
  ]);

  const resign = useCallback(() => {
    if (!started || gameOver) return;
    engine().stop();
    searchIdRef.current++;
    setThinking(false);
    if (game.pendingPromotion) game.resolvePromotion(null);
    clockRef.current = pauseClock(clockRef.current, Date.now());
    syncClockView();
    // Between two people the side to move resigns.
    const resigning: LongColor = hotSeat ? position.turn : playerColor;
    const verdict: GameOver['verdict'] = resigning === playerColor ? 'loss' : 'win';
    playSound(gameEndSound(verdict, hotSeat));
    setGameOver({
      result: resigning === 'white' ? '0-1' : '1-0',
      reason: 'resignation',
      verdict,
    });
  }, [started, gameOver, engine, playerColor, syncClockView, hotSeat, position.turn, game]);

  /** Full-strength answer for hints and threats; null when the search was stopped. */
  const askEngine = useCallback(
    async (fen: string, moves: Uci[]): Promise<Uci | null> => {
      const engineClient = client();
      await ensureSkill(engineClient, skillCache.current, 20);
      const handle = engineClient.search({ fen, moves, depth: 14, multipv: 1 });
      const result = await handle.result;
      if (result.stopped) return null;
      return result.bestmove.move;
    },
    [client],
  );

  /** Only the latest hint or threat request may draw, and only on the position it was asked for. */
  const drawArrow = useCallback(
    (ask: Promise<Uci | null>, kind: HintMove['kind'], forFen: Fen, moveFen: Fen) => {
      const run = ++hintRunRef.current;
      setHinting(true);
      ask
        .then((best) => {
          if (run !== hintRunRef.current || !best) return;
          if (gameRef.current.position.fen !== forFen) return;
          const { from, to } = parseUci(best);
          setHintArrow({
            kind,
            san: sanOf(moveFen, best) ?? `${from}–${to}`,
            shape: { orig: from, dest: to, brush: kind === 'hint' ? 'paleBlue' : 'red' },
          });
        })
        .catch(() => undefined)
        .finally(() => {
          if (run === hintRunRef.current) setHinting(false);
        });
    },
    [],
  );

  const hint = useCallback(() => {
    if (!canPlayerMove || engineStatus !== 'ready') return;
    // In opening practice the hint is the repertoire's move, not the engine's: following it stays in book.
    if (bookNow?.status === 'in-book' && bookNow.node) {
      const san = bookNow.node.children[0]?.san;
      const move = san ? tryMove(new Chess(position.fen), san) : null;
      if (move) {
        // A search still running for an earlier request must not replace this arrow.
        hintRunRef.current++;
        setHinting(false);
        setHintArrow({
          kind: 'hint',
          san: move.san,
          shape: { orig: move.from, dest: move.to, brush: 'paleBlue' },
        });
        return;
      }
    }
    const movesUci = position.history.map((m) => toUci(m));
    drawArrow(askEngine(position.startFen, movesUci), 'hint', position.fen, position.fen);
  }, [canPlayerMove, engineStatus, position, askEngine, bookNow, drawArrow]);

  const showThreat = useCallback(() => {
    if (!canPlayerMove || engineStatus !== 'ready' || position.inCheck) return;
    // Ask what the opponent would play if it were their move: flip the side to move.
    const parts = position.fen.split(' ');
    parts[1] = rivalColor === 'white' ? 'w' : 'b';
    parts[3] = '-';
    const flipped = parts.join(' ');
    drawArrow(askEngine(flipped, []), 'threat', position.fen, flipped);
  }, [
    canPlayerMove,
    engineStatus,
    position.inCheck,
    position.fen,
    rivalColor,
    askEngine,
    drawArrow,
  ]);

  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), []);

  const pgn = useCallback(
    () =>
      game.pgn(
        pgnHeaders(
          playerColor,
          level,
          timeControl,
          gameOver?.result ?? '*',
          opponent,
          event,
          humanRating,
        ),
      ),
    [game, playerColor, level, timeControl, gameOver, opponent, event, humanRating],
  );

  return {
    game,
    opponent,
    playerColor,
    level,
    humanRating,
    humanStatus,
    humanError,
    humanMoveError,
    retryHuman,
    timeControl,
    startFen: position.startFen,
    clock: clockView,
    engineStatus,
    engineError,
    thinking,
    started,
    gameOver,
    hintShapes,
    hintMove,
    hinting,
    suggestedLevel,
    suggestedRating,
    coach,
    coachAlert,
    coachChecking,
    coachInterventions,
    coachTakeBack,
    coachPlayOn,
    blunderCheck,
    blunderAlert,
    blunderStops,
    blunderLookAgain,
    blunderShowMe,
    blunderPlayAnyway,
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

/** SAN of a UCI move in `fen`, or null when the position or the move cannot be read. */
function sanOf(fen: Fen, uci: Uci): string | null {
  try {
    return uciToSan(fen, uci);
  } catch {
    return null;
  }
}

function pgnHeaders(
  playerColor: LongColor,
  level: EngineLevel,
  timeControl: TimeControl,
  result: string,
  opponent: Opponent = 'engine',
  event?: string,
  humanRating?: number,
): Record<string, string> {
  const engineName =
    opponent === 'humanlike'
      ? `Maia ${humanRating ?? ''} (human-like)`
      : `Stockfish (level ${level.id} · ${level.name})`;
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hotSeat = opponent === 'human';
  const headers: Record<string, string> = {
    Event: event
      ? `Chess Trainer — ${event}`
      : hotSeat
        ? 'Chess Trainer — two players'
        : opponent === 'humanlike'
          ? 'Chess Trainer — play a human-like opponent'
          : 'Chess Trainer — play vs engine',
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

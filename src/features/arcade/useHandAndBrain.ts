import type { Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { opposite, START_FEN, toUci, uciToSan } from '@/chess/helpers';
import type { LongColor, PromotionPiece, Uci } from '@/chess/types';
import { useChess } from '@/chess/useChess';
import { getLevel } from '@/engine/levels';
import { useEngine } from '@/engine/useEngine';
import { chooseLevelMove, ensureSkill, type SkillCache } from '@/features/play/engineMove';
import type { GameOver } from '@/features/play/usePlayVsEngine';
import { gameEndSound, playSound } from '@/lib/sound';
import { useSettings } from '@/store/settings';
import { arcadeHeaders } from './arcadeGame';
import {
  type CallRecord,
  destsForType,
  gradeLoss,
  movableTypes,
  movesForType,
  PARTNER_DEPTH,
  type PieceType,
  type Role,
  scoreToCp,
} from './handAndBrain';

export interface HandAndBrainSetup {
  role: Role;
  color: LongColor | 'random';
  levelId: number;
}

/**
 * What the engine is doing right now, for the status line: the partner
 * studying the position (`partner`), the partner finding the best move with
 * the piece the Brain called (`partner-move`), the opponent's move, or the
 * grading of the Hand's move.
 */
export type Busy = 'partner' | 'partner-move' | 'opponent' | 'grading' | null;

export interface HandCall {
  type: PieceType;
  /** The partner's actual best move, kept hidden until the Hand has moved. */
  best: Uci;
  bestCp: number;
}

const MIN_THINK_MS = 350;

/**
 * One game of Hand & Brain against a levelled engine, with full-strength
 * Stockfish as the partner. The Brain calls a piece type and the partner plays
 * the best move with it; the Hand is told the piece type of the partner's best
 * move and has to find the move. Every call is graded against the real best.
 */
export function useHandAndBrain() {
  const autoQueen = useSettings((s) => s.autoQueen);
  const game = useChess(START_FEN, { autoQueen });
  const { engine, status: engineStatus, error: engineError, start: startEngine } = useEngine();
  const skillCache = useRef<SkillCache>({ skill: null });

  const [role, setRole] = useState<Role>('brain');
  const [playerColor, setPlayerColor] = useState<LongColor>('white');
  const [levelId, setLevelId] = useState(3);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [handCall, setHandCall] = useState<HandCall | null>(null);
  /** Brain mode: the engine's best move for the position the Brain is looking at. */
  const [brainBest, setBrainBest] = useState<{ fen: string; move: Uci; cp: number } | null>(null);

  const runRef = useRef(0);
  const aliveRef = useRef(true);
  const gameRef = useRef(game);
  gameRef.current = game;
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const { position } = game;
  const level = useMemo(() => getLevel(levelId), [levelId]);
  const engineColor = opposite(playerColor);

  /** The best move and its score for the side to move in `fen`, from that side's view. */
  const analyse = useCallback(
    async (fen: string, moves: Uci[] = [], searchmoves?: Uci[]) => {
      const client = engine();
      await ensureSkill(client, skillCache.current, 20);
      const result = await client.search({
        fen,
        moves,
        depth: PARTNER_DEPTH,
        multipv: 1,
        searchmoves,
      }).result;
      if (result.stopped || !result.bestmove.move) return null;
      return { move: result.bestmove.move, cp: scoreToCp(result.lines.get(1)?.score) };
    },
    [engine],
  );

  // Game end on the board.
  useEffect(() => {
    if (!started || gameOver || !position.status.over) return;
    const { result, reason, winner } = position.status;
    const verdict = winner ? (winner === playerColor ? 'win' : 'loss') : 'draw';
    playSound(gameEndSound(verdict));
    setGameOver({
      result: result === '*' ? '1/2-1/2' : result,
      reason: reason ?? 'game over',
      verdict,
    });
  }, [position.status, started, gameOver, playerColor]);

  // The opponent moves at its level whenever it is its turn and nothing is being graded.
  useEffect(() => {
    if (!started || gameOver || busy || engineStatus !== 'ready') return;
    if (position.turn !== engineColor || game.pendingPromotion) return;
    const run = ++runRef.current;
    const live = () => aliveRef.current && run === runRef.current;
    setBusy('opponent');
    const startedAt = Date.now();
    void chooseLevelMove(engine(), skillCache.current, {
      level,
      fen: position.startFen,
      moves: position.history.map((m) => toUci(m)),
      legal: position.dests,
      pieceAt: (square) => gameRef.current.chess().get(square),
    })
      .then(async (uci) => {
        if (!live() || !uci) return;
        const wait = Math.max(0, MIN_THINK_MS - (Date.now() - startedAt));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (!live()) return;
        gameRef.current.playNotation(uci);
      })
      .catch((err: unknown) => console.error('Opponent move failed', err))
      .finally(() => {
        if (live()) setBusy(null);
      });
    // The opponent reacts to a new position (or the end of grading), not to every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameOver, busy, engineStatus, position.fen, engineColor, level, engine]);

  // On the player's turn the partner works out its best move: the Brain's
  // yardstick, or the piece the Hand is told to move.
  useEffect(() => {
    if (!started || gameOver || engineStatus !== 'ready') return;
    if (position.turn !== playerColor || busy) return;
    if (role === 'brain' && brainBest?.fen === position.fen) return;
    if (role === 'hand' && handCall) return;
    const run = ++runRef.current;
    const live = () => aliveRef.current && run === runRef.current;
    setBusy('partner');
    void analyse(
      position.startFen,
      position.history.map((m) => toUci(m)),
    )
      .then((best) => {
        if (!live() || !best) return;
        if (role === 'brain') {
          setBrainBest({ fen: position.fen, move: best.move, cp: best.cp });
        } else {
          const piece = gameRef.current.chess().get(best.move.slice(0, 2) as Square);
          setHandCall({ type: piece?.type ?? 'p', best: best.move, bestCp: best.cp });
        }
      })
      .catch((err: unknown) => console.error('Partner analysis failed', err))
      .finally(() => {
        if (live()) setBusy(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameOver, engineStatus, position.fen, playerColor, role, busy]);

  const record = useCallback((call: CallRecord) => {
    setCalls((list) => [...list, call]);
  }, []);

  /** Brain: name the piece; the partner plays its best move with that piece. */
  const callPiece = useCallback(
    (type: PieceType) => {
      if (role !== 'brain' || busy || gameOver || brainBest?.fen !== position.fen) {
        return;
      }
      const chess = gameRef.current.chess();
      const legal = movesForType(chess, type);
      if (legal.length === 0) return;
      const run = ++runRef.current;
      const ply = position.history.length + 1;
      const bestPiece = chess.get(brainBest.move.slice(0, 2) as Square)?.type ?? 'p';
      const bestSan = uciToSan(position.fen, brainBest.move) ?? brainBest.move;
      const play = (uci: Uci, lossCp: number) => {
        const san = uciToSan(position.fen, uci) ?? uci;
        record({ ply, type, san, bestSan, bestType: bestPiece, lossCp, grade: gradeLoss(lossCp) });
        gameRef.current.playNotation(uci);
      };
      if (legal.includes(brainBest.move)) {
        play(brainBest.move, 0);
        return;
      }
      setBusy('partner-move');
      void analyse(
        position.startFen,
        position.history.map((m) => toUci(m)),
        legal,
      )
        .then((choice) => {
          if (run !== runRef.current || !choice) return;
          play(choice.move, Math.max(0, brainBest.cp - choice.cp));
        })
        .catch((err: unknown) => console.error('Partner move failed', err))
        .finally(() => {
          if (run === runRef.current) setBusy(null);
        });
    },
    [role, busy, gameOver, brainBest, position, analyse, record],
  );

  /** Hand: after the player's move, grade it against the partner's best. */
  const gradeHandMove = useCallback(
    (uci: Uci, san: string) => {
      const call = handCall;
      if (!call) return;
      const ply = position.history.length + 1;
      const bestSan = uciToSan(position.fen, call.best) ?? call.best;
      const finish = (lossCp: number) => {
        record({
          ply,
          type: call.type,
          san,
          bestSan,
          bestType: call.type,
          lossCp,
          grade: gradeLoss(lossCp),
        });
        setHandCall(null);
      };
      if (uci === call.best) {
        finish(0);
        return;
      }
      const run = ++runRef.current;
      setBusy('grading');
      // The live game already holds the move; evaluate from the opponent's side and flip.
      const moves = gameRef.current
        .chess()
        .history({ verbose: true })
        .map((m) => toUci(m));
      void analyse(position.startFen, moves)
        .then((after) => {
          if (run !== runRef.current) return;
          const mine = after ? -after.cp : call.bestCp;
          finish(Math.max(0, call.bestCp - mine));
        })
        .catch((err: unknown) => console.error('Grading failed', err))
        .finally(() => {
          if (run === runRef.current) setBusy(null);
        });
    },
    [handCall, position, analyse, record],
  );

  const playerMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (role !== 'hand' || !handCall || busy || gameOver) return;
      if (gameRef.current.chess().get(from)?.type !== handCall.type) return;
      const move = game.playMove(from, to, promotion);
      if (move && move !== 'promotion') gradeHandMove(toUci(move), move.san);
    },
    [role, handCall, busy, gameOver, game, gradeHandMove],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const move = game.resolvePromotion(piece);
      if (move) gradeHandMove(toUci(move), move.san);
    },
    [game, gradeHandMove],
  );

  const start = useCallback(
    (setup: HandAndBrainSetup) => {
      engine().stop();
      runRef.current++;
      const color =
        setup.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : setup.color;
      setRole(setup.role);
      setPlayerColor(color);
      setLevelId(setup.levelId);
      setGameOver(null);
      setBusy(null);
      setCalls([]);
      setHandCall(null);
      setBrainBest(null);
      game.reset(START_FEN);
      void engine()
        .newGame()
        .catch(() => undefined);
      setStarted(true);
    },
    [engine, game],
  );

  const resign = useCallback(() => {
    if (!started || gameOver) return;
    engine().stop();
    runRef.current++;
    setBusy(null);
    playSound('gameLost');
    setGameOver({
      result: playerColor === 'white' ? '0-1' : '1-0',
      reason: 'resignation',
      verdict: 'loss',
    });
  }, [started, gameOver, engine, playerColor]);

  /** The game so far as PGN. */
  const pgn = useCallback(
    () =>
      gameRef.current.pgn(
        arcadeHeaders({
          event: `Hand & Brain · ${role === 'brain' ? 'Brain' : 'Hand'}`,
          playerColor,
          engine: `Stockfish (level ${level.id} · ${level.name})`,
          result: gameOver?.result ?? '*',
        }),
      ),
    [role, playerColor, level, gameOver],
  );

  const chess = game.chess();
  const options = useMemo(
    () =>
      role === 'brain' && started && !gameOver && position.turn === playerColor
        ? movableTypes(chess, position.dests)
        : [],
    [role, started, gameOver, position.turn, position.dests, playerColor, chess],
  );
  const dests = useMemo(
    () =>
      role === 'hand' && handCall && !busy && !gameOver && position.turn === playerColor
        ? destsForType(chess, position.dests, handCall.type)
        : new Map<Square, Square[]>(),
    [role, handCall, busy, gameOver, position.turn, position.dests, playerColor, chess],
  );

  return {
    game,
    role,
    playerColor,
    level,
    started,
    gameOver,
    busy,
    calls,
    handCall,
    brainReady: role === 'brain' && brainBest?.fen === position.fen && !busy,
    options,
    dests,
    engineStatus,
    engineError,
    retryEngine: startEngine,
    start,
    callPiece,
    playerMove,
    resolvePromotion,
    resign,
    pgn,
  };
}

export type UseHandAndBrain = ReturnType<typeof useHandAndBrain>;

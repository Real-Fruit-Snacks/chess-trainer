import type { Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { opposite, toUci } from '@/chess/helpers';
import type { LongColor, PromotionPiece, Uci } from '@/chess/types';
import { useChess } from '@/chess/useChess';
import { getLevel } from '@/engine/levels';
import { useEngine } from '@/engine/useEngine';
import { chooseLevelMove, ensureSkill, type SkillCache } from '@/features/play/engineMove';
import { playSound } from '@/lib/sound';
import { useSettings } from '@/store/settings';
import {
  FALLEN_CP,
  GRADE_DEPTH,
  HOLD_MOVES,
  LIVES,
  pickFortressPosition,
  tierForHeld,
} from './fortress';
import { scoreToCp } from './handAndBrain';
import { type EvalPosition, fortressPositions, moverCp, sideToMove } from './positions';

export type FortressPhase = 'idle' | 'playing' | 'held' | 'fallen' | 'over';

/** Why the last position ended. */
export type FortressOutcome = 'survived' | 'drawn' | 'won' | 'collapsed' | 'mated' | 'resigned';

const MIN_THINK_MS = 350;

/** A run of Fortress positions against a levelled engine, graded at full strength. */
export function useFortress() {
  const autoQueen = useSettings((s) => s.autoQueen);
  const game = useChess(undefined, { autoQueen });
  const { engine, status: engineStatus, error: engineError, start: startEngine } = useEngine();
  const skillCache = useRef<SkillCache>({ skill: null });
  const pool = useMemo(() => fortressPositions(), []);

  const [levelId, setLevelId] = useState(4);
  const [phase, setPhase] = useState<FortressPhase>('idle');
  const [current, setCurrent] = useState<EvalPosition | null>(null);
  const [playerColor, setPlayerColor] = useState<LongColor>('white');
  const [lives, setLives] = useState(LIVES);
  const [held, setHeld] = useState(0);
  const [cp, setCp] = useState(0);
  const [movesMade, setMovesMade] = useState(0);
  const [busy, setBusy] = useState<'opponent' | 'grading' | null>(null);
  const [outcome, setOutcome] = useState<FortressOutcome | null>(null);
  const usedRef = useRef(new Set<string>());
  const livesRef = useRef(LIVES);
  const heldRef = useRef(0);
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

  const endPosition = useCallback(
    (result: FortressOutcome) => {
      engine().stop();
      runRef.current++;
      setBusy(null);
      setOutcome(result);
      const kept = result === 'survived' || result === 'drawn' || result === 'won';
      if (kept) {
        playSound('solved');
        heldRef.current += 1;
        setHeld(heldRef.current);
        setPhase('held');
      } else {
        playSound('failed');
        livesRef.current -= 1;
        setLives(livesRef.current);
        setPhase(livesRef.current <= 0 ? 'over' : 'fallen');
      }
    },
    [engine],
  );

  // The board decides some endings on its own.
  useEffect(() => {
    if (phase !== 'playing' || !position.status.over) return;
    const { winner } = position.status;
    endPosition(winner === playerColor ? 'won' : winner ? 'mated' : 'drawn');
  }, [phase, position.status, playerColor, endPosition]);

  // The opponent moves at its level; afterwards the position is graded at full strength.
  useEffect(() => {
    if (phase !== 'playing' || busy || engineStatus !== 'ready') return;
    if (position.turn !== engineColor || game.pendingPromotion) return;
    const run = ++runRef.current;
    const live = () => aliveRef.current && run === runRef.current;
    setBusy('opponent');
    const startedAt = Date.now();
    const client = engine();
    void chooseLevelMove(client, skillCache.current, {
      level,
      fen: position.startFen,
      moves: position.history.map((m) => toUci(m)),
      legal: position.dests,
      pieceAt: (square) => gameRef.current.chess().get(square),
    })
      .then(async (uci) => {
        if (!live() || !uci) return null;
        const wait = Math.max(0, MIN_THINK_MS - (Date.now() - startedAt));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (!live()) return null;
        gameRef.current.playNotation(uci);
        const chess = gameRef.current.chess();
        if (chess.isGameOver()) return null;
        setBusy('grading');
        await ensureSkill(client, skillCache.current, 20);
        const moves: Uci[] = chess.history({ verbose: true }).map((m) => toUci(m));
        const result = await client.search({
          fen: position.startFen,
          moves,
          depth: GRADE_DEPTH,
          multipv: 1,
        }).result;
        if (!live() || result.stopped) return null;
        return scoreToCp(result.lines.get(1)?.score);
      })
      .then((graded) => {
        if (graded === null || !live()) return;
        setCp(graded);
        if (graded <= FALLEN_CP) endPosition('collapsed');
      })
      .catch((err: unknown) => console.error('Fortress engine move failed', err))
      .finally(() => {
        if (live()) setBusy(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to a new position
  }, [phase, busy, engineStatus, position.fen, engineColor, level, engine]);

  const loadPosition = useCallback(
    (nextHeld: number) => {
      const next = pickFortressPosition(pool, tierForHeld(nextHeld), usedRef.current);
      if (!next) {
        setPhase('over');
        return;
      }
      usedRef.current.add(next.id);
      engine().stop();
      runRef.current++;
      setCurrent(next);
      setPlayerColor(sideToMove(next));
      setCp(moverCp(next));
      setMovesMade(0);
      setOutcome(null);
      setBusy(null);
      game.reset(next.fen);
      void engine()
        .newGame()
        .catch(() => undefined);
      setPhase('playing');
    },
    [pool, engine, game],
  );

  const startRun = useCallback(
    (nextLevelId: number) => {
      setLevelId(nextLevelId);
      livesRef.current = LIVES;
      heldRef.current = 0;
      setLives(LIVES);
      setHeld(0);
      usedRef.current = new Set();
      loadPosition(0);
    },
    [loadPosition],
  );

  const nextPosition = useCallback(() => {
    if (phase === 'over' || phase === 'idle' || phase === 'playing') return;
    loadPosition(held);
  }, [phase, held, loadPosition]);

  const afterPlayerMove = useCallback(() => {
    const made = movesMade + 1;
    setMovesMade(made);
    if (made >= HOLD_MOVES && !gameRef.current.chess().isGameOver()) endPosition('survived');
  }, [movesMade, endPosition]);

  const playerMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'playing' || busy || position.turn !== playerColor) return;
      const move = game.playMove(from, to, promotion);
      if (move && move !== 'promotion') afterPlayerMove();
    },
    [phase, busy, position.turn, playerColor, game, afterPlayerMove],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const move = game.resolvePromotion(piece);
      if (move) afterPlayerMove();
    },
    [game, afterPlayerMove],
  );

  const giveUp = useCallback(() => {
    if (phase !== 'playing') return;
    endPosition('resigned');
  }, [phase, endPosition]);

  return {
    game,
    pool,
    phase,
    current,
    playerColor,
    level,
    lives,
    held,
    cp,
    movesMade,
    busy,
    outcome,
    engineStatus,
    engineError,
    retryEngine: startEngine,
    startRun,
    nextPosition,
    playerMove,
    resolvePromotion,
    giveUp,
  };
}

export type UseFortress = ReturnType<typeof useFortress>;

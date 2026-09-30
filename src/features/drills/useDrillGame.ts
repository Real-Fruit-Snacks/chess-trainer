import type { Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { parseUci, toUci } from '@/chess/helpers';
import type { Fen, LongColor, PromotionPiece, Uci } from '@/chess/types';
import { useChess } from '@/chess/useChess';
import type { Score } from '@/engine/uci';
import { useEngine } from '@/engine/useEngine';
import { pickRandom } from '@/lib/random';
import { playSound } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import type { EndgameDrill } from './endgameDrills';
import { countMaterial, generateMatePosition } from './positions';

export type DrillPhase = 'idle' | 'playing' | 'won' | 'lost';

export interface DrillResultInfo {
  outcome: 'won' | 'lost';
  reason: string;
  /** Moves the user played. */
  moves: number;
  /** Score recorded for this attempt (higher is better). */
  score: number;
}

export interface UseDrillGame {
  game: ReturnType<typeof useChess>;
  drill: EndgameDrill | null;
  phase: DrillPhase;
  result: DrillResultInfo | null;
  startFen: Fen | null;
  userMoves: number;
  thinking: boolean;
  engineStatus: ReturnType<typeof useEngine>['status'];
  engineError: Error | null;
  hintShapes: DrawShape[];
  hinting: boolean;
  start: (drill: EndgameDrill, fen?: Fen) => void;
  restart: () => void;
  playerMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  hint: () => void;
  giveUp: () => void;
  retryEngine: () => Promise<void>;
}

const ENGINE_DEPTH = 16;
const MIN_THINK_MS = 300;

/** Score used for the "best" table: fewer moves is better, capped at 1. */
export function drillScore(drill: EndgameDrill, userMoves: number, won: boolean): number {
  if (!won) return 0;
  if (drill.goal === 'hold') return 100;
  return Math.max(1, 100 - userMoves);
}

function pickStartFen(drill: EndgameDrill): Fen {
  if (drill.positions === 'random') return generateMatePosition(drill.material ?? 'Q');
  return pickRandom(drill.positions) ?? (drill.positions[0] as Fen);
}

/** Engine score from the *user's* point of view, in centipawns (mates map to ±10000). */
function userCp(score: Score, engineToMove: boolean): number {
  const cp = score.type === 'mate' ? (score.value > 0 ? 10_000 : -10_000) : score.value;
  return engineToMove ? -cp : cp;
}

/**
 * Plays one endgame drill against the engine at full strength and adjudicates
 * the result: checkmate / promotion / holding the draw versus stalemate,
 * losing material, running past the move limit, or letting the win (or the
 * draw) slip according to the engine's evaluation.
 */
export function useDrillGame(): UseDrillGame {
  const autoQueen = useSettings((s) => s.autoQueen);
  const recordDrill = useProgress((s) => s.recordDrill);
  const game = useChess(undefined, { autoQueen });
  const { engine, status: engineStatus, error: engineError, start: startEngine } = useEngine();

  const [drill, setDrill] = useState<EndgameDrill | null>(null);
  const [phase, setPhase] = useState<DrillPhase>('idle');
  const [result, setResult] = useState<DrillResultInfo | null>(null);
  const [startFen, setStartFen] = useState<Fen | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hintShapes, setHintShapes] = useState<DrawShape[]>([]);
  const [hinting, setHinting] = useState(false);

  const searchIdRef = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;
  const drillRef = useRef(drill);
  drillRef.current = drill;
  const skillAppliedRef = useRef(false);
  const startMaterialRef = useRef({ white: 0, black: 0, whitePawns: 0 });

  const { position } = game;
  const userColor: LongColor = drill?.color ?? 'white';
  const engineColor: LongColor = userColor === 'white' ? 'black' : 'white';
  const userMoves = useMemo(() => {
    if (!startFen) return 0;
    const startsWithUser = (startFen.split(' ')[1] === 'w' ? 'white' : 'black') === userColor;
    const plies = position.history.length;
    return startsWithUser ? Math.ceil(plies / 2) : Math.floor(plies / 2);
  }, [startFen, position.history.length, userColor]);

  const finish = useCallback(
    (outcome: 'won' | 'lost', reason: string) => {
      const current = drillRef.current;
      if (!current) return;
      engine().stop();
      searchIdRef.current++;
      setThinking(false);
      setHintShapes([]);
      const moves = userMoves;
      const score = drillScore(current, moves, outcome === 'won');
      setResult({ outcome, reason, moves, score });
      setPhase(outcome);
      playSound(outcome === 'won' ? 'solved' : 'failed');
      recordDrill(
        current.id,
        score,
        outcome === 'won'
          ? current.goal === 'hold'
            ? 'Held the draw'
            : `Done in ${moves} move${moves === 1 ? '' : 's'}`
          : undefined,
      );
    },
    [engine, recordDrill, userMoves],
  );

  /** Adjudicates the board after any move; returns true when the drill ended. */
  const adjudicate = useCallback(
    (lastMover: LongColor): boolean => {
      const current = drillRef.current;
      if (!current) return false;
      const chess = gameRef.current.chess();
      const status = gameRef.current.position.status;
      if (status.over) {
        if (status.reason === 'checkmate') {
          if (lastMover === current.color) finish('won', 'Checkmate!');
          else finish('lost', 'You were checkmated.');
        } else if (current.goal === 'hold') {
          finish('won', `Draw by ${status.reason ?? 'rule'} — you held it.`);
        } else {
          finish(
            'lost',
            status.reason === 'stalemate'
              ? 'Stalemate! The win is gone.'
              : `Draw by ${status.reason ?? 'rule'}.`,
          );
        }
        return true;
      }
      const material = countMaterial(chess.fen());
      if (current.goal === 'promote') {
        const lastMove = chess.history({ verbose: true }).at(-1);
        if (lastMover === current.color && lastMove?.promotion) {
          finish('won', `Promoted to a ${lastMove.promotion === 'q' ? 'queen' : 'new piece'}!`);
          return true;
        }
        if (material.whitePawns < startMaterialRef.current.whitePawns) {
          finish('lost', 'The pawn was captured.');
          return true;
        }
      }
      if (current.goal === 'mate' && material.white < startMaterialRef.current.white) {
        finish('lost', 'You lost a piece — no more mating material.');
        return true;
      }
      if (current.goal === 'capture') {
        if (material.black < startMaterialRef.current.black) {
          finish('won', 'Won the last piece — the rest is elementary.');
          return true;
        }
        if (material.white < startMaterialRef.current.white) {
          finish('lost', 'Your piece was lost.');
          return true;
        }
      }
      if (current.goal === 'hold' && material.white < startMaterialRef.current.white) {
        finish('won', 'The pawn is gone — the draw is safe.');
        return true;
      }
      return false;
    },
    [finish],
  );

  // Adjudicate after every move and count the move limit.
  const lastPliesRef = useRef(0);
  useEffect(() => {
    if (phase !== 'playing' || !drill) return;
    const plies = position.history.length;
    if (plies === lastPliesRef.current) return;
    lastPliesRef.current = plies;
    const lastMover: LongColor = position.turn === 'white' ? 'black' : 'white';
    if (adjudicate(lastMover)) return;
    if (lastMover === drill.color && userMoves >= drill.moveLimit) {
      if (drill.goal === 'hold') finish('won', `You held the draw for ${drill.moveLimit} moves.`);
      else finish('lost', `Move limit reached (${drill.moveLimit}). Look for a faster plan.`);
    }
  }, [phase, drill, position.history.length, position.turn, adjudicate, userMoves, finish]);

  // Engine reply, with evaluation-based adjudication of the user's last move.
  useEffect(() => {
    if (phase !== 'playing' || !drill || position.turn !== engineColor || game.pendingPromotion) {
      return;
    }
    if (engineStatus !== 'ready') return;
    const id = ++searchIdRef.current;
    let cancelled = false;
    setThinking(true);
    const startedAt = Date.now();
    const client = engine();
    const movesUci: Uci[] = position.history.map((m) => toUci(m));

    void (async () => {
      if (!skillAppliedRef.current) {
        await client.setOption('Skill Level', 20);
        skillAppliedRef.current = true;
      }
      const handle = client.search({
        fen: position.startFen,
        moves: movesUci,
        depth: ENGINE_DEPTH,
        multipv: 1,
      });
      const res = await handle.result;
      if (cancelled || id !== searchIdRef.current || res.stopped) return;
      const score = res.lines.get(1)?.score;
      if (score) {
        const cp = userCp(score, true);
        // Known fortresses (e.g. the wrong-bishop ending) keep a material bias in the evaluation,
        // so only a clearly lost score ends a holding drill.
        if (drill.goal === 'hold' && cp < -400) {
          finish('lost', 'That let the win through — the engine now sees a winning line.');
          return;
        }
        if (
          drill.goal !== 'hold' &&
          score.type === 'cp' &&
          Math.abs(score.value) < 15 &&
          position.history.length > 0
        ) {
          finish('lost', 'The engine now holds a draw — the win slipped away.');
          return;
        }
      }
      const best = res.bestmove.move;
      if (!best) return;
      const wait = Math.max(0, MIN_THINK_MS - (Date.now() - startedAt));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (cancelled || id !== searchIdRef.current) return;
      gameRef.current.playNotation(best);
    })()
      .catch((err: unknown) => console.error('Drill engine move failed', err))
      .finally(() => {
        if (id === searchIdRef.current) setThinking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    phase,
    drill,
    position.turn,
    position.history,
    position.startFen,
    engineColor,
    engineStatus,
    engine,
    finish,
    game.pendingPromotion,
  ]);

  const start = useCallback(
    (next: EndgameDrill, fen?: Fen) => {
      engine().stop();
      searchIdRef.current++;
      const chosen = fen ?? pickStartFen(next);
      setDrill(next);
      drillRef.current = next;
      setStartFen(chosen);
      setResult(null);
      setHintShapes([]);
      setThinking(false);
      lastPliesRef.current = 0;
      startMaterialRef.current = countMaterial(chosen);
      game.reset(chosen);
      void engine()
        .newGame()
        .catch(() => undefined);
      setPhase('playing');
    },
    [engine, game],
  );

  const restart = useCallback(() => {
    if (drill && startFen) start(drill, startFen);
  }, [drill, startFen, start]);

  const canMove = phase === 'playing' && position.turn === userColor && !thinking;

  const playerMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (!canMove) return;
      setHintShapes([]);
      game.playMove(from, to, promotion);
    },
    [canMove, game],
  );

  const hint = useCallback(() => {
    if (!canMove || engineStatus !== 'ready') return;
    setHinting(true);
    const client = engine();
    const movesUci: Uci[] = position.history.map((m) => toUci(m));
    void client
      .search({ fen: position.startFen, moves: movesUci, depth: 18, multipv: 1 })
      .result.then((res) => {
        if (res.stopped || !res.bestmove.move) return;
        const { from, to } = parseUci(res.bestmove.move);
        setHintShapes([{ orig: from, dest: to, brush: 'paleBlue' }]);
      })
      .finally(() => setHinting(false));
  }, [canMove, engineStatus, engine, position]);

  const giveUp = useCallback(() => {
    if (phase === 'playing') finish('lost', 'Given up — try again with the tip in mind.');
  }, [phase, finish]);

  return {
    game,
    drill,
    phase,
    result,
    startFen,
    userMoves,
    thinking,
    engineStatus,
    engineError,
    hintShapes,
    hinting,
    start,
    restart,
    playerMove,
    resolvePromotion: game.resolvePromotion,
    hint,
    giveUp,
    retryEngine: startEngine,
  };
}

import { Chess, type Square } from 'chess.js';
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
import {
  canStillMate,
  countMaterial,
  generateMatePosition,
  isAttackedNow,
  materialFor,
} from './positions';

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

/** The position a drill starts from: one of its fixed positions, or a generated one. */
export function pickStartFen(drill: EndgameDrill): Fen {
  if (drill.positions === 'random') return generateMatePosition(drill.material ?? 'Q');
  return pickRandom(drill.positions) ?? (drill.positions[0] as Fen);
}

/**
 * The fixed position a `?pos=N` link asks for (lessons and tests link to one),
 * or undefined — a random pick — when the parameter is absent or out of range.
 */
export function requestedPosition(drill: EndgameDrill, pos: string | null): Fen | undefined {
  if (pos === null || drill.positions === 'random') return undefined;
  const requested = Number(pos);
  if (!Number.isInteger(requested) || requested < 0) return undefined;
  return drill.positions[requested];
}

/** Engine score from the *user's* point of view, in centipawns (mates map to ±10000). */
function userCp(score: Score, engineToMove: boolean): number {
  const cp = score.type === 'mate' ? (score.value > 0 ? 10_000 : -10_000) : score.value;
  return engineToMove ? -cp : cp;
}

export type Adjudication = { outcome: 'won' | 'lost'; reason: string } | null;

/**
 * The user's last move while its verdict may wait for the reply: where the
 * piece landed, and whether it promoted or captured.
 */
export interface PendingMove {
  to: Square;
  promotion: PromotionPiece | null;
  capture: boolean;
}

export interface AdjudicationInput {
  goal: EndgameDrill['goal'];
  /** The side the user plays. */
  color: LongColor;
  /** Who made the move being judged. */
  lastMover: LongColor;
  /** Position after that move. */
  fen: Fen;
  /** The game-over state of that position, if any. */
  status: { over: boolean; reason?: string | null };
  /**
   * The user's last move if it promoted or captured — on the user's own move,
   * and on the opponent's reply to it. Null otherwise.
   */
  pending: PendingMove | null;
  /** Material at the start of the drill. */
  startFen: Fen;
}

const PIECE_NAMES: Record<PromotionPiece, string> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

/**
 * Judges the position after a move (pure, so the rules can be tested without a
 * board or an engine):
 *
 * - any game end is final (mate for the mover wins; a draw is a win only for a holder);
 * - a promotion wins once the new piece is safe — at once when nothing can take it,
 *   otherwise when the opponent's reply has left it standing (e8=Q?? Kxe8 is no win);
 * - losing the last pawn loses a promotion drill (a pawn that promotes is not lost);
 * - losing a piece loses a mating drill only when the rest cannot mate any more
 *   (two rooks down to one still mates);
 * - in a capture or a holding drill, winning material counts once it is kept: the
 *   balance of pieces and pawns against the start, so a promotion (a pawn becomes a
 *   queen) or a trade changes nothing, and a capture that is taken straight back
 *   is no win; a capture drill is lost with the user's piece.
 */
export function adjudicatePosition(input: AdjudicationInput): Adjudication {
  const { goal, color, lastMover, fen, status, pending, startFen } = input;
  if (status.over) {
    if (status.reason === 'checkmate') {
      return lastMover === color
        ? { outcome: 'won', reason: 'Checkmate!' }
        : { outcome: 'lost', reason: 'You were checkmated.' };
    }
    if (goal === 'hold') {
      return { outcome: 'won', reason: `Draw by ${status.reason ?? 'rule'} — you held it.` };
    }
    return {
      outcome: 'lost',
      reason:
        status.reason === 'stalemate'
          ? 'Stalemate! The win is gone.'
          : `Draw by ${status.reason ?? 'rule'}.`,
    };
  }
  const userMoved = lastMover === color;
  const material = materialFor(countMaterial(fen), color);
  const start = materialFor(countMaterial(startFen), color);

  if (goal === 'promote') {
    if (pending?.promotion) {
      const piece = new Chess(fen).get(pending.to);
      const standing = piece?.color === (color === 'white' ? 'w' : 'b') && piece.type !== 'p';
      const name = PIECE_NAMES[pending.promotion];
      if (userMoved) {
        if (standing && !isAttackedNow(fen, pending.to)) {
          return { outcome: 'won', reason: `Promoted to a ${name} — and it is safe!` };
        }
        return null; // Attacked: the reply decides.
      }
      if (standing) {
        return { outcome: 'won', reason: `Promoted to a ${name} — and it survived!` };
      }
      if (material.ownPawns === 0) {
        return {
          outcome: 'lost',
          reason: `The new ${name} was taken at once — promote where it cannot be captured.`,
        };
      }
      return null; // Another pawn can still get through.
    }
    if (material.ownPawns === 0 && start.ownPawns > 0) {
      return {
        outcome: 'lost',
        reason: start.ownPawns > 1 ? 'The last pawn was captured.' : 'The pawn was captured.',
      };
    }
    return null;
  }

  if (goal === 'mate') {
    if (material.own < start.own && !canStillMate(fen, color)) {
      return { outcome: 'lost', reason: 'You lost a piece — no more mating material.' };
    }
    return null;
  }

  // Capture and hold: material won and kept. A capture stands at once when nothing can take
  // the capturing piece back; otherwise the reply decides.
  const gained = start.opp - start.own - (material.opp - material.own) > 0;
  const kept = userMoved
    ? gained && pending?.capture === true && !isAttackedNow(fen, pending.to)
    : gained;
  if (goal === 'capture') {
    if (kept) {
      return {
        outcome: 'won',
        reason:
          material.oppPawns < start.oppPawns
            ? 'Won the pawn — the rest is elementary.'
            : 'Won the last piece — the rest is elementary.',
      };
    }
    if (!userMoved && material.own < start.own) {
      return { outcome: 'lost', reason: 'Your piece was lost.' };
    }
    return null;
  }
  if (kept) {
    return {
      outcome: 'won',
      reason:
        start.oppPawns > 0 && material.oppPawns === 0
          ? `The pawn${start.oppPawns > 1 ? 's are' : ' is'} gone — the draw is safe.`
          : material.oppPawns < start.oppPawns
            ? 'You won a pawn — the draw is safe.'
            : 'You won material — the draw is safe.',
    };
  }
  return null;
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
  const startFenRef = useRef<Fen | null>(null);

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

  /** The user's last promotion or capture while its verdict waits for the reply. */
  const pendingRef = useRef<PendingMove | null>(null);

  /** Adjudicates the board after any move; returns true when the drill ended. */
  const adjudicate = useCallback(
    (lastMover: LongColor): boolean => {
      const current = drillRef.current;
      const startFen = startFenRef.current;
      if (!current || !startFen) return false;
      const chess = gameRef.current.chess();
      const lastMove = chess.history({ verbose: true }).at(-1);
      if (lastMover === current.color) {
        pendingRef.current =
          lastMove && (lastMove.promotion || lastMove.captured)
            ? {
                to: lastMove.to,
                promotion: (lastMove.promotion as PromotionPiece | undefined) ?? null,
                capture: lastMove.captured !== undefined,
              }
            : null;
      }
      const verdict = adjudicatePosition({
        goal: current.goal,
        color: current.color,
        lastMover,
        fen: chess.fen(),
        status: gameRef.current.position.status,
        pending: pendingRef.current,
        startFen,
      });
      if (lastMover !== current.color) pendingRef.current = null;
      if (!verdict) return false;
      finish(verdict.outcome, verdict.reason);
      return true;
    },
    [finish],
  );

  // Adjudicate after every move and count the move limit. A promotion or capture on the
  // last allowed move is judged with the reply first, and the limit applies after that.
  const lastPliesRef = useRef(0);
  useEffect(() => {
    if (phase !== 'playing' || !drill) return;
    const plies = position.history.length;
    if (plies === lastPliesRef.current) return;
    lastPliesRef.current = plies;
    const lastMover: LongColor = position.turn === 'white' ? 'black' : 'white';
    if (adjudicate(lastMover)) return;
    if (userMoves < drill.moveLimit) return;
    if (lastMover === drill.color && pendingRef.current) return;
    if (drill.goal === 'hold') finish('won', `You held the draw for ${drill.moveLimit} moves.`);
    else finish('lost', `Move limit reached (${drill.moveLimit}). Look for a faster plan.`);
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
      startFenRef.current = chosen;
      pendingRef.current = null;
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

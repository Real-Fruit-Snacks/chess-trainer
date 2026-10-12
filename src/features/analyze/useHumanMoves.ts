import { useCallback, useEffect, useState } from 'react';
import type { Fen, Uci } from '@/chess/types';
import type { EngineClient } from '@/engine/EngineClient';
import type { MaiaMove } from '@/engine/maia/encoding';
import { maiaClient } from '@/engine/maia/maiaClient';
import { checkMoves, type PositionCheck, topHumanMoves } from './humanMoves';

/** Keeps a small map from growing past `size` entries (the oldest go first). */
function remember<K, V>(map: Map<K, V>, key: K, value: V, size: number): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > size) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

/* ------------------------------------------------------------------ */
/* What players of the rating play                                    */
/* ------------------------------------------------------------------ */

/** Predictions by rating and position, for stepping back and forth through a game. */
const predictions = new Map<string, MaiaMove[]>();
const PREDICTIONS_KEPT = 200;
/** A short pause before asking the model, so stepping quickly through a game asks only once. */
const PREDICT_DELAY_MS = 120;

export type HumanPrediction =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; moves: MaiaMove[] }
  | { status: 'failed'; error: string };

/**
 * The moves players of `rating` choose in `fen` (the likeliest few, with
 * their shares), from the human-like model, while `active`. The model loads
 * on first use; `retry` tries again after a failure.
 */
export function useHumanPrediction(
  fen: Fen,
  rating: number,
  active: boolean,
): { prediction: HumanPrediction; retry: () => void } {
  const key = `${rating}|${fen}`;
  const [state, setState] = useState<{ key: string; prediction: HumanPrediction } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active || predictions.has(key)) return;
    let live = true;
    const timer = window.setTimeout(() => {
      maiaClient()
        .predict(fen, rating)
        .then((result) => {
          const moves = topHumanMoves(result.moves);
          remember(predictions, key, moves, PREDICTIONS_KEPT);
          if (live) setState({ key, prediction: { status: 'ready', moves } });
        })
        .catch((err: unknown) => {
          if (!live) return;
          const error = err instanceof Error ? err.message : String(err);
          setState({ key, prediction: { status: 'failed', error } });
        });
    }, PREDICT_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [key, fen, rating, active, attempt]);

  const retry = useCallback(() => {
    setState(null);
    setAttempt((n) => n + 1);
  }, []);
  const cached = predictions.get(key);
  const prediction: HumanPrediction = !active
    ? { status: 'idle' }
    : cached
      ? { status: 'ready', moves: cached }
      : state?.key === key
        ? state.prediction
        : { status: 'loading' };
  return { prediction, retry };
}

/* ------------------------------------------------------------------ */
/* What the engine makes of them                                      */
/* ------------------------------------------------------------------ */

/**
 * When the moves may be checked:
 * - `auto`: the engine is free (its analysis of the position is done): now;
 * - `manual`: the engine is switched off: when asked for;
 * - `wait`: the engine is busy (still analysing, or reviewing the game): once it is free;
 * - `off`: there is no engine (it could not start): never.
 */
export type CheckMode = 'auto' | 'manual' | 'wait' | 'off';

/** Checks by position, so a position seen before is not searched again. */
const checks = new Map<Fen, PositionCheck>();
const CHECKS_KEPT = 300;
const CHECK_DELAY_MS = 250;

export interface HumanChecks {
  /** What the engine found so far for the position. */
  check: PositionCheck | null;
  /** The moves still waiting for the engine. */
  waiting: Uci[];
  /** Whether a check was asked for here (`manual`). */
  requested: boolean;
  request: () => void;
}

/**
 * The engine's look at `moves` in `fen`, run on the page's engine without
 * getting in the way of its own analysis: only when `mode` says the engine is
 * free, stopped as soon as something else needs it, and kept for later.
 * `hint` is the analysis's best move, searched along with them.
 */
export function useHumanChecks({
  fen,
  moves,
  engine,
  mode,
  hint,
}: {
  fen: Fen;
  moves: readonly Uci[];
  engine: () => Pick<EngineClient, 'search'>;
  mode: CheckMode;
  hint: Uci | null;
}): HumanChecks {
  const [, setVersion] = useState(0);
  const [requestedFen, setRequestedFen] = useState<Fen | null>(null);
  const requested = requestedFen === fen;
  const go = mode === 'auto' || (mode === 'manual' && requested);
  const movesKey = moves.join(' ');

  useEffect(() => {
    if (!go || movesKey === '') return;
    const wanted = movesKey.split(' ');
    const known = checks.get(fen) ?? null;
    if (wanted.every((uci) => known?.lines.has(uci))) return;
    const controller = new AbortController();
    // A moment's grace: right after a move the analysis has yet to claim the engine for it.
    const timer = window.setTimeout(() => {
      checkMoves(engine(), fen, wanted, { known, hint, signal: controller.signal })
        .then((check) => {
          if (!check) return;
          remember(checks, fen, check, CHECKS_KEPT);
          if (!controller.signal.aborted) setVersion((v) => v + 1);
        })
        .catch(() => {
          // The engine failed: its own status (and the page's Retry) says so.
        });
    }, CHECK_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [go, fen, movesKey, hint, engine]);

  const request = useCallback(() => setRequestedFen(fen), [fen]);
  const check = checks.get(fen) ?? null;
  return {
    check,
    waiting: moves.filter((uci) => !check?.lines.has(uci)),
    requested,
    request,
  };
}

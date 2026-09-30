import { Chess, type Move, type Square } from 'chess.js';
import { useCallback, useMemo, useRef, useState } from 'react';
import { playMoveSound } from '@/lib/sound';
import {
  checkedKingSquare,
  gameStatus,
  type GameStatus,
  isPromotionMove,
  legalDests,
  START_FEN,
  toLongColor,
  tryMove,
  tryNotation,
} from './helpers';
import type { Fen, LongColor, MoveInput, PromotionPiece } from './types';

export interface PositionSnapshot {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  inCheck: boolean;
  checkedKing: Square | null;
  status: GameStatus;
  /** Verbose move history from the starting position. */
  history: Move[];
  startFen: Fen;
}

export interface PendingPromotion {
  from: Square;
  to: Square;
  color: LongColor;
}

export interface UseChess {
  position: PositionSnapshot;
  pendingPromotion: PendingPromotion | null;
  /**
   * Attempts a move from the board. Returns the Move if it was played, `null`
   * if illegal, or `'promotion'` when a promotion piece must be chosen first.
   */
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => Move | null | 'promotion';
  /** Completes (or cancels with `null`) a pending promotion. */
  resolvePromotion: (piece: PromotionPiece | null) => Move | null;
  /** Plays a move given in SAN or UCI form. */
  playNotation: (notation: string) => Move | null;
  undo: () => Move | null;
  reset: (fen?: Fen) => void;
  loadPgn: (pgn: string) => boolean;
  pgn: (headers?: Record<string, string>) => string;
  /** Direct access for read-only queries. Do not mutate. */
  chess: () => Chess;
}

function snapshot(chess: Chess, startFen: Fen): PositionSnapshot {
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  return {
    fen: chess.fen(),
    turn: toLongColor(chess.turn()),
    dests: legalDests(chess),
    lastMove: last ? [last.from, last.to] : null,
    inCheck: chess.inCheck(),
    checkedKing: checkedKingSquare(chess),
    status: gameStatus(chess),
    history,
    startFen,
  };
}

/**
 * Owns a mutable chess.js game and exposes immutable snapshots for rendering.
 */
export function useChess(
  initialFen: Fen = START_FEN,
  options: { autoQueen?: boolean } = {},
): UseChess {
  const chessRef = useRef<Chess | null>(null);
  const startFenRef = useRef(initialFen);
  chessRef.current ??= new Chess(initialFen);
  const initial = chessRef.current;

  const [position, setPosition] = useState<PositionSnapshot>(() => snapshot(initial, initialFen));
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const autoQueen = options.autoQueen ?? false;

  const game = useCallback((): Chess => {
    chessRef.current ??= new Chess(initialFen);
    return chessRef.current;
  }, [initialFen]);
  const commit = useCallback(() => setPosition(snapshot(game(), startFenRef.current)), [game]);

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): Move | null | 'promotion' => {
      const chess = game();
      if (!promotion && isPromotionMove(chess, from, to)) {
        if (autoQueen) {
          promotion = 'q';
        } else {
          setPendingPromotion({ from, to, color: toLongColor(chess.turn()) });
          return 'promotion';
        }
      }
      const input: MoveInput = promotion ? { from, to, promotion } : { from, to };
      const move = tryMove(chess, input);
      if (move) {
        playMoveSound(move, chess);
        commit();
      }
      return move;
    },
    [autoQueen, commit, game],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null): Move | null => {
      const pending = pendingPromotion;
      setPendingPromotion(null);
      if (!pending) return null;
      if (!piece) {
        // Cancelled: force the board back to the real position.
        commit();
        return null;
      }
      const move = tryMove(game(), { ...pending, promotion: piece });
      if (move) playMoveSound(move, game());
      commit();
      return move;
    },
    [pendingPromotion, commit, game],
  );

  const playNotation = useCallback(
    (notation: string): Move | null => {
      const chess = game();
      const move = tryNotation(chess, notation);
      if (move) {
        playMoveSound(move, chess);
        commit();
      }
      return move;
    },
    [commit, game],
  );

  const undo = useCallback((): Move | null => {
    const move = game().undo();
    setPendingPromotion(null);
    commit();
    return move;
  }, [commit, game]);

  const reset = useCallback(
    (fen: Fen = START_FEN) => {
      chessRef.current = new Chess(fen);
      startFenRef.current = fen;
      setPendingPromotion(null);
      commit();
    },
    [commit],
  );

  const loadPgn = useCallback(
    (pgn: string): boolean => {
      const parsed = new Chess();
      try {
        parsed.loadPgn(pgn);
      } catch {
        return false;
      }
      chessRef.current = parsed;
      const headers: Record<string, string | undefined> = parsed.getHeaders();
      startFenRef.current = headers.FEN ?? START_FEN;
      setPendingPromotion(null);
      commit();
      return true;
    },
    [commit],
  );

  const pgn = useCallback(
    (headers: Record<string, string> = {}): string => {
      const chess = game();
      for (const [key, value] of Object.entries(headers)) chess.setHeader(key, value);
      return chess.pgn();
    },
    [game],
  );

  return useMemo(
    () => ({
      position,
      pendingPromotion,
      playMove,
      resolvePromotion,
      playNotation,
      undo,
      reset,
      loadPgn,
      pgn,
      chess: game,
    }),
    [
      position,
      pendingPromotion,
      playMove,
      resolvePromotion,
      playNotation,
      undo,
      reset,
      loadPgn,
      pgn,
      game,
    ],
  );
}

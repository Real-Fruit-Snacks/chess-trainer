import type { Square } from 'chess.js';
import { useCallback, useMemo, useRef, useState } from 'react';
import { playMoveSound } from '@/lib/sound';
import { Chess960Game, type Chess960Move, playChess960Typed } from './chess960';
import type { GameStatus } from './helpers';
import { START_FEN } from './startFen';
import type { Fen, LongColor, MoveInput, PromotionPiece } from './types';
import type { PendingPromotion } from './useChess';

/** The position of a Chess960 game, for rendering (the counterpart of `useChess`'s). */
export interface Chess960Snapshot {
  fen: Fen;
  turn: LongColor;
  /** Legal destinations for the board: castling is the king onto its rook. */
  dests: Map<Square, Square[]>;
  /** The last move's squares: for castling, the king's and its rook's. */
  lastMove: [Square, Square] | null;
  inCheck: boolean;
  checkedKing: Square | null;
  status: GameStatus;
  /** The moves from the starting position. */
  history: Chess960Move[];
  startFen: Fen;
}

/** `useChess` for a Chess960 game: the same calls, played by Chess960's rules. */
export interface UseChess960 {
  position: Chess960Snapshot;
  pendingPromotion: PendingPromotion | null;
  /**
   * Attempts a move from the board (a king dropped on its rook castles). Returns
   * the move, `null` if illegal, or `'promotion'` when a piece must be chosen first.
   */
  playMove: (
    from: Square,
    to: Square,
    promotion?: PromotionPiece,
  ) => Chess960Move | null | 'promotion';
  /** Completes (or cancels with `null`) a pending promotion. */
  resolvePromotion: (piece: PromotionPiece | null) => Chess960Move | null;
  /** Plays a move given in SAN ("O-O") or UCI ("e1h1", an engine's). */
  playNotation: (notation: string) => Chess960Move | null;
  undo: () => Chess960Move | null;
  /** Starts again from `fen` (a Chess960 position; the classical start when it is none). */
  reset: (fen?: Fen) => void;
  /** The game in PGN, with the Chess960 tags. */
  pgn: (headers?: Record<string, string>) => string;
  /** Direct access for read-only queries. Do not mutate. */
  game: () => Chess960Game;
}

function snapshot(game: Chess960Game): Chess960Snapshot {
  const history = game.history();
  const last = history[history.length - 1];
  return {
    fen: game.fen(),
    turn: game.turn(),
    dests: game.dests(),
    lastMove: last ? [last.from, last.to] : null,
    inCheck: game.inCheck(),
    checkedKing: game.checkedKing(),
    status: game.status(),
    history,
    startFen: game.startFen,
  };
}

/** Owns a mutable Chess960 game and exposes immutable snapshots for rendering. */
export function useChess960(options: { autoQueen?: boolean } = {}): UseChess960 {
  const gameRef = useRef<Chess960Game | null>(null);
  gameRef.current ??= new Chess960Game(START_FEN);
  const initial = gameRef.current;
  const [position, setPosition] = useState<Chess960Snapshot>(() => snapshot(initial));
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const autoQueen = options.autoQueen ?? false;

  const game = useCallback((): Chess960Game => {
    gameRef.current ??= new Chess960Game(START_FEN);
    return gameRef.current;
  }, []);
  const commit = useCallback(() => setPosition(snapshot(game())), [game]);

  /** Plays a move on the live game, with its sound. */
  const play = useCallback(
    (input: MoveInput | string): Chess960Move | null => {
      const live = game();
      const move = live.move(input);
      if (move) {
        playMoveSound(move, { inCheck: () => live.inCheck() });
        commit();
      }
      return move;
    },
    [commit, game],
  );

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): Chess960Move | null | 'promotion' => {
      const live = game();
      if (!promotion && live.isPromotion(from, to)) {
        if (autoQueen) {
          promotion = 'q';
        } else {
          setPendingPromotion({ from, to, color: live.turn() });
          return 'promotion';
        }
      }
      return play(promotion ? { from, to, promotion } : { from, to });
    },
    [autoQueen, game, play],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null): Chess960Move | null => {
      const pending = pendingPromotion;
      setPendingPromotion(null);
      if (!pending) return null;
      if (!piece) {
        // Cancelled: force the board back to the real position.
        commit();
        return null;
      }
      const move = play({ from: pending.from, to: pending.to, promotion: piece });
      if (!move) commit();
      return move;
    },
    [pendingPromotion, commit, play],
  );

  const playNotation = useCallback(
    (notation: string): Chess960Move | null => {
      // Read forgivingly ("o-o", "nf3"), then played in its exact form.
      const typed = playChess960Typed(game().fen(), notation, { autoQueen });
      return typed ? play(typed.uci) : null;
    },
    [autoQueen, game, play],
  );

  const undo = useCallback((): Chess960Move | null => {
    const move = game().undo();
    setPendingPromotion(null);
    commit();
    return move;
  }, [commit, game]);

  const reset = useCallback(
    (fen: Fen = START_FEN) => {
      gameRef.current = Chess960Game.from(fen) ?? new Chess960Game(START_FEN);
      setPendingPromotion(null);
      commit();
    },
    [commit],
  );

  const pgn = useCallback(
    (headers: Record<string, string> = {}): string => game().pgn(headers),
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
      pgn,
      game,
    }),
    [position, pendingPromotion, playMove, resolvePromotion, playNotation, undo, reset, pgn, game],
  );
}

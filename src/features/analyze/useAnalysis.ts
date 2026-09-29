import { Chess, type Move, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { legalDests, parseUci, START_FEN, toLongColor } from '@/chess/helpers';
import type { Fen, LongColor, PromotionPiece, Uci } from '@/chess/types';
import { useChess } from '@/chess/useChess';
import { useEngine } from '@/engine/useEngine';
import type { SearchInfo } from '@/engine/uci';
import { useSettings } from '@/store/settings';
import { type ReviewSummary, reviewGame } from './gameReview';

export interface ViewedPosition {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  inCheck: boolean;
  /** Full move number for the side to move. */
  moveNumber: number;
}

export interface UseAnalysis {
  game: ReturnType<typeof useChess>;
  viewPly: number;
  setViewPly: (ply: number) => void;
  viewed: ViewedPosition;
  moves: Move[];
  engineOn: boolean;
  setEngineOn: (on: boolean) => void;
  engineStatus: ReturnType<typeof useEngine>['status'];
  engineError: Error | null;
  lines: Map<number, SearchInfo>;
  thinking: boolean;
  depthReached: number;
  nps: number | undefined;
  bestMoveShape: DrawShape[];
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  playUci: (uci: Uci) => void;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  loadFen: (fen: Fen) => boolean;
  loadPgn: (pgn: string) => boolean;
  reset: () => void;
  review: ReviewSummary | null;
  reviewProgress: number | null;
  startReview: () => void;
  cancelReview: () => void;
  retryEngine: () => Promise<void>;
}

function viewedPosition(startFen: Fen, moves: Move[], ply: number): ViewedPosition {
  const chess = new Chess(startFen);
  let last: Move | null = null;
  for (let i = 0; i < ply && i < moves.length; i++) {
    const m = moves[i];
    if (!m) break;
    last = chess.move(m.san);
  }
  return {
    fen: chess.fen(),
    turn: toLongColor(chess.turn()),
    dests: legalDests(chess),
    lastMove: last ? [last.from, last.to] : null,
    inCheck: chess.inCheck(),
    moveNumber: chess.moveNumber(),
  };
}

export function useAnalysis(): UseAnalysis {
  const autoQueen = useSettings((s) => s.autoQueen);
  const analysisDepth = useSettings((s) => s.analysisDepth);
  const analysisLines = useSettings((s) => s.analysisLines);

  const game = useChess(START_FEN, { autoQueen });
  const {
    engine,
    status: engineStatus,
    error: engineError,
    start: startEngine,
  } = useEngine({ hashMb: 32 });

  const moves = game.position.history;
  const [viewPly, setViewPlyState] = useState(0);
  const [engineOn, setEngineOn] = useState(true);
  const [lines, setLines] = useState<Map<number, SearchInfo>>(new Map());
  const [thinking, setThinking] = useState(false);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [reviewProgress, setReviewProgress] = useState<number | null>(null);
  const reviewAbort = useRef<AbortController | null>(null);
  const followLatest = useRef(true);

  // Keep the view on the latest move when new moves are played.
  useEffect(() => {
    if (followLatest.current) setViewPlyState(moves.length);
    else setViewPlyState((p) => Math.min(p, moves.length));
  }, [moves.length]);

  const setViewPly = useCallback(
    (ply: number) => {
      const clamped = Math.max(0, Math.min(moves.length, ply));
      followLatest.current = clamped === moves.length;
      setViewPlyState(clamped);
    },
    [moves.length],
  );

  const viewed = useMemo(
    () => viewedPosition(game.position.startFen, moves, viewPly),
    [game.position.startFen, moves, viewPly],
  );

  // Continuous evaluation of the viewed position.
  useEffect(() => {
    if (!engineOn || engineStatus !== 'ready' || reviewProgress !== null) {
      setThinking(false);
      return;
    }
    const chess = new Chess(viewed.fen);
    if (chess.isGameOver()) {
      setLines(new Map());
      setThinking(false);
      return;
    }
    const client = engine();
    setLines(new Map());
    setThinking(true);
    const collected = new Map<number, SearchInfo>();
    let frame = 0;
    const handle = client.search(
      { fen: viewed.fen, depth: analysisDepth, multipv: analysisLines },
      (info) => {
        collected.set(info.multipv, info);
        // Throttle React updates to animation frames.
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            setLines(new Map(collected));
          });
        }
      },
    );
    void handle.result.then((result) => {
      if (!result.stopped) {
        setLines(new Map(result.lines));
        setThinking(false);
      }
    });
    return () => {
      handle.stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [engineOn, engineStatus, viewed.fen, analysisDepth, analysisLines, engine, reviewProgress]);

  const depthReached = useMemo(() => lines.get(1)?.depth ?? 0, [lines]);
  const nps = useMemo(() => lines.get(1)?.nps, [lines]);

  const bestMoveShape = useMemo<DrawShape[]>(() => {
    const best = lines.get(1)?.pv[0];
    if (!best || !engineOn) return [];
    const { from, to } = parseUci(best);
    return [{ orig: from, dest: to, brush: 'paleBlue' }];
  }, [lines, engineOn]);

  /** Truncates the game to the viewed ply so a new move can be played from there. */
  const truncateToView = useCallback(() => {
    let count = moves.length - viewPly;
    while (count-- > 0) game.undo();
  }, [moves.length, viewPly, game]);

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (viewPly < moves.length) {
        // Same move as the existing continuation? Just step forward.
        const nextMove = moves[viewPly];
        if (
          nextMove?.from === from &&
          nextMove.to === to &&
          (!promotion || nextMove.promotion === promotion)
        ) {
          setViewPly(viewPly + 1);
          return;
        }
        truncateToView();
      }
      followLatest.current = true;
      setReview(null);
      game.playMove(from, to, promotion);
    },
    [viewPly, moves, truncateToView, game, setViewPly],
  );

  const playUci = useCallback(
    (uci: Uci) => {
      const { from, to, promotion } = parseUci(uci);
      playMove(from, to, promotion);
    },
    [playMove],
  );

  const loadFen = useCallback(
    (fen: Fen) => {
      try {
        new Chess(fen);
      } catch {
        return false;
      }
      followLatest.current = true;
      setReview(null);
      game.reset(fen);
      return true;
    },
    [game],
  );

  const loadPgn = useCallback(
    (pgn: string) => {
      followLatest.current = true;
      setReview(null);
      return game.loadPgn(pgn);
    },
    [game],
  );

  const reset = useCallback(() => {
    followLatest.current = true;
    setReview(null);
    game.reset(START_FEN);
  }, [game]);

  const cancelReview = useCallback(() => {
    reviewAbort.current?.abort();
    reviewAbort.current = null;
    setReviewProgress(null);
  }, []);

  const startReview = useCallback(() => {
    if (engineStatus !== 'ready' || moves.length === 0) return;
    cancelReview();
    const controller = new AbortController();
    reviewAbort.current = controller;
    setReviewProgress(0);
    reviewGame(engine(), game.position.startFen, moves, {
      depth: 12,
      signal: controller.signal,
      onProgress: (done, total) => setReviewProgress(done / total),
    })
      .then((summary) => {
        if (!controller.signal.aborted) setReview(summary);
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) console.error(err);
      })
      .finally(() => {
        if (reviewAbort.current === controller) {
          reviewAbort.current = null;
          setReviewProgress(null);
        }
      });
  }, [engineStatus, moves, engine, game.position.startFen, cancelReview]);

  useEffect(() => () => reviewAbort.current?.abort(), []);

  return {
    game,
    viewPly,
    setViewPly,
    viewed,
    moves,
    engineOn,
    setEngineOn,
    engineStatus,
    engineError,
    lines,
    thinking,
    depthReached,
    nps,
    bestMoveShape,
    playMove,
    playUci,
    resolvePromotion: game.resolvePromotion,
    loadFen,
    loadPgn,
    reset,
    review,
    reviewProgress,
    startReview,
    cancelReview,
    retryEngine: startEngine,
  };
}

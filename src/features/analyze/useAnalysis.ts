import { Chess, type Move, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import type { MoveJudgement } from '@/components/chess/MoveList';
import {
  isPromotionMove,
  legalDests,
  parseUci,
  sanitizeFen,
  START_FEN,
  toLongColor,
  tryMove,
  tryNotation,
} from '@/chess/helpers';
import { GameTree, type TreeNode } from '@/chess/tree';
import type { Fen, LongColor, PromotionPiece, Uci } from '@/chess/types';
import { useEngine } from '@/engine/useEngine';
import type { SearchInfo } from '@/engine/uci';
import { findOpening, loadOpenings, type Opening } from '@/lib/openings';
import { playMoveSound } from '@/lib/sound';
import { isTablebasePosition, lookupTablebase, type TablebaseResult } from '@/lib/tablebase';
import { REVIEW_DEPTHS, useSettings } from '@/store/settings';
import { type ReviewSummary, reviewGame } from './gameReview';

export interface ViewedPosition {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  inCheck: boolean;
  /** Full move number for the side to move. */
  moveNumber: number;
  gameOver: boolean;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
}

export interface PendingPromotion {
  from: Square;
  to: Square;
  color: LongColor;
}

export type TablebaseState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; result: TablebaseResult }
  | { status: 'error'; message: string };

export interface UseAnalysis {
  tree: GameTree;
  /** Bumps on every tree change; handy as a memo key. */
  version: number;
  current: TreeNode;
  path: TreeNode[];
  viewed: ViewedPosition;
  pendingPromotion: PendingPromotion | null;
  opening: Opening | null;
  tablebase: TablebaseState;
  engineOn: boolean;
  setEngineOn: (on: boolean) => void;
  engineStatus: ReturnType<typeof useEngine>['status'];
  engineError: Error | null;
  /** The engine client, for searches of the page's own (with the board's analysis off). */
  engine: ReturnType<typeof useEngine>['engine'];
  /** Status-line label: build and thread count once the engine is running. */
  engineName: string;
  lines: Map<number, SearchInfo>;
  thinking: boolean;
  depthReached: number;
  nps: number | undefined;
  bestMoveShape: DrawShape[];
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  playUci: (uci: Uci) => void;
  /** Plays a typed move (SAN or UCI). Returns false when illegal. */
  playNotation: (notation: string) => boolean;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  goTo: (node: TreeNode) => void;
  back: () => void;
  forward: () => void;
  goStart: () => void;
  goEnd: () => void;
  promoteVariation: (node?: TreeNode) => void;
  makeMainLine: (node?: TreeNode) => void;
  deleteVariation: (node?: TreeNode) => void;
  deleteFromHere: () => void;
  setComment: (text: string, node?: TreeNode) => void;
  setGlyph: (nag: number | null, node?: TreeNode) => void;
  loadFen: (fen: Fen) => boolean;
  /**
   * Loads a PGN, opened at its last move, at `atPly` (1-based main-line ply) or,
   * with `line`, at the node reached by following those UCI moves from the start.
   */
  loadPgn: (pgn: string, atPly?: number, line?: Uci[]) => boolean;
  /** The reviewed move for `node`, when the review still describes it (same main-line move). */
  reviewFor: (node: TreeNode) => ReviewSummary['moves'][number] | undefined;
  reset: () => void;
  pgn: () => string;
  review: ReviewSummary | null;
  reviewProgress: number | null;
  /** Estimated milliseconds until the running review finishes. */
  reviewEtaMs: number | null;
  /** Jumps to a main-line ply (0 = start). */
  goToPly: (ply: number) => void;
  /** Judgements keyed by node id (main line only). */
  judgements: Map<number, MoveJudgement>;
  startReview: () => void;
  cancelReview: () => void;
  retryEngine: () => Promise<void>;
}

function viewedPosition(node: TreeNode): ViewedPosition {
  const chess = new Chess(node.fen);
  const over = chess.isGameOver();
  let result: ViewedPosition['result'] = null;
  if (over) {
    result = chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2';
  }
  return {
    fen: node.fen,
    turn: toLongColor(chess.turn()),
    dests: legalDests(chess),
    lastMove: node.uci ? [parseUci(node.uci).from, parseUci(node.uci).to] : null,
    inCheck: chess.inCheck(),
    moveNumber: chess.moveNumber(),
    gameOver: over,
    result,
  };
}

export function useAnalysis(): UseAnalysis {
  const autoQueen = useSettings((s) => s.autoQueen);
  const analysisDepth = useSettings((s) => s.analysisDepth);
  const analysisLines = useSettings((s) => s.analysisLines);
  const tablebaseEnabled = useSettings((s) => s.tablebase);
  const reviewDepth = useSettings((s) => REVIEW_DEPTHS[s.reviewDepth]);

  const treeRef = useRef<GameTree | null>(null);
  treeRef.current ??= new GameTree(START_FEN);
  const tree = treeRef.current;
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const {
    engine,
    status: engineStatus,
    error: engineError,
    start: startEngine,
  } = useEngine({ hashMb: 32 });

  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [engineOn, setEngineOn] = useState(true);
  const [lines, setLines] = useState<Map<number, SearchInfo>>(new Map());
  const [thinking, setThinking] = useState(false);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [reviewProgress, setReviewProgress] = useState<number | null>(null);
  const [reviewEtaMs, setReviewEtaMs] = useState<number | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [tablebase, setTablebase] = useState<TablebaseState>({ status: 'off' });
  const reviewAbort = useRef<AbortController | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the change signal for the mutable tree.
  const current = useMemo(() => tree.current, [tree, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const path = useMemo(() => tree.pathTo(current), [tree, current, version]);
  const viewed = useMemo(() => viewedPosition(current), [current]);
  // The moves that led to the viewed position, so the engine sees repetitions (a string: the
  // search restarts only when the line changes, not on every edit of the tree).
  const startFen = tree.startFen;
  const history = useMemo(() => path.map((n) => n.uci).join(' '), [path]);

  // Opening name for the current line.
  useEffect(() => {
    let cancelled = false;
    const fens = [tree.startFen, ...path.map((n) => n.fen)];
    loadOpenings()
      .then((table) => {
        if (!cancelled) setOpening(findOpening(table, fens));
      })
      .catch(() => {
        if (!cancelled) setOpening(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tree, path]);

  // Optional tablebase lookup.
  useEffect(() => {
    if (!tablebaseEnabled || !isTablebasePosition(viewed.fen) || viewed.gameOver) {
      setTablebase({ status: 'off' });
      return;
    }
    const controller = new AbortController();
    setTablebase({ status: 'loading' });
    const timer = window.setTimeout(() => {
      lookupTablebase(viewed.fen, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setTablebase({ status: 'ready', result });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setTablebase({
            status: 'error',
            message: err instanceof Error ? err.message : 'Tablebase unavailable',
          });
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tablebaseEnabled, viewed.fen, viewed.gameOver]);

  // Continuous evaluation of the viewed position.
  useEffect(() => {
    if (!engineOn || engineStatus !== 'ready' || reviewProgress !== null) {
      // Lines from an earlier position would show the wrong sign for this one.
      setLines(new Map());
      setThinking(false);
      return;
    }
    if (viewed.gameOver) {
      setLines(new Map());
      setThinking(false);
      return;
    }
    const client = engine();
    setLines(new Map());
    setThinking(true);
    const collected = new Map<number, SearchInfo>();
    let frame = 0;
    // A stopped search can still deliver a late `info`; once this position is gone, ignore it.
    let cancelled = false;
    const handle = client.search(
      {
        fen: startFen,
        moves: history ? history.split(' ') : [],
        depth: analysisDepth,
        multipv: analysisLines,
      },
      (info) => {
        if (cancelled) return;
        collected.set(info.multipv, info);
        // Throttle React updates to animation frames.
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (!cancelled) setLines(new Map(collected));
          });
        }
      },
    );
    handle.result
      .then((result) => {
        if (!cancelled && !result.stopped) {
          setLines(new Map(result.lines));
          setThinking(false);
        }
      })
      .catch(() => {
        // The engine failed mid-search; its status (and the Retry) says so.
        if (!cancelled) setThinking(false);
      });
    return () => {
      cancelled = true;
      handle.stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [
    engineOn,
    engineStatus,
    startFen,
    history,
    viewed.gameOver,
    analysisDepth,
    analysisLines,
    engine,
    reviewProgress,
  ]);

  const depthReached = useMemo(() => lines.get(1)?.depth ?? 0, [lines]);
  const nps = useMemo(() => lines.get(1)?.nps, [lines]);

  const bestMoveShape = useMemo<DrawShape[]>(() => {
    const best = lines.get(1)?.pv[0];
    if (!best || !engineOn) return [];
    const { from, to } = parseUci(best);
    return [{ orig: from, dest: to, brush: 'paleBlue' }];
  }, [lines, engineOn]);

  const commit = useCallback(
    (move: Move | null) => {
      if (!move) return false;
      const node = tree.addMove({
        from: move.from,
        to: move.to,
        promotion: move.promotion as PromotionPiece | undefined,
      });
      if (!node) return false;
      playMoveSound(move, new Chess(node.fen));
      bump();
      return true;
    },
    [tree, bump],
  );

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      const chess = new Chess(tree.current.fen);
      if (!promotion && isPromotionMove(chess, from, to)) {
        if (autoQueen) promotion = 'q';
        else {
          setPendingPromotion({ from, to, color: toLongColor(chess.turn()) });
          return;
        }
      }
      commit(tryMove(chess, { from, to, promotion }));
    },
    [tree, autoQueen, commit],
  );

  const playUci = useCallback(
    (uci: Uci) => {
      const { from, to, promotion } = parseUci(uci);
      playMove(from, to, promotion);
    },
    [playMove],
  );

  const playNotation = useCallback(
    (notation: string): boolean => {
      const chess = new Chess(tree.current.fen);
      return commit(tryNotation(chess, notation, { autoQueen }));
    },
    [tree, autoQueen, commit],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const pending = pendingPromotion;
      setPendingPromotion(null);
      if (!pending || !piece) return;
      const chess = new Chess(tree.current.fen);
      commit(tryMove(chess, { from: pending.from, to: pending.to, promotion: piece }));
    },
    [pendingPromotion, tree, commit],
  );

  const goTo = useCallback(
    (node: TreeNode) => {
      tree.goTo(node);
      bump();
    },
    [tree, bump],
  );
  const back = useCallback(() => {
    if (tree.back()) bump();
  }, [tree, bump]);
  const forward = useCallback(() => {
    if (tree.forward()) bump();
  }, [tree, bump]);
  const goStart = useCallback(() => {
    tree.goStart();
    bump();
  }, [tree, bump]);
  const goEnd = useCallback(() => {
    tree.goEnd();
    bump();
  }, [tree, bump]);
  const goToPly = useCallback(
    (ply: number) => {
      const line = tree.mainLine();
      tree.goTo(ply <= 0 ? tree.root : (line[Math.min(ply, line.length) - 1] ?? tree.root));
      bump();
    },
    [tree, bump],
  );

  /**
   * Runs a tree edit and drops the review only when the main line it describes
   * has changed (a side variation can be reordered or deleted freely).
   */
  const editTree = useCallback(
    (edit: () => void) => {
      const before = tree
        .mainLine()
        .map((n) => n.san)
        .join(' ');
      edit();
      if (
        tree
          .mainLine()
          .map((n) => n.san)
          .join(' ') !== before
      ) {
        setReview(null);
      }
      bump();
    },
    [tree, bump],
  );
  const promoteVariation = useCallback(
    (node: TreeNode = tree.current) => editTree(() => tree.promote(node)),
    [tree, editTree],
  );
  const makeMainLine = useCallback(
    (node: TreeNode = tree.current) => editTree(() => tree.promoteToMain(node)),
    [tree, editTree],
  );
  const deleteVariation = useCallback(
    (node: TreeNode = tree.current) => {
      if (!node.parent) return;
      editTree(() => tree.deleteNode(node));
    },
    [tree, editTree],
  );
  const deleteFromHere = useCallback(
    () => editTree(() => tree.truncateAfterCurrent()),
    [tree, editTree],
  );
  const setComment = useCallback(
    (text: string, node: TreeNode = tree.current) => {
      tree.setComment(node, text);
      bump();
    },
    [tree, bump],
  );
  const setGlyph = useCallback(
    (nag: number | null, node: TreeNode = tree.current) => {
      tree.setGlyph(node, nag);
      bump();
    },
    [tree, bump],
  );

  const replaceTree = useCallback(
    (next: GameTree) => {
      treeRef.current = next;
      setPendingPromotion(null);
      setReview(null);
      bump();
    },
    [bump],
  );

  const loadFen = useCallback(
    (fen: Fen) => {
      // Repairs stale castling flags and en passant squares; rejects non-positions.
      const clean = sanitizeFen(fen);
      if (!clean) return false;
      try {
        new Chess(clean);
      } catch {
        return false;
      }
      replaceTree(new GameTree(clean));
      return true;
    },
    [replaceTree],
  );

  const loadPgn = useCallback(
    (pgn: string, atPly?: number, line?: Uci[]) => {
      try {
        const next = GameTree.fromPgn(pgn);
        next.goEnd();
        if (line && line.length > 0) {
          // Follow the shared path as far as it exists in the tree.
          let node: TreeNode = next.root;
          for (const uci of line) {
            const child = node.children.find((c) => c.uci === uci);
            if (!child) break;
            node = child;
          }
          next.goTo(node);
        } else if (atPly !== undefined && atPly >= 0) {
          const main = next.mainLine();
          next.goTo(
            atPly === 0 ? next.root : (main[Math.min(atPly, main.length) - 1] ?? next.root),
          );
        }
        replaceTree(next);
        return true;
      } catch {
        return false;
      }
    },
    [replaceTree],
  );

  const reset = useCallback(() => replaceTree(new GameTree(START_FEN)), [replaceTree]);

  const pgn = useCallback(() => treeRef.current?.toPgn() ?? '', []);

  const cancelReview = useCallback(() => {
    reviewAbort.current?.abort();
    reviewAbort.current = null;
    setReviewProgress(null);
  }, []);

  const startReview = useCallback(() => {
    const line = tree.mainLine();
    if (engineStatus !== 'ready' || line.length === 0) return;
    cancelReview();
    const controller = new AbortController();
    reviewAbort.current = controller;
    setReviewProgress(0);
    // The reviewer only needs SAN, but takes chess.js moves; replay the main line to get them.
    const chess = new Chess(tree.startFen);
    const moves: Move[] = [];
    for (const node of line) {
      const move = tryMove(chess, node.san);
      if (!move) break;
      moves.push(move);
    }
    const startedAt = Date.now();
    setReviewEtaMs(null);
    reviewGame(engine(), tree.startFen, moves, {
      depth: reviewDepth,
      signal: controller.signal,
      onProgress: (done, total) => {
        setReviewProgress(done / total);
        if (done >= 3) {
          const perPosition = (Date.now() - startedAt) / done;
          setReviewEtaMs(Math.round(perPosition * (total - done)));
        }
      },
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
          setReviewEtaMs(null);
        }
      });
  }, [engineStatus, tree, engine, cancelReview, reviewDepth]);

  useEffect(() => () => reviewAbort.current?.abort(), []);

  const reviewFor = useCallback(
    (node: TreeNode) => {
      if (!review || node.ply === 0 || !tree.isMainLine(node)) return undefined;
      const move = review.moves[node.ply - 1];
      return move?.san === node.san ? move : undefined;
    },
    [review, tree],
  );

  const judgements = useMemo(() => {
    const map = new Map<number, MoveJudgement>();
    if (!review) return map;
    const line = tree.mainLine();
    review.moves.forEach((m, i) => {
      const node = line[i];
      if (node?.san === m.san) map.set(node.id, m.judgement);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, tree, version]);

  return {
    tree,
    version,
    current,
    path,
    viewed,
    pendingPromotion,
    opening,
    tablebase,
    engineOn,
    setEngineOn,
    engineStatus,
    engineError,
    engine,
    engineName: engineStatus === 'ready' ? engine().name : 'Stockfish 19',
    lines,
    thinking,
    depthReached,
    nps,
    bestMoveShape,
    playMove,
    playUci,
    playNotation,
    resolvePromotion,
    goTo,
    back,
    forward,
    goStart,
    goEnd,
    promoteVariation,
    makeMainLine,
    deleteVariation,
    deleteFromHere,
    setComment,
    setGlyph,
    loadFen,
    loadPgn,
    reviewFor,
    reset,
    pgn,
    review,
    reviewProgress,
    reviewEtaMs,
    goToPly,
    judgements,
    startReview,
    cancelReview,
    retryEngine: startEngine,
  };
}

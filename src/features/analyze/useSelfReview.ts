import { useCallback, useEffect, useRef, useState } from 'react';
import type { TreeNode } from '@/chess/tree';
import { useProgress } from '@/store/progress';
import {
  engineMoveOf,
  type JudgedSuggestion,
  judgeSuggestion,
  scoreSelfReview,
  type SelfMark,
  type SelfReviewScore,
} from './selfReview';
import type { UseAnalysis } from './useAnalysis';

export type SelfPhase =
  | 'off'
  | 'marking' // the learner goes through the game, engine out of sight
  | 'checking' // the engine reviews the game, then judges the suggestions
  | 'done'; // the comparison is on screen

export interface UseSelfReview {
  phase: SelfPhase;
  marks: SelfMark[];
  /** The marked ply whose alternative the learner is about to play on the board. */
  suggesting: number | null;
  notice: string | null;
  score: SelfReviewScore | null;
  /** Verdicts on the suggested moves, by ply (null: could not be judged). */
  suggestions: Map<number, JudgedSuggestion | null>;
  /** Main-line node ids of the marked moves, for the move list. */
  markedNodes: ReadonlySet<number>;
  start: () => void;
  /** Leaves self-analysis (and any review it started), the engine back as it was. */
  stop: () => void;
  /** Marks or unmarks a main-line move as a turning point. */
  toggleMark: (node: TreeNode) => void;
  /** Takes the board to the position before a marked move, for the move the learner would play. */
  suggestFor: (ply: number) => void;
  cancelSuggestion: () => void;
  removeSuggestion: (ply: number) => void;
  check: () => void;
  /** Closes the comparison; the engine's review stays. */
  finish: () => void;
}

/**
 * Drives self-analysis on the analysis board: the marks and suggestions, the
 * engine kept out of sight until "Check with the engine", the comparison with
 * the review, and the record of it in the learner's progress.
 */
export function useSelfReview(analysis: UseAnalysis): UseSelfReview {
  const [phase, setPhase] = useState<SelfPhase>('off');
  const [marks, setMarks] = useState<SelfMark[]>([]);
  const [suggesting, setSuggesting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [score, setScore] = useState<SelfReviewScore | null>(null);
  const [suggestions, setSuggestions] = useState<Map<number, JudgedSuggestion | null>>(new Map());
  /** Whether the engine was on before self-analysis turned it off. */
  const engineWasOn = useRef(true);
  /** Bumped by start and stop: a comparison still being worked out for an older run is dropped. */
  const runRef = useRef(0);
  /** The review this check started has been seen running… */
  const reviewSeen = useRef(false);
  /** …and its result is being worked out (once). */
  const judging = useRef(false);
  const { tree, current, review, reviewProgress, setEngineOn, goTo } = analysis;
  const mainLine = tree.mainLine();

  const start = useCallback(() => {
    runRef.current += 1;
    engineWasOn.current = analysis.engineOn;
    setEngineOn(false);
    setMarks([]);
    setSuggesting(null);
    setNotice(null);
    setScore(null);
    setSuggestions(new Map());
    setPhase('marking');
  }, [analysis.engineOn, setEngineOn]);

  const stop = useCallback(() => {
    runRef.current += 1;
    if (phase === 'checking') analysis.cancelReview();
    setSuggesting(null);
    setNotice(null);
    setPhase('off');
    setEngineOn(engineWasOn.current);
  }, [phase, analysis, setEngineOn]);

  const toggleMark = useCallback(
    (node: TreeNode) => {
      if (phase !== 'marking' || node.ply === 0 || !tree.isMainLine(node)) return;
      setMarks((list) =>
        list.some((m) => m.ply === node.ply)
          ? list.filter((m) => m.ply !== node.ply)
          : [...list, { ply: node.ply, san: node.san }].sort((a, b) => a.ply - b.ply),
      );
      if (suggesting === node.ply) setSuggesting(null);
    },
    [phase, tree, suggesting],
  );

  const suggestFor = useCallback(
    (ply: number) => {
      if (phase !== 'marking' || !marks.some((m) => m.ply === ply)) return;
      setSuggesting(ply);
      setNotice(null);
      analysis.goToPly(ply - 1);
    },
    [phase, marks, analysis],
  );

  const cancelSuggestion = useCallback(() => {
    setSuggesting(null);
    setNotice(null);
  }, []);

  const removeSuggestion = useCallback((ply: number) => {
    setMarks((list) => list.map((m) => (m.ply === ply ? { ply: m.ply, san: m.san } : m)));
  }, []);

  // The move played from the position before a marked move is the learner's alternative.
  useEffect(() => {
    if (suggesting === null) return;
    const line = tree.mainLine();
    const before = suggesting === 1 ? tree.root : line[suggesting - 2];
    const gameMove = line[suggesting - 1];
    if (!before || !gameMove || current.parent !== before) return;
    if (current === gameMove) {
      setNotice('That is the move played in the game. Play the one you would choose instead.');
      goTo(before);
      return;
    }
    const ply = suggesting;
    setMarks((list) =>
      list.map((m) =>
        m.ply === ply ? { ...m, suggestion: { uci: current.uci, san: current.san } } : m,
      ),
    );
    setSuggesting(null);
    setNotice(null);
  }, [current, suggesting, tree, goTo]);

  const check = useCallback(() => {
    if (phase !== 'marking' || analysis.engineStatus !== 'ready' || mainLine.length === 0) return;
    setSuggesting(null);
    setNotice(null);
    reviewSeen.current = false;
    judging.current = false;
    setPhase('checking');
    analysis.startReview();
  }, [phase, analysis, mainLine.length]);

  // The review is in: score the marks, judge the suggestions, record the attempt, engine back on.
  useEffect(() => {
    if (phase !== 'checking') return;
    if (reviewProgress !== null) {
      reviewSeen.current = true;
      return;
    }
    // Not started yet, or already being worked out.
    if (!reviewSeen.current || judging.current) return;
    if (!review) {
      // The review stopped without a result (cancelled, or the engine failed).
      setNotice('The engine could not finish the review. Try again.');
      setPhase('marking');
      return;
    }
    judging.current = true;
    const run = runRef.current;
    const engine = analysis.engine;
    const scored = scoreSelfReview(review, marks);
    const pending = marks.filter((m) => m.suggestion);
    void (async () => {
      const verdicts = new Map<number, JudgedSuggestion | null>();
      for (const mark of pending) {
        const reviewed = review.moves[mark.ply - 1];
        const suggestion = mark.suggestion;
        if (!reviewed || !suggestion || reviewed.san !== mark.san) continue;
        try {
          verdicts.set(
            mark.ply,
            await judgeSuggestion(engine(), reviewed.fen, suggestion.uci, engineMoveOf(reviewed)),
          );
        } catch {
          verdicts.set(mark.ply, null);
        }
        if (run !== runRef.current) return;
      }
      if (run !== runRef.current) return;
      const judged = [...verdicts.values()].filter((v): v is JudgedSuggestion => v !== null);
      useProgress.getState().recordSelfReview({
        found: scored.found,
        total: scored.total,
        falseAlarms: scored.falseAlarms,
        suggestions: judged.length,
        goodSuggestions: judged.filter((v) => v.verdict === 'best' || v.verdict === 'good').length,
      });
      setScore(scored);
      setSuggestions(verdicts);
      setPhase('done');
      setEngineOn(engineWasOn.current);
    })();
  }, [phase, review, reviewProgress, marks, analysis.engine, setEngineOn]);

  const finish = useCallback(() => {
    setPhase('off');
    setScore(null);
  }, []);

  // A new game on the board ends self-analysis: its marks belonged to the old one.
  const startFen = tree.startFen;
  const firstMove = mainLine[0]?.san ?? '';
  const gameKey = useRef(`${startFen}|${firstMove}`);
  useEffect(() => {
    const key = `${startFen}|${firstMove}`;
    if (gameKey.current === key) return;
    gameKey.current = key;
    if (phase === 'marking') {
      setMarks([]);
      setSuggesting(null);
    }
  }, [startFen, firstMove, phase]);

  const markedNodes = new Set<number>();
  for (const mark of marks) {
    const node = mainLine[mark.ply - 1];
    if (node?.san === mark.san) markedNodes.add(node.id);
  }

  return {
    phase,
    marks,
    suggesting,
    notice,
    score,
    suggestions,
    markedNodes,
    start,
    stop,
    toggleMark,
    suggestFor,
    cancelSuggestion,
    removeSuggestion,
    check,
    finish,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parsePgnCached, type GameTree } from '@/chess/tree';
import type { LongColor } from '@/chess/types';
import {
  describeExplorerError,
  ExplorerError,
  type ExplorerResult,
  lookupExplorerBatch,
  peekExplorer,
} from '@/lib/explorer';
import { useRepertoire } from '@/store/repertoire';
import {
  analyseGaps,
  answeredPositions,
  DEFAULT_GAP_DEPTH,
  type GapOptions,
  type GapReport,
} from './gaps';
import { positionKey } from './model';
import { BUILT_IN_REPERTOIRES } from './repertoires';

/** What the gap finder is doing: the report itself comes from the answers, whatever this says. */
export type GapScanStatus =
  | { kind: 'idle' }
  /** Asking; `waitUntil` while the explorer has asked for a pause (a 429). */
  | { kind: 'running'; waitUntil: number | null }
  | { kind: 'stopped' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string; needsAccount: boolean };

export interface GapScan {
  report: GapReport;
  status: GapScanStatus;
  /** Asks about every position without an answer yet (cached ones cost nothing). */
  start: () => void;
  stop: () => void;
}

const IDLE: GapScanStatus = { kind: 'idle' };

/** The options last chosen, kept for the session: the next repertoire opens with them. */
let sessionOptions: GapOptions = { database: 'lichess', depth: DEFAULT_GAP_DEPTH };

/** The gap finder's database and depth, remembered for the session. */
export function useGapOptions(initial?: GapOptions): [GapOptions, (next: GapOptions) => void] {
  const [options, setOptions] = useState<GapOptions>(() => initial ?? sessionOptions);
  const update = useCallback((next: GapOptions) => {
    sessionOptions = next;
    setOptions(next);
  }, []);
  return [options, update];
}

/**
 * Runs the gap finder over a repertoire: asks the explorer about its positions
 * one at a time (lookupExplorerBatch) and keeps the report current as answers
 * arrive, as the repertoire is edited and as the options change. A run belongs
 * to the options it started with; leaving the page stops it.
 */
export function useGapScan(
  tree: GameTree,
  color: LongColor,
  options: GapOptions,
  elsewhere: ReadonlyMap<string, string>,
): GapScan {
  const { database, depth } = options;
  const [results, setResults] = useState<ReadonlyMap<string, ExplorerResult>>(() => new Map());
  const [status, setStatus] = useState<{ value: GapScanStatus; options: string }>({
    value: IDLE,
    options: '',
  });
  const run = useRef<AbortController | null>(null);
  const optionsKey = `${database}:${depth}`;

  const report = useMemo(
    () =>
      analyseGaps(
        tree,
        color,
        { database, depth },
        // Answers from this page's runs, else from the session's cache (an earlier run, the
        // explorer card): either way no request.
        (fen) => results.get(`${database}:${positionKey(fen)}`) ?? peekExplorer(fen, database),
        elsewhere,
      ),
    [tree, color, database, depth, results, elsewhere],
  );

  const positions = useRef(report.positions);
  positions.current = report.positions;

  const start = useCallback(() => {
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    const key = `${database}:${depth}`;
    const set = (value: GapScanStatus) => {
      if (run.current === controller) setStatus({ value, options: key });
    };
    set({ kind: 'running', waitUntil: null });
    const fens = positions.current.map((p) => p.fen);
    lookupExplorerBatch(fens, database, {
      signal: controller.signal,
      onResult: (result, index) => {
        const fen = fens[index];
        if (fen === undefined) return;
        setResults((prev) => new Map(prev).set(`${database}:${positionKey(fen)}`, result));
      },
      onWait: (seconds) =>
        set({
          kind: 'running',
          waitUntil: seconds === null ? null : Date.now() + seconds * 1000,
        }),
    }).then(
      () => set({ kind: 'done' }),
      (err: unknown) => {
        if (controller.signal.aborted) {
          set({ kind: 'stopped' });
          return;
        }
        set({
          kind: 'failed',
          message: describeExplorerError(err),
          needsAccount: err instanceof ExplorerError && err.kind === 'auth',
        });
      },
    );
  }, [database, depth]);

  const stop = useCallback(() => run.current?.abort(), []);

  // Leaving the page (or this repertoire) ends the run.
  useEffect(
    () => () => {
      run.current?.abort();
      run.current = null;
    },
    [],
  );

  return {
    report,
    // A status belongs to the options it was for: other options start idle.
    status: status.options === optionsKey ? status.value : IDLE,
    start,
    stop,
  };
}

/**
 * Positions the learner's other repertoires of the same colour answer, with
 * the name of the first that does: their own repertoires, and the built-in
 * ones they have started learning.
 */
export function useOtherAnswers(
  repertoireId: string,
  color: LongColor,
): ReadonlyMap<string, string> {
  const custom = useRepertoire((s) => s.custom);
  const cards = useRepertoire((s) => s.cards);
  // Card ids are "<repertoire>|<moves>": the repertoires with any progress, as one string so
  // the answers below are worked out again only when that set changes.
  const started = useMemo(() => {
    const ids = new Set<string>();
    for (const id of Object.keys(cards)) {
      const end = id.indexOf('|');
      if (end > 0) ids.add(id.slice(0, end));
    }
    return [...ids].sort().join('\n');
  }, [cards]);
  return useMemo(() => {
    const startedIds = new Set(started.split('\n'));
    const others = [
      ...custom.filter((r) => r.id !== repertoireId && r.color === color),
      ...BUILT_IN_REPERTOIRES.filter(
        (r) => r.id !== repertoireId && r.color === color && startedIds.has(r.id),
      ),
    ];
    const answers = new Map<string, string>();
    for (const rep of others) {
      let tree: GameTree;
      try {
        tree = parsePgnCached(rep.pgn);
      } catch {
        continue;
      }
      for (const key of answeredPositions(tree, rep.color)) {
        if (!answers.has(key)) answers.set(key, rep.name);
      }
    }
    return answers;
  }, [custom, started, repertoireId, color]);
}

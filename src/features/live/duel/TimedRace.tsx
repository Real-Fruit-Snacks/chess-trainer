import { type ReactNode, useEffect, useState } from 'react';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { usePuzzleTrainer } from '@/features/puzzles/usePuzzleTrainer';
import { DUEL_RULES } from '../../../../relay/src/live/shared.mjs';
import { trainerPuzzle } from '../duelRounds';
import type { DuelProgress, RacePuzzle, Side } from '../types';
import { EMPTY_FEN } from './RaceRound';

const FRESH: DuelProgress = { index: 0, solved: 0, strikes: 0, done: false };
/** After a solve the next puzzle comes at once; after a miss, a moment to see why. */
const NEXT_AFTER_SOLVE_MS = 350;
const NEXT_AFTER_MISS_MS = 900;

/** The strikes as three marks, the used ones filled. */
export function Strikes({ used, label }: { used: number; label: string }) {
  return (
    <span
      className="duel__strikes"
      role="img"
      aria-label={`${label}: ${used} of ${DUEL_RULES.race.strikes} strikes`}
    >
      {Array.from({ length: DUEL_RULES.race.strikes }, (_, i) => (
        <span key={i} className={i < used ? 'duel__strike duel__strike--used' : 'duel__strike'} />
      ))}
    </span>
  );
}

/** This player's race as this board counts it: ahead of the room while a report is on its way. */
export interface TimedMine {
  /** The puzzle on (the number done so far). */
  index: number;
  solved: number;
  strikes: number;
  /** Through: out of strikes or of puzzles. */
  finished: boolean;
  /** The board waits for this player's move. */
  solving: boolean;
}

/**
 * A timed race: the same puzzles for everyone, each at their own pace,
 * getting harder as they go — in a duel and in a race room alike. Every
 * puzzle's result goes to the room at once; three wrong answers end a
 * player's race, and three minutes end everyone's.
 */
export function TimedRace({
  items,
  phase,
  progress,
  orientation,
  onReport,
  overlay,
  children,
}: {
  items: readonly RacePuzzle[];
  /** The race's phase while it is on (a countdown, then live); null otherwise. */
  phase: 'countdown' | 'live' | 'reveal' | null;
  /** This player's progress, as the room counts it. */
  progress: DuelProgress | null;
  /** The board's side until the first puzzle shows. */
  orientation: Side;
  onReport: (report: { index: number; ok: boolean; ms: number }) => void;
  overlay: ReactNode;
  /** What shows under the board: the lanes, the line of status. */
  children: (mine: TimedMine) => ReactNode;
}) {
  const live = phase === 'live';
  const room = progress ?? FRESH;
  /** This board's own results, ahead of the room's count while a report is on its way. */
  const [results, setResults] = useState<boolean[]>([]);
  const index = Math.max(results.length, room.index);
  const strikes = Math.max(results.filter((ok) => !ok).length, room.strikes);
  const solved = Math.max(results.filter(Boolean).length, room.solved);
  const finished =
    room.done || strikes >= DUEL_RULES.race.strikes || (items.length > 0 && index >= items.length);

  const trainer = usePuzzleTrainer((event, puzzle) => {
    const at = items.findIndex((p) => p.id === puzzle.id);
    if (at < 0) return;
    const ok = event.outcome === 'solved';
    onReport({ index: at, ok, ms: event.durationMs });
    setResults((done) => (done.length === at ? [...done, ok] : done));
  });
  const { load } = trainer;
  const next = items[index] ?? null;
  const onBoard = trainer.puzzle?.id ?? null;
  const lastOk = results[results.length - 1] ?? true;

  // The next puzzle, a moment after the last one's result.
  useEffect(() => {
    if (!live || finished || !next || onBoard === next.id) return;
    const delay = onBoard === null ? 0 : lastOk ? NEXT_AFTER_SOLVE_MS : NEXT_AFTER_MISS_MS;
    const timer = window.setTimeout(() => load(trainerPuzzle(next)), delay);
    return () => window.clearTimeout(timer);
  }, [live, finished, next, onBoard, lastOk, load]);

  const shown = onBoard !== null && phase !== 'countdown';
  const solving = live && !finished && trainer.phase === 'solving';

  return (
    <>
      <div className="trainer__board">
        <Board
          fen={shown ? trainer.position.fen : EMPTY_FEN}
          orientation={shown ? trainer.solverColor : orientation}
          turnColor={trainer.position.turn}
          movableColor={solving ? trainer.solverColor : undefined}
          dests={solving ? trainer.position.dests : new Map()}
          lastMove={shown ? trainer.position.lastMove : null}
          check={shown && trainer.position.check}
          highlights={trainer.highlights}
          onMove={(from, to) => trainer.playUserMove(from, to)}
          ariaLabel={
            shown ? `Race puzzle ${index + 1}, ${trainer.solverColor} to move` : 'Puzzle race board'
          }
        />
        {trainer.needsPromotion && solving ? (
          <PromotionPicker color={trainer.solverColor} onSelect={trainer.resolvePromotion} />
        ) : null}
        {overlay}
      </div>
      {children({ index, solved, strikes, finished, solving })}
    </>
  );
}

/** Under the board in a duel: both players' lanes, and how this player's race stands. */
export function DuelLanes({
  mine,
  theirs,
  live,
  opponentName,
}: {
  mine: TimedMine;
  theirs: DuelProgress | null;
  live: boolean;
  opponentName: string;
}) {
  const them = theirs ?? FRESH;
  const lead = Math.max(1, mine.solved, them.solved);
  return (
    <div className="duel__race" data-testid="timed-race">
      <div className="duel__lane">
        <span className="duel__lane-who">You</span>
        <span className="duel__lane-bar" aria-hidden="true">
          <span style={{ width: `${(mine.solved / lead) * 100}%` }} />
        </span>
        <span className="duel__lane-count" data-testid="race-mine">
          {mine.solved}
        </span>
        <Strikes used={mine.strikes} label="Your strikes" />
      </div>
      <div className="duel__lane">
        <span className="duel__lane-who">{opponentName}</span>
        <span className="duel__lane-bar duel__lane-bar--them" aria-hidden="true">
          <span style={{ width: `${(them.solved / lead) * 100}%` }} />
        </span>
        <span className="duel__lane-count" data-testid="race-theirs">
          {them.solved}
        </span>
        <Strikes used={them.strikes} label={`${opponentName}’s strikes`} />
      </div>
      {live ? (
        <p className="small duel__status-mine" role="status">
          {mine.finished
            ? `You are through: ${mine.solved} solved.${them.done ? '' : ` ${opponentName} is still racing.`}`
            : mine.solving
              ? `Puzzle ${mine.index + 1}: your move.`
              : `Puzzle ${mine.index + 1}`}
        </p>
      ) : null}
    </div>
  );
}

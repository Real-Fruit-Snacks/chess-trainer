import { type ReactNode, useEffect } from 'react';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { usePuzzleTrainer } from '@/features/puzzles/usePuzzleTrainer';
import { DUEL_RULES } from '../../../../relay/src/live/shared.mjs';
import { trainerPuzzle } from '../duelRounds';
import { resultWords, seconds } from '../duelView';
import type { DuelView, RacePuzzle, Side } from '../types';

/** An empty board between the rounds: nothing to study before the round goes live. */
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

/**
 * A round of a puzzle race: the same puzzle on every board at the same
 * moment, in a duel and in a race room alike. The first move is the
 * opponent's (as in every puzzle); then each player finds the line. A wrong
 * move is out of the round; a clean solve reports its time, measured here.
 * When the round ends, the board plays the solution through.
 */
export function RaceRound({
  puzzle,
  phase,
  reported,
  orientation,
  onResult,
  overlay,
  status,
}: {
  /** The round's puzzle (null until the puzzles are in). */
  puzzle: RacePuzzle | null;
  /** The round's phase while the race is on; null otherwise. */
  phase: 'countdown' | 'live' | 'reveal' | null;
  /** This player's result is in: the board takes no more moves. */
  reported: boolean;
  /** The board's side until the puzzle shows. */
  orientation: Side;
  onResult: (result: { ok: boolean; ms: number }) => void;
  overlay: ReactNode;
  /** What shows under the board while the round is live. */
  status: (solving: boolean, solver: Side) => ReactNode;
}) {
  const live = phase === 'live';
  const trainer = usePuzzleTrainer((event) => {
    onResult({ ok: event.outcome === 'solved', ms: event.durationMs });
  });
  const { load, showSolution } = trainer;
  // Puzzles are never repeated within a race: the id says which round the board is on.
  const loaded = puzzle !== null && trainer.puzzle?.id === puzzle.id;

  // The puzzle comes out when the round goes live, on every board at once.
  useEffect(() => {
    if (live && puzzle && !loaded) load(trainerPuzzle(puzzle));
  }, [live, puzzle, loaded, load]);

  // Once the round is over, the line plays through for whoever did not finish it.
  const reveal = phase === 'reveal' && loaded;
  const unsolved = trainer.phase !== 'solved' && !trainer.solutionShown;
  useEffect(() => {
    if (reveal && unsolved) showSolution();
  }, [reveal, unsolved, showSolution]);

  const shown = loaded && phase !== 'countdown';
  const solving = live && loaded && trainer.phase === 'solving' && !reported;

  return (
    <>
      <div className="trainer__board" style={{ position: 'relative' }}>
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
            shown
              ? `Race puzzle, ${trainer.solverColor} to move`
              : 'Puzzle race board, waiting for the round'
          }
        />
        {trainer.needsPromotion && solving ? (
          <PromotionPicker color={trainer.solverColor} onSelect={trainer.resolvePromotion} />
        ) : null}
        {overlay}
      </div>
      {live ? status(solving, trainer.solverColor) : null}
    </>
  );
}

/** The line under the board in a duel: this player's round, and the opponent's. */
export function DuelRaceStatus({
  view,
  solving,
  solver,
  opponentName,
}: {
  view: DuelView;
  solving: boolean;
  /** The side the puzzle is solved for. */
  solver: Side;
  opponentName: string;
}) {
  const theirs = view.theirs && 'ok' in view.theirs ? view.theirs : null;
  const windowed = view.opts.format === 'window';
  let mine: string;
  if (view.mine && 'ok' in view.mine) {
    mine = view.mine.ok ? `${resultWords(view.mine)}.` : 'Missed: you are out of this round.';
  } else {
    mine = solving
      ? `${solver === 'white' ? 'White' : 'Black'} to play: find the best line.`
      : 'Here it comes…';
  }
  let them = `${opponentName} is solving.`;
  if (theirs) {
    const share =
      windowed && !view.mine
        ? ` Solve within ${DUEL_RULES.race.windowMs / 1000} s of that to share the round.`
        : '';
    them = theirs.ok
      ? `${opponentName} solved it in ${seconds(theirs.ms)}.${share}`
      : `${opponentName} missed it.`;
  }
  return (
    <div className="duel__status" data-testid="race-status">
      <p className="duel__status-mine" role="status">
        {mine}
      </p>
      <p className="small muted duel__status-theirs" aria-live="polite">
        {them}
      </p>
    </div>
  );
}

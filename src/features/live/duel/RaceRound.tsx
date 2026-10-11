import { type ReactNode, useEffect } from 'react';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { usePuzzleTrainer } from '@/features/puzzles/usePuzzleTrainer';
import { DUEL_RULES } from '../../../../relay/src/live/shared.mjs';
import { raceItems, trainerPuzzle } from '../duelRounds';
import { resultWords, seconds } from '../duelView';
import type { DuelSession, DuelView } from '../types';

/** An empty board between the rounds: nothing to study before the round goes live. */
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

/**
 * A round of a puzzle race: the same puzzle on both boards at the same moment.
 * The first move is the opponent's (as in every puzzle); then each player finds
 * the line. A wrong move is out of the round; a clean solve reports its time,
 * measured here. When the round ends, the board plays the solution through.
 */
export function RaceRound({
  view,
  session,
  overlay,
  opponentName,
}: {
  view: DuelView;
  session: DuelSession;
  overlay: ReactNode;
  opponentName: string;
}) {
  const puzzle = raceItems(view.items)[view.round] ?? null;
  const live = view.status === 'playing' && view.phase === 'live';
  const round = view.round;
  const trainer = usePuzzleTrainer((event) => {
    session.report({ round, ok: event.outcome === 'solved', ms: event.durationMs });
  });
  const { load, showSolution } = trainer;
  // Puzzles are never repeated within a race: the id says which round the board is on.
  const loaded = puzzle !== null && trainer.puzzle?.id === puzzle.id;

  // The puzzle comes out when the round goes live, on both boards at once.
  useEffect(() => {
    if (live && puzzle && !loaded) load(trainerPuzzle(puzzle));
  }, [live, puzzle, loaded, load]);

  // Once the round is over, the line plays through for whoever did not finish it.
  const reveal = view.phase === 'reveal' && loaded;
  const unsolved = trainer.phase !== 'solved' && !trainer.solutionShown;
  useEffect(() => {
    if (reveal && unsolved) showSolution();
  }, [reveal, unsolved, showSolution]);

  const shown = loaded && view.phase !== 'countdown';
  const solving = live && loaded && trainer.phase === 'solving' && !view.mine;

  return (
    <>
      <div className="trainer__board" style={{ position: 'relative' }}>
        <Board
          fen={shown ? trainer.position.fen : EMPTY_FEN}
          orientation={shown ? trainer.solverColor : view.you}
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
      {live ? (
        <RaceStatus
          view={view}
          solving={solving}
          solver={trainer.solverColor}
          opponentName={opponentName}
        />
      ) : null}
    </>
  );
}

function RaceStatus({
  view,
  solving,
  solver,
  opponentName,
}: {
  view: DuelView;
  solving: boolean;
  /** The side the puzzle is solved for. */
  solver: 'white' | 'black';
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

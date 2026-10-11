import { type ReactNode, useState } from 'react';
import { Board } from '@/components/board/Board';
import { Badge, Button } from '@/components/ui';
import { turnOf } from '@/chess/helpers';
import { describeGame } from '@/features/arcade/positions';
import {
  describeScale,
  judge,
  SCALE_MAX,
  SCALE_STEP,
  toScale,
} from '@/features/arcade/whoStandsBetter';
import { judgeRoundItems } from '../duelRounds';
import type { DuelSession, DuelView } from '../types';
import { EMPTY_FEN } from './RaceRound';

/**
 * A position of a Who Stands Better? duel: both players judge the same
 * position against the clock. A judgement is locked in for good, and the
 * other sees only that it is in; when the round ends, the engine's verdict
 * and both scores show.
 */
export function JudgeDuelRound({
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
  const item = judgeRoundItems(view.items)[view.round] ?? null;
  const live = view.status === 'playing' && view.phase === 'live';
  const reveal = view.phase === 'reveal';
  const [guess, setGuess] = useState(0);
  const mine = view.mine && 'guess' in view.mine ? view.mine.guess : null;
  const theirs = view.theirs && 'guess' in view.theirs ? view.theirs.guess : null;
  const theirsIn = view.theirs !== null;
  const visible = item !== null && (live || reveal);
  const toMove = item ? turnOf(item.fen) : 'white';

  const lockIn = () => {
    if (!live || mine !== null) return;
    session.report({ round: view.round, guess });
  };

  return (
    <>
      <div className="trainer__board" style={{ position: 'relative' }}>
        <Board
          fen={visible && item ? item.fen : EMPTY_FEN}
          orientation="white"
          viewOnly
          ariaLabel={
            visible ? `Position ${view.round + 1}, ${toMove} to move` : 'Waiting for the position'
          }
        />
        {overlay}
      </div>
      {visible && item ? (
        <div className="duel__judge" data-testid="judge-round">
          <div className="row row--between">
            <span className="small muted">
              {describeGame({ gameId: item.game })} · move {Math.ceil(item.ply / 2)}
            </span>
            <Badge tone={toMove === 'white' ? 'neutral' : 'info'}>
              <span className={`arcade__to-move arcade__to-move--${toMove}`} aria-hidden="true" />
              {toMove === 'white' ? 'White' : 'Black'} to move
            </Badge>
          </div>
          {reveal ? (
            <JudgeReveal cp={item.cp} mine={mine} theirs={theirs} opponentName={opponentName} />
          ) : (
            <>
              <label className="small" htmlFor="duel-judge-slider">
                Your judgement:{' '}
                <strong data-testid="judge-guess">{describeScale(mine ?? guess)}</strong>
              </label>
              <input
                id="duel-judge-slider"
                className="arcade__slider"
                type="range"
                min={-SCALE_MAX}
                max={SCALE_MAX}
                step={SCALE_STEP}
                value={mine ?? guess}
                aria-valuetext={describeScale(mine ?? guess)}
                onChange={(e) => setGuess(Number(e.target.value))}
                disabled={mine !== null || !live}
                data-testid="judge-slider"
              />
              <div className="arcade__slider-labels" aria-hidden="true">
                <span>Black winning</span>
                <span>Equal</span>
                <span>White winning</span>
              </div>
              <div className="row row--between duel__judge-actions">
                <Button
                  variant="primary"
                  onClick={lockIn}
                  disabled={mine !== null || !live}
                  data-testid="judge-lock"
                >
                  {mine !== null ? 'Locked in' : 'Lock in'}
                </Button>
                <span className="small muted" aria-live="polite">
                  {theirsIn ? `${opponentName} has locked in.` : `${opponentName} is judging.`}
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

function JudgeReveal({
  cp,
  mine,
  theirs,
  opponentName,
}: {
  cp: number;
  mine: number | null;
  theirs: number | null;
  opponentName: string;
}) {
  const line = (who: string, guess: number | null) => {
    if (guess === null) return `${who}: no judgement, 0 points.`;
    const verdict = judge(guess, cp);
    return `${who}: ${describeScale(guess)} — ${verdict.verdict}, ${verdict.points} points.`;
  };
  return (
    <div role="status" data-testid="judge-reveal">
      <p className="arcade__verdict">The engine says: {describeScale(toScale(cp))}</p>
      <p className="small duel__reveal-line">{line('You', mine)}</p>
      <p className="small duel__reveal-line">{line(opponentName, theirs)}</p>
    </div>
  );
}

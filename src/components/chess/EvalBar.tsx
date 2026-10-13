import { useRef } from 'react';
import type { LongColor } from '@/chess/types';
import { cpToWinProbability, formatScore, type Score, scoreToWhiteCp } from '@/engine/uci';
import './chess-components.css';

export interface EvalBarProps {
  /** Latest engine score, from the side to move's perspective; null while there is none. */
  score: Score | null;
  /** Whose move it is in the evaluated position. */
  turn: LongColor;
  orientation?: LongColor;
  /** Show "1-0", "0-1" or "½-½" for finished games. */
  result?: '1-0' | '0-1' | '1/2-1/2' | null;
}

/**
 * Vertical evaluation bar: White's share of the bar equals White's win
 * probability. Between searches the last known score stays up, marked stale,
 * so the bar does not swing to the middle after every move; with no score at
 * all it is unlabelled and reads "No evaluation".
 */
export function EvalBar({ score, turn, orientation = 'white', result }: EvalBarProps) {
  const lastKnown = useRef<{ score: Score; turn: LongColor } | null>(null);
  if (score) lastKnown.current = { score, turn };
  const shown = score ? { score, turn } : lastKnown.current;
  const stale = !score && !result && shown !== null;

  let whiteShare = 0.5;
  let label: string | null = null;

  if (result) {
    whiteShare = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
    label = result === '1/2-1/2' ? '½' : result;
  } else if (shown) {
    const whiteCp = scoreToWhiteCp(shown.score, shown.turn === 'white');
    whiteShare = shown.score.type === 'mate' ? (whiteCp > 0 ? 1 : 0) : cpToWinProbability(whiteCp);
    label = formatScore(shown.score, shown.turn === 'white');
  }

  const whitePct = Math.round(whiteShare * 1000) / 10;
  const whiteOnTop = orientation === 'black';
  const labelInWhite = whiteShare >= 0.5;
  // The label sits in whichever colour currently owns more of the bar.
  const labelAtTop = labelInWhite === whiteOnTop;
  const valueText =
    label === null
      ? 'No evaluation'
      : `${label}${stale ? ' (last evaluation)' : ''}, White ${whitePct}%`;

  return (
    <div
      className={['evalbar', whiteOnTop && 'evalbar--flipped', stale && 'evalbar--stale']
        .filter(Boolean)
        .join(' ')}
      role="meter"
      aria-label="Engine evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={whitePct}
      aria-valuetext={valueText}
    >
      <div className="evalbar__white" style={{ height: `${whitePct}%` }} />
      {label !== null ? (
        <span
          className={[
            'evalbar__label',
            labelAtTop ? 'evalbar__label--top' : 'evalbar__label--bottom',
            labelInWhite ? 'evalbar__label--on-white' : 'evalbar__label--on-black',
          ].join(' ')}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

import type { LongColor } from '@/chess/types';
import { cpToWinProbability, formatScore, type Score, scoreToWhiteCp } from '@/engine/uci';
import './chess-components.css';

export interface EvalBarProps {
  /** Latest engine score, from the side to move's perspective. */
  score: Score | null;
  /** Whose move it is in the evaluated position. */
  turn: LongColor;
  orientation?: LongColor;
  /** Show "1-0", "0-1" or "½-½" for finished games. */
  result?: '1-0' | '0-1' | '1/2-1/2' | null;
}

/** Vertical evaluation bar: White's share of the bar equals White's win probability. */
export function EvalBar({ score, turn, orientation = 'white', result }: EvalBarProps) {
  let whiteShare = 0.5;
  let label = '0.0';

  if (result) {
    whiteShare = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
    label = result === '1/2-1/2' ? '½' : result;
  } else if (score) {
    const whiteCp = scoreToWhiteCp(score, turn === 'white');
    whiteShare = score.type === 'mate' ? (whiteCp > 0 ? 1 : 0) : cpToWinProbability(whiteCp);
    label = formatScore(score, turn === 'white');
  }

  const whitePct = Math.round(whiteShare * 1000) / 10;
  const whiteOnTop = orientation === 'black';
  const labelInWhite = whiteShare >= 0.5;
  // The label sits in whichever colour currently owns more of the bar.
  const labelAtTop = labelInWhite === whiteOnTop;

  return (
    <div
      className={['evalbar', whiteOnTop && 'evalbar--flipped'].filter(Boolean).join(' ')}
      role="meter"
      aria-label="Engine evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={whitePct}
      aria-valuetext={`${label}, White ${whitePct}%`}
    >
      <div className="evalbar__white" style={{ height: `${whitePct}%` }} />
      <span
        className={[
          'evalbar__label',
          labelAtTop ? 'evalbar__label--top' : 'evalbar__label--bottom',
          labelInWhite ? 'evalbar__label--on-white' : 'evalbar__label--on-black',
        ].join(' ')}
      >
        {label}
      </span>
    </div>
  );
}

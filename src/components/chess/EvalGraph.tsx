import { useId, useMemo } from 'react';
import type { MoveJudgement } from './MoveList';
import './chess-components.css';

const WIDTH = 640;
const HEIGHT = 140;
const PAD = { top: 8, right: 8, bottom: 8, left: 8 };

export interface EvalGraphProps {
  /** White's win probability after each ply, index 0 = start position. */
  wins: number[];
  /** Judgement of the move that led to ply i (index i-1), for markers. */
  judgements?: (MoveJudgement | undefined)[];
  /** Ply currently shown on the board (0 = start). */
  currentPly: number;
  onSelect: (ply: number) => void;
  /** Move number of the first move, for the tooltip labels. */
  startMoveNumber?: number;
  startsWithBlack?: boolean;
}

/**
 * The classic "evaluation graph" of a game review: White's winning chances
 * over time, with markers on inaccuracies, mistakes and blunders. Click or
 * use the arrow keys to jump to a ply.
 */
export function EvalGraph({
  wins,
  judgements,
  currentPly,
  onSelect,
  startMoveNumber = 1,
  startsWithBlack = false,
}: EvalGraphProps) {
  const titleId = useId();
  const model = useMemo(() => {
    const n = wins.length;
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (ply: number) => PAD.left + (n <= 1 ? innerW / 2 : (ply / (n - 1)) * innerW);
    const y = (win: number) => PAD.top + innerH - win * innerH;
    const line = wins
      .map((w, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(w).toFixed(1)}`)
      .join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;
    const markers = (judgements ?? [])
      .map((j, i) => ({ ply: i + 1, judgement: j }))
      .filter(
        (m) =>
          m.judgement === 'blunder' || m.judgement === 'mistake' || m.judgement === 'inaccuracy',
      )
      .map((m) => ({ ...m, cx: x(m.ply), cy: y(wins[m.ply] ?? 0.5) }));
    return { x, y, line, area, markers, innerH, mid: y(0.5) };
  }, [wins, judgements]);

  if (wins.length < 2) return null;

  const labelFor = (ply: number): string => {
    if (ply === 0) return 'Start';
    const index = ply - 1 + (startsWithBlack ? 1 : 0);
    const number = startMoveNumber + Math.floor(index / 2);
    return `${number}${index % 2 === 0 ? '.' : '…'}`;
  };
  const pick = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * WIDTH;
    const ply = Math.round(((px - PAD.left) / (WIDTH - PAD.left - PAD.right)) * (wins.length - 1));
    onSelect(Math.max(0, Math.min(wins.length - 1, ply)));
  };

  const current = Math.max(0, Math.min(wins.length - 1, currentPly));
  const chance = Math.round((wins[current] ?? 0.5) * 100);
  const judgement = current > 0 ? judgements?.[current - 1] : undefined;
  const valueText = `${current === 0 ? 'Start position' : `After ${labelFor(current)}`}, White ${chance}%${judgement ? `, ${judgement}` : ''}`;

  return (
    <svg
      className="evalgraph"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="slider"
      aria-labelledby={titleId}
      aria-valuemin={0}
      aria-valuemax={wins.length - 1}
      aria-valuenow={current}
      aria-valuetext={valueText}
      aria-orientation="horizontal"
      tabIndex={0}
      onClick={(e) => pick(e.clientX, e.currentTarget)}
      onKeyDown={(e) => {
        // Handled keys stop here: the page's own arrow-key handler must not step a second ply.
        let next: number | null = null;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, current - 1);
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          next = Math.min(wins.length - 1, current + 1);
        } else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = wins.length - 1;
        if (next === null) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(next);
      }}
    >
      <title id={titleId}>
        Evaluation graph: White&apos;s winning chances move by move. Click a point or use the arrow
        keys to jump to it.
      </title>
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} className="evalgraph__bg" />
      <path d={model.area} className="evalgraph__area" />
      <path d={model.line} className="evalgraph__line" />
      <line x1={0} x2={WIDTH} y1={model.mid} y2={model.mid} className="evalgraph__mid" />
      {model.markers.map((m) => (
        <circle
          key={m.ply}
          cx={m.cx}
          cy={m.cy}
          r={5}
          className={`evalgraph__marker evalgraph__marker--${m.judgement}`}
        >
          <title>{`${labelFor(m.ply)} ${m.judgement}`}</title>
        </circle>
      ))}
      <line
        x1={model.x(currentPly)}
        x2={model.x(currentPly)}
        y1={PAD.top}
        y2={HEIGHT - PAD.bottom}
        className="evalgraph__cursor"
      />
    </svg>
  );
}

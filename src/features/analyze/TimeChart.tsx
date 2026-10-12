import {
  type MouseEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Notated, San } from '@/chess/San';
import type { Fen, LongColor } from '@/chess/types';
import type { ReviewSummary } from './gameReview';
import {
  describeTimes,
  durationWords,
  formatClockReading,
  formatSpent,
  type GameTimes,
  readTimeUse,
  type TimeBar,
  type TimeColumn,
  timeColumns,
  timeScaleMax,
} from './timeUse';
import './time-chart.css';

/** The plot's height in pixels: White's half above the line, Black's below. */
const HEIGHT = 132;
const MID = HEIGHT / 2;
/** Room between the tallest bar and the plot's edge. */
const HEADROOM = 6;
const REACH = MID - HEADROOM;
/** Width before the first measurement (and where nothing can be measured, as in tests). */
const FALLBACK_WIDTH = 560;

const JUDGED: Record<string, string> = {
  inaccuracy: 'an inaccuracy',
  mistake: 'a mistake',
  blunder: 'a blunder',
};
/** The marker on a judged move: big enough to see where a quick move left no bar to speak of. */
const MARKER_R = 4.5;

/** The element's width in pixels, followed as it changes. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** A bar growing from the middle line, rounded at its far end only. */
function barPath(x: number, width: number, height: number, up: boolean): string {
  const r = Math.min(3, width / 2, height);
  const top = up ? MID - height : MID + height;
  if (up) {
    return `M${x} ${MID}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + width - r}Q${x + width} ${top} ${x + width} ${top + r}V${MID}Z`;
  }
  return `M${x} ${MID}V${top - r}Q${x} ${top} ${x + r} ${top}H${x + width - r}Q${x + width} ${top} ${x + width} ${top - r}V${MID}Z`;
}

/** "14. Nf3: 12 s, 9:41 left" for the readout and the table. */
function BarFacts({ bar }: { bar: TimeBar }) {
  return (
    <>
      {bar.spent !== null ? formatSpent(bar.spent) : 'time unknown'}
      {bar.after !== null ? `, ${formatClockReading(bar.after)} left` : ''}
      {bar.judgement && JUDGED[bar.judgement] ? `, ${JUDGED[bar.judgement]}` : ''}
    </>
  );
}

/**
 * How the clock was used in a reviewed game: the time each move took, White's
 * above the line and Black's below, with the review's inaccuracies, mistakes
 * and blunders in their colours and the stretches played short of time
 * shaded; a few sentences reading it; the same figures as a table. Clicking a
 * move (or its button in the table) goes there on the board.
 */
export function TimeChart({
  times,
  review,
  currentPly,
  onSelect,
  startFen,
  learner,
}: {
  times: GameTimes;
  review: ReviewSummary | null;
  /** The main-line ply on the board (0: the start). */
  currentPly: number;
  onSelect: (ply: number) => void;
  startFen: Fen;
  /** The learner's side when known: the reading speaks to them. */
  learner: LongColor | null;
}) {
  const headingId = useId();
  const titleId = useId();
  const descId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const width = useWidth(plotRef);
  const [hover, setHover] = useState<number | null>(null);

  const columns = useMemo(() => timeColumns(times, review, startFen), [times, review, startFen]);
  const reading = useMemo(
    () => readTimeUse(times, review, { learner, startFen }),
    [times, review, learner, startFen],
  );
  const scale = useMemo(
    () => timeScaleMax(Math.max(0, ...times.moves.map((m) => m.spent ?? 0))),
    [times],
  );
  const present = useMemo(() => {
    const bars = columns.flatMap((c) => [c.white, c.black]);
    return {
      inaccuracy: bars.some((b) => b?.judgement === 'inaccuracy'),
      mistake: bars.some((b) => b?.judgement === 'mistake'),
      blunder: bars.some((b) => b?.judgement === 'blunder'),
      trouble: bars.some((b) => b?.trouble),
    };
  }, [columns]);

  const slot = width / Math.max(1, columns.length);
  const barWidth = Math.max(1, Math.min(12, slot - 2));
  const heightOf = (spent: number | null) =>
    spent === null ? 0 : spent > 0 ? Math.max(1.5, (Math.min(spent, scale) / scale) * REACH) : 0;
  const currentIndex = columns.findIndex(
    (c) => c.white?.ply === currentPly || c.black?.ply === currentPly,
  );
  const shown = hover ?? (currentIndex >= 0 ? currentIndex : null);
  const shownColumn: TimeColumn | undefined = shown === null ? undefined : columns[shown];

  const columnAt = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const index = Math.floor(((event.clientX - rect.left) / rect.width) * columns.length);
    return Math.max(0, Math.min(columns.length - 1, index));
  };
  const select = (event: MouseEvent<SVGSVGElement>) => {
    const column = columns[columnAt(event)];
    if (!column) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const upper = event.clientY - rect.top < rect.height / 2;
    const bar = (upper ? column.white : column.black) ?? column.white ?? column.black;
    if (bar) onSelect(bar.ply);
  };

  return (
    <section className="timechart" aria-labelledby={headingId} data-testid="time-chart">
      <h3 className="timechart__heading" id={headingId}>
        Time per move
      </h3>
      {reading.length > 0 ? (
        <ul role="list" className="timechart__reading" data-testid="time-reading">
          {reading.map((line) => (
            <li key={line}>
              <Notated text={line} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="timechart__frame">
        <div className="timechart__axis" aria-hidden="true">
          <span>White</span>
          <span>{formatSpent(scale)}</span>
        </div>
        <div className="timechart__plot" ref={plotRef}>
          <svg
            className="timechart__svg"
            width="100%"
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-labelledby={`${titleId} ${descId}`}
            onPointerMove={(e) => setHover(columnAt(e))}
            onPointerLeave={() => setHover(null)}
            onClick={select}
          >
            <title id={titleId}>
              Time spent on each move: White above the line, Black below, up to {formatSpent(scale)}
              .
            </title>
            <desc id={descId}>{describeTimes(times, startFen)}</desc>
            {hover !== null && hover !== currentIndex ? (
              <rect
                className="timechart__hover"
                x={hover * slot}
                y={0}
                width={slot}
                height={HEIGHT}
              />
            ) : null}
            {columns.flatMap((column, index) =>
              (['white', 'black'] as const).map((side) =>
                column[side]?.trouble ? (
                  <rect
                    key={`trouble-${column.moveNumber}-${side}`}
                    className="timechart__trouble"
                    x={index * slot}
                    y={side === 'white' ? MID - REACH : MID}
                    width={slot}
                    height={REACH}
                  />
                ) : null,
              ),
            )}
            {currentIndex >= 0 ? (
              <line
                className="timechart__cursor"
                x1={(currentIndex + 0.5) * slot}
                x2={(currentIndex + 0.5) * slot}
                y1={0}
                y2={HEIGHT}
              />
            ) : null}
            <line className="timechart__grid" x1={0} x2={width} y1={MID - REACH} y2={MID - REACH} />
            <line className="timechart__grid" x1={0} x2={width} y1={MID + REACH} y2={MID + REACH} />
            {columns.map((column, index) => {
              const x = index * slot + (slot - barWidth) / 2;
              return (['white', 'black'] as const).map((side) => {
                const bar = column[side];
                const height = heightOf(bar?.spent ?? null);
                if (!bar || height === 0) return null;
                const judged = bar.judgement && JUDGED[bar.judgement] ? bar.judgement : null;
                return (
                  <path
                    key={`${column.moveNumber}-${side}`}
                    className={
                      judged ? `timechart__bar timechart__bar--${judged}` : 'timechart__bar'
                    }
                    d={barPath(x, barWidth, height, side === 'white')}
                  />
                );
              });
            })}
            <line className="timechart__baseline" x1={0} x2={width} y1={MID} y2={MID} />
            {columns.map((column, index) =>
              (['white', 'black'] as const).map((side) => {
                const bar = column[side];
                const judged = bar?.judgement && JUDGED[bar.judgement] ? bar.judgement : null;
                if (!bar || !judged) return null;
                // On the end of the bar, so a mistake played in a second still shows.
                const reach = Math.min(heightOf(bar.spent), REACH - MARKER_R);
                return (
                  <circle
                    key={`mark-${column.moveNumber}-${side}`}
                    className={`timechart__marker timechart__marker--${judged}`}
                    cx={(index + 0.5) * slot}
                    cy={side === 'white' ? MID - reach : MID + reach}
                    r={MARKER_R}
                  />
                );
              }),
            )}
          </svg>
        </div>
        <div className="timechart__axis" aria-hidden="true">
          <span>Black</span>
          <span>{formatSpent(scale)}</span>
        </div>
      </div>
      <p className="timechart__readout small" aria-hidden="true">
        {shownColumn ? (
          (['white', 'black'] as const).map((side) => {
            const bar = shownColumn[side];
            if (!bar) return null;
            return (
              <span key={side} className="timechart__readout-move">
                <strong>
                  {shownColumn.moveNumber}
                  {side === 'white' ? '.' : '…'} <San san={bar.san} />
                </strong>{' '}
                <BarFacts bar={bar} />
              </span>
            );
          })
        ) : (
          <span className="muted">Point at a move to see its time; click it to go there.</span>
        )}
      </p>
      {present.inaccuracy || present.mistake || present.blunder || present.trouble ? (
        <ul role="list" className="timechart__legend small" aria-label="Key">
          {(['inaccuracy', 'mistake', 'blunder'] as const)
            .filter((kind) => present[kind])
            .map((kind) => (
              <li key={kind}>
                <span
                  className={`timechart__swatch timechart__swatch--${kind}`}
                  aria-hidden="true"
                />
                {kind.charAt(0).toUpperCase() + kind.slice(1)}
              </li>
            ))}
          {present.trouble ? (
            <li>
              <span className="timechart__swatch timechart__swatch--trouble" aria-hidden="true" />
              Under {durationWords(times.trouble)} left
            </li>
          ) : null}
        </ul>
      ) : null}
      <details className="timechart__details">
        <summary>The times move by move</summary>
        <table className="timechart__table">
          <caption className="sr-only">Time spent on each move and the clock after it</caption>
          <thead>
            <tr>
              <th scope="col">Move</th>
              <th scope="col">White</th>
              <th scope="col">Black</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.moveNumber}>
                <th scope="row">{column.moveNumber}</th>
                {(['white', 'black'] as const).map((side) => {
                  const bar = column[side];
                  return (
                    <td key={side}>
                      {bar ? (
                        <>
                          <button
                            type="button"
                            className="timechart__move"
                            onClick={() => onSelect(bar.ply)}
                            aria-current={bar.ply === currentPly ? 'true' : undefined}
                          >
                            <San san={bar.san} />
                          </button>{' '}
                          <span className="timechart__facts">
                            <span>
                              {bar.spent !== null ? formatSpent(bar.spent) : 'time unknown'}
                            </span>
                            {bar.after !== null ? (
                              <span>
                                <span className="sr-only">, </span>
                                {formatClockReading(bar.after)} left
                              </span>
                            ) : null}
                            {bar.judgement && JUDGED[bar.judgement] ? (
                              <span className="timechart__verdict">
                                <span className="sr-only">, </span>
                                {bar.judgement}
                              </span>
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

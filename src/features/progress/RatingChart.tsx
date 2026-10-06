import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatDate } from '@/lib/dates';
import type { RatingPoint } from '@/store/progress';
import './progress.css';

/** The drawing's width before the chart has been measured (and where it cannot be). */
const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 240;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

/**
 * The chart's width on screen, in CSS pixels. The drawing is made at that width, one unit
 * to the pixel, so the axis labels keep their size on a phone instead of shrinking with a
 * drawing scaled down to fit.
 */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const measured = Math.round(element.getBoundingClientRect().width);
      if (measured > 0) setWidth(Math.max(MIN_WIDTH, measured));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Single-series line chart of puzzle rating over time. Inline SVG, hover
 * crosshair with a tooltip, recessive grid; the list of attempts below the
 * chart on the Progress page doubles as its table view.
 */
export function RatingChart({ points, locale }: { points: RatingPoint[]; locale: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const figureRef = useRef<HTMLElement>(null);
  const width = useWidth(figureRef);

  const model = useMemo(() => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p.at);
    const ys = points.map((p) => p.rating);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const rawMin = Math.min(...ys);
    const rawMax = Math.max(...ys);
    const pad = Math.max(25, Math.round((rawMax - rawMin) * 0.15));
    const minY = Math.floor((rawMin - pad) / 50) * 50;
    const maxY = Math.ceil((rawMax + pad) / 50) * 50;
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (t: number) =>
      PAD.left + (maxX === minX ? innerW / 2 : ((t - minX) / (maxX - minX)) * innerW);
    const y = (r: number) => PAD.top + innerH - ((r - minY) / (maxY - minY)) * innerH;
    const coords = points.map((p) => ({ x: x(p.at), y: y(p.rating), point: p }));
    const path = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    const area = `${path} L${coords[coords.length - 1]?.x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L${coords[0]?.x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;
    const step = (maxY - minY) / 4;
    const gridlines = Array.from({ length: 5 }, (_, i) => Math.round(minY + i * step));
    return { coords, path, area, minY, maxY, gridlines, y, innerW, innerH };
  }, [points, width]);

  if (!model) {
    return (
      <p className="small muted" ref={figureRef as React.RefObject<HTMLParagraphElement>}>
        Solve a few rated puzzles and your rating history will appear here.
      </p>
    );
  }

  const onMove = (event: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = 'touches' in event ? (event.touches[0]?.clientX ?? 0) : event.clientX;
    const px = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    model.coords.forEach((c, i) => {
      const d = Math.abs(c.x - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  };

  const active = hover !== null ? model.coords[hover] : null;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure className="ratingchart" ref={figureRef}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Puzzle rating over time, from ${first?.rating ?? ''} to ${last?.rating ?? ''}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {model.gridlines.map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={model.y(g)}
              y2={model.y(g)}
              className="ratingchart__grid"
            />
            <text
              x={PAD.left - 8}
              y={model.y(g) + 4}
              textAnchor="end"
              className="ratingchart__tick"
            >
              {g}
            </text>
          </g>
        ))}
        <path d={model.area} fill={`url(#${gradientId})`} />
        <path d={model.path} className="ratingchart__line" />
        {active ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              className="ratingchart__crosshair"
            />
            <circle cx={active.x} cy={active.y} r={5} className="ratingchart__marker" />
          </g>
        ) : (
          <circle
            cx={model.coords[model.coords.length - 1]?.x}
            cy={model.coords[model.coords.length - 1]?.y}
            r={4}
            className="ratingchart__marker"
          />
        )}
        <text x={PAD.left} y={HEIGHT - 8} className="ratingchart__tick">
          {first ? formatDate(first.at, locale) : ''}
        </text>
        <text x={width - PAD.right} y={HEIGHT - 8} textAnchor="end" className="ratingchart__tick">
          {last ? formatDate(last.at, locale) : ''}
        </text>
      </svg>
      <figcaption className="ratingchart__tooltip" aria-live="polite">
        {active ? (
          <>
            <strong>{active.point.rating}</strong> · {formatDate(active.point.at, locale)}
          </>
        ) : (
          <span className="muted">
            {points.length} rated puzzles · now <strong>{last?.rating}</strong>
          </span>
        )}
      </figcaption>
    </figure>
  );
}

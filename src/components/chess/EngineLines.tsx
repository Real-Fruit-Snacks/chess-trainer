import { useEffect, useMemo, useRef, useState } from 'react';
import { uciLineToSan } from '@/chess/helpers';
import type { Fen, LongColor, Uci } from '@/chess/types';
import { formatScore, type SearchInfo } from '@/engine/uci';
import { Spinner } from '@/components/ui';
import './chess-components.css';
import { San } from '@/chess/San';

export interface EngineLinesProps {
  fen: Fen;
  turn: LongColor;
  lines: Map<number, SearchInfo>;
  /** Number of lines to display (MultiPV). */
  count: number;
  thinking: boolean;
  /** Click a move in a line to play it on the board. */
  onPlayMove?: (uci: Uci) => void;
  /** Move number and side for the first move of each line, e.g. "12." / "12..." */
  moveLabel: string;
}

/**
 * The engine's principal variations. The list itself is not a live region (it
 * changes many times a second); instead the top line is announced once, when
 * a search finishes.
 */
export function EngineLines({
  fen,
  turn,
  lines,
  count,
  thinking,
  onPlayMove,
  moveLabel,
}: EngineLinesProps) {
  const rendered = useMemo(() => {
    const out: { multipv: number; info: SearchInfo; sans: string[] }[] = [];
    for (let i = 1; i <= count; i++) {
      const info = lines.get(i);
      if (!info) continue;
      out.push({ multipv: i, info, sans: uciLineToSan(fen, info.pv.slice(0, 12)) });
    }
    return out;
  }, [fen, lines, count]);

  // Announce the best line when thinking stops (true → false), not on every update.
  const wasThinking = useRef(thinking);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const finished = wasThinking.current && !thinking;
    wasThinking.current = thinking;
    if (!finished) return;
    const top = rendered[0];
    if (!top) return;
    const score = formatScore(top.info.score, turn === 'white');
    setAnnouncement(`Engine: ${score}, ${moveLabel} ${top.sans.slice(0, 6).join(' ')}`);
  }, [thinking, rendered, turn, moveLabel]);

  const live = (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  );

  if (rendered.length === 0) {
    return (
      <div className="lines">
        <div className="line">
          {thinking ? (
            <Spinner label="Thinking…" />
          ) : (
            <span className="muted small">No analysis yet.</span>
          )}
        </div>
        {live}
      </div>
    );
  }

  return (
    <div className="lines" aria-busy={thinking}>
      {live}
      {rendered.map(({ multipv, info, sans }) => {
        const label = formatScore(info.score, turn === 'white');
        const whiteAhead = !label.startsWith('-') && label !== '0.0' && label !== '0-1';
        return (
          <div key={multipv} className="line">
            <span
              className={[
                'line__score',
                whiteAhead ? 'line__score--white' : 'line__score--black',
              ].join(' ')}
            >
              {label}
            </span>
            <span className="line__pv" title={sans.join(' ')}>
              <span className="faint">{moveLabel} </span>
              {sans.map((san, i) => (
                <button
                  key={`${multipv}-${i}`}
                  type="button"
                  onClick={i === 0 && onPlayMove ? () => onPlayMove(info.pv[0] as Uci) : undefined}
                  disabled={i !== 0 || !onPlayMove}
                  style={i !== 0 ? { cursor: 'default' } : undefined}
                  aria-label={i === 0 && onPlayMove ? `Play ${san}` : undefined}
                >
                  <San san={san} />
                </button>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function EngineStatus({
  name,
  depth,
  nps,
  thinking,
  loading = false,
}: {
  name: string;
  depth?: number;
  nps?: number;
  thinking: boolean;
  /** The engine is still being downloaded or started. */
  loading?: boolean;
}) {
  const knps = nps ? `${Math.round(nps / 1000)} kN/s` : '';
  return (
    <div className="engine-status">
      <span>{name}</span>
      <span>
        {loading
          ? 'loading engine…'
          : // The parts there are, joined: "depth 18 · 950 kN/s · idle", or just "idle".
            [depth ? `depth ${depth}` : '', knps, thinking ? 'thinking' : 'idle']
              .filter(Boolean)
              .join(' · ')}
      </span>
    </div>
  );
}

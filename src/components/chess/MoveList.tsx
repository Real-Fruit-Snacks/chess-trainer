import type { Move } from 'chess.js';
import { useEffect, useRef } from 'react';
import './chess-components.css';
import { scrollIntoContainer } from '@/lib/scroll';

export type MoveJudgement = 'blunder' | 'mistake' | 'inaccuracy' | 'best' | 'good' | null;

const GLYPH: Record<NonNullable<MoveJudgement>, string> = {
  blunder: '??',
  mistake: '?',
  inaccuracy: '?!',
  best: '',
  good: '',
};

export interface MoveListProps {
  moves: Move[];
  /** Index of the currently displayed ply (0 = starting position, moves.length = latest). */
  currentPly: number;
  onSelectPly: (ply: number) => void;
  /** Optional annotations aligned with `moves`. */
  judgements?: (MoveJudgement | undefined)[];
  /** Move number of the first move (from the start FEN). */
  startMoveNumber?: number;
  /** Whether the first move in the list is Black's. */
  startsWithBlack?: boolean;
}

export function MoveList({
  moves,
  currentPly,
  onSelectPly,
  judgements,
  startMoveNumber = 1,
  startsWithBlack = false,
}: MoveListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (list && el) scrollIntoContainer(list, el);
  }, [currentPly]);

  const rows: {
    number: number;
    white?: { move: Move; ply: number };
    black?: { move: Move; ply: number };
  }[] = [];
  moves.forEach((move, i) => {
    const ply = i + 1;
    const isBlack = (i + (startsWithBlack ? 1 : 0)) % 2 === 1;
    const number = startMoveNumber + Math.floor((i + (startsWithBlack ? 1 : 0)) / 2);
    let row = rows[rows.length - 1];
    if (row?.number !== number) {
      row = { number };
      rows.push(row);
    }
    if (isBlack) row.black = { move, ply };
    else row.white = { move, ply };
  });

  const renderMove = (entry: { move: Move; ply: number } | undefined) => {
    if (!entry) return <span />;
    const judgement = judgements?.[entry.ply - 1] ?? null;
    return (
      <button
        type="button"
        className={[
          'movelist__move',
          judgement &&
            judgement !== 'best' &&
            judgement !== 'good' &&
            `movelist__move--${judgement}`,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-current={entry.ply === currentPly ? 'true' : undefined}
        onClick={() => onSelectPly(entry.ply)}
      >
        {entry.move.san}
        {judgement && GLYPH[judgement] ? (
          <span className="movelist__glyph">{GLYPH[judgement]}</span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="movelist" ref={listRef} role="group" aria-label="Move list">
      {rows.length === 0 ? <div className="movelist__empty">No moves yet.</div> : null}
      {rows.map((row) => (
        <div key={row.number} style={{ display: 'contents' }}>
          <span className="movelist__number">{row.number}.</span>
          {renderMove(row.white)}
          {renderMove(row.black)}
        </div>
      ))}
    </div>
  );
}

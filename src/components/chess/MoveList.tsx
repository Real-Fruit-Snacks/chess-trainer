import type { Move } from 'chess.js';
import { memo, useEffect, useRef } from 'react';
import './chess-components.css';
import { scrollIntoContainer } from '@/lib/scroll';
import { San } from '@/chess/San';

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
  /** Jump to a ply. Omit for a read-only list: the moves are then plain text, not buttons. */
  onSelectPly?: (ply: number) => void;
  /** Optional annotations aligned with `moves`. */
  judgements?: (MoveJudgement | undefined)[];
  /** Move number of the first move (from the start FEN). */
  startMoveNumber?: number;
  /** Whether the first move in the list is Black's. */
  startsWithBlack?: boolean;
}

/**
 * A two-column move list. With `onSelectPly` every move is a button that jumps
 * to it; without it (a game in progress) the moves are plain text and the list
 * itself takes focus so it can be scrolled from the keyboard. Memoised: a
 * clock ticking in the parent must not redraw it ten times a second.
 */
export const MoveList = memo(function MoveList({
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
    const className = [
      'movelist__move',
      judgement && judgement !== 'best' && judgement !== 'good' && `movelist__move--${judgement}`,
    ]
      .filter(Boolean)
      .join(' ');
    const content = (
      <>
        <San san={entry.move.san} />
        {judgement && GLYPH[judgement] ? (
          <span className="movelist__glyph">{GLYPH[judgement]}</span>
        ) : null}
      </>
    );
    const current = entry.ply === currentPly ? ('true' as const) : undefined;
    if (!onSelectPly) {
      return (
        <span className={className} aria-current={current}>
          {content}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={className}
        aria-current={current}
        onClick={() => onSelectPly(entry.ply)}
      >
        {content}
      </button>
    );
  };

  return (
    <div
      className="movelist"
      ref={listRef}
      role={onSelectPly ? 'group' : 'region'}
      aria-label="Move list"
      tabIndex={onSelectPly ? undefined : 0}
    >
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
});

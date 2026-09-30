import type { Square } from 'chess.js';
import { type CSSProperties, memo } from 'react';
import type { LongColor } from '@/chess/types';
import { useSettings } from '@/store/settings';
import { BOARD_PALETTES } from './boardThemes';
import './click-board.css';

export type PieceRole = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface ClickBoardPiece {
  color: LongColor;
  role: PieceRole;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export interface ClickBoardProps {
  pieces?: ReadonlyMap<Square, ClickBoardPiece>;
  orientation?: LongColor;
  coordinates?: boolean;
  /** Extra class per square, e.g. 'selected', 'correct', 'wrong', 'target'. */
  marks?: ReadonlyMap<Square, string>;
  onSquare?: (square: Square) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** Accessible label per square; defaults to the square name and its piece. */
  squareLabel?: (square: Square, piece: ClickBoardPiece | undefined) => string;
}

/**
 * A plain 8×8 grid of buttons — no drag and drop, no rules. Used where the
 * interaction is "click a square": the board editor and the vision drills.
 * Pieces reuse the chessground piece sprites via the `cg-wrap` class.
 */
export const ClickBoard = memo(function ClickBoard({
  pieces,
  orientation = 'white',
  coordinates = true,
  marks,
  onSquare,
  disabled = false,
  ariaLabel,
  squareLabel,
}: ClickBoardProps) {
  const theme = useSettings((s) => s.boardTheme);
  const palette = BOARD_PALETTES[theme];
  const ranks = orientation === 'white' ? [...RANKS].reverse() : [...RANKS];
  const files = orientation === 'white' ? [...FILES] : [...FILES].reverse();

  return (
    <div
      className={`clickboard cg-wrap${coordinates ? ' clickboard--coords' : ''}`}
      role="grid"
      aria-label={ariaLabel}
      style={{ '--light': palette.light, '--dark': palette.dark } as CSSProperties}
    >
      {ranks.map((rank) => (
        <div className="clickboard__row" role="row" key={rank}>
          {files.map((file) => {
            const square = `${file}${rank}` as Square;
            const piece = pieces?.get(square);
            const dark = (FILES.indexOf(file) + Number(rank)) % 2 === 0;
            const mark = marks?.get(square);
            const label =
              squareLabel?.(square, piece) ??
              `${square}${piece ? `, ${piece.color} ${piece.role}` : ', empty'}`;
            return (
              <button
                type="button"
                key={square}
                role="gridcell"
                className={[
                  'clickboard__square',
                  dark ? 'clickboard__square--dark' : 'clickboard__square--light',
                  mark && `clickboard__square--${mark}`,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={onSquare ? () => onSquare(square) : undefined}
                disabled={disabled}
                aria-label={label}
                data-square={square}
              >
                {coordinates && file === files[0] ? (
                  <span className="clickboard__coord clickboard__coord--rank" aria-hidden="true">
                    {rank}
                  </span>
                ) : null}
                {coordinates && rank === ranks[ranks.length - 1] ? (
                  <span className="clickboard__coord clickboard__coord--file" aria-hidden="true">
                    {file}
                  </span>
                ) : null}
                {piece ? <piece className={`${piece.role} ${piece.color}`} /> : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});

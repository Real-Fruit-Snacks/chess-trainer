import { type CSSProperties, useEffect } from 'react';
import { type PieceSet, useSettings } from '@/store/settings';
import { BOARD_PALETTES } from './boardThemes';
import { PIECE_SET_IDS, PIECE_SETS } from './pieceSets';
import { loadAllPieceSets } from './pieceStyles';
import './piece-picker.css';

const STRIP = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;

/**
 * Every piece set as a strip of six pieces on the current board colours, the
 * way a set is chosen on Lichess. Each strip is scoped to its own set
 * (`.piece-preview.pieces-<set>`), so the pickers show every set at once; their
 * stylesheets load when the picker first shows (pieceStyles.ts).
 */
export function PieceSetPicker({
  value,
  onChange,
}: {
  value: PieceSet;
  onChange: (set: PieceSet) => void;
}) {
  const boardTheme = useSettings((s) => s.boardTheme);
  const palette = BOARD_PALETTES[boardTheme];
  useEffect(() => {
    void loadAllPieceSets();
  }, []);
  const style = { '--pp-light': palette.light, '--pp-dark': palette.dark } as CSSProperties;
  return (
    <div className="piecepick" role="group" aria-label="Piece set" style={style}>
      {PIECE_SET_IDS.map((set) => (
        <button
          key={set}
          type="button"
          className="piecepick__option"
          aria-pressed={value === set}
          onClick={() => onChange(set)}
          title={`${PIECE_SETS[set].hint} By ${PIECE_SETS[set].author}, ${PIECE_SETS[set].licence}.`}
          data-testid={`pieces-${set}`}
        >
          <span
            className={`piecepick__strip cg-wrap piece-preview pieces-${set}`}
            aria-hidden="true"
          >
            {STRIP.map((role, i) => (
              <span key={role} className={`piecepick__square${i % 2 ? ' is-dark' : ''}`}>
                <piece className={`${i % 2 ? 'black' : 'white'} ${role}`} />
              </span>
            ))}
          </span>
          <span className="piecepick__label">{PIECE_SETS[set].label}</span>
        </button>
      ))}
    </div>
  );
}

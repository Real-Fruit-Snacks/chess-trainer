import { useEffect, useRef } from 'react';
import type { LongColor, PromotionPiece } from '@/chess/types';
import './promotion.css';

const PIECES: { piece: PromotionPiece; role: string; label: string }[] = [
  { piece: 'q', role: 'queen', label: 'Queen' },
  { piece: 'r', role: 'rook', label: 'Rook' },
  { piece: 'b', role: 'bishop', label: 'Bishop' },
  { piece: 'n', role: 'knight', label: 'Knight' },
];

/**
 * Overlay shown on top of the board when a pawn reaches the last rank.
 * Reuses chessground's piece sprites so it matches the board.
 */
export function PromotionPicker({
  color,
  onSelect,
}: {
  color: LongColor;
  onSelect: (piece: PromotionPiece | null) => void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSelect(null);
      const map: Record<string, PromotionPiece> = { q: 'q', r: 'r', b: 'b', n: 'n' };
      const piece = map[e.key.toLowerCase()];
      if (piece) onSelect(piece);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect]);

  return (
    <div className="promotion" role="dialog" aria-label="Choose a piece to promote to">
      <div className="promotion__choices cg-wrap">
        {PIECES.map(({ piece, role, label }, i) => (
          <button
            key={piece}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            className="promotion__choice"
            onClick={() => onSelect(piece)}
            aria-label={label}
          >
            <piece className={`${role} ${color}`} />
          </button>
        ))}
        <button type="button" className="promotion__cancel" onClick={() => onSelect(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

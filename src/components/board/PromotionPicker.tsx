import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from 'react';
import type { LongColor, PromotionPiece } from '@/chess/types';
import './promotion.css';

const PIECES: { piece: PromotionPiece; role: string; label: string }[] = [
  { piece: 'q', role: 'queen', label: 'Queen' },
  { piece: 'r', role: 'rook', label: 'Rook' },
  { piece: 'b', role: 'bishop', label: 'Bishop' },
  { piece: 'n', role: 'knight', label: 'Knight' },
];

const KEYS: Record<string, PromotionPiece> = { q: 'q', r: 'r', b: 'b', n: 'n' };

/**
 * Overlay shown on top of the board when a pawn reaches the last rank.
 * Reuses chessground's piece sprites so it matches the board.
 *
 * A modal dialog: focus starts on the queen, Tab cycles inside, Escape
 * cancels, Q/R/B/N choose, and every key is kept from the page (in a simul,
 * N would otherwise switch boards). Focus returns to where it was on close.
 */
export function PromotionPicker({
  color,
  onSelect,
}: {
  color: LongColor;
  onSelect: (piece: PromotionPiece | null) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  const focusables = () =>
    Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
      e.stopPropagation();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') {
      onSelect(null);
    } else {
      const piece = KEYS[e.key.toLowerCase()];
      if (piece) onSelect(piece);
      else if (e.key !== 'Enter' && e.key !== ' ') return;
      else {
        // Enter and Space press the focused button: let the click happen, but keep the key here.
        e.stopPropagation();
        return;
      }
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={dialogRef}
      className="promotion"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a piece to promote to"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // Modal: focus that wanders out (a tap on the backdrop) comes back to the choices.
        if (!dialogRef.current?.contains(e.relatedTarget)) firstRef.current?.focus();
      }}
    >
      <div className="promotion__choices cg-wrap">
        {PIECES.map(({ piece, role, label }, i) => (
          <button
            key={piece}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            className="promotion__choice"
            onClick={() => onSelect(piece)}
            aria-label={label}
            aria-keyshortcuts={piece.toUpperCase()}
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

import { useMemo } from 'react';
import type { Fen, LongColor } from '@/chess/types';
import { useSettings } from '@/store/settings';
import { capturedMaterial, MATERIAL_ORDER } from './material';
import './chess-components.css';

/**
 * Shows the pieces `color` has captured from the opponent (i.e. the opponent's
 * missing material) and the material difference, Lichess-style. The setting
 * chooses between the imbalance only, every capture, or nothing.
 */
export function Material({ fen, color }: { fen: Fen; color: LongColor }) {
  const opponent: LongColor = color === 'white' ? 'black' : 'white';
  const mode = useSettings((s) => s.materialDisplay);

  const { captured, diff } = useMemo(
    () => (mode === 'off' ? { captured: [], diff: 0 } : capturedMaterial(fen, color, mode)),
    [fen, color, mode],
  );
  if (mode === 'off') return null;

  return (
    <div className="material cg-wrap" role="group" aria-label={`Material captured by ${color}`}>
      {MATERIAL_ORDER.map((role) => {
        const n = captured.filter((r) => r === role).length;
        if (n === 0) return null;
        return (
          <span key={role} className="material__group">
            {Array.from({ length: n }, (_, i) => (
              <piece key={i} className={`${role} ${opponent}`} />
            ))}
          </span>
        );
      })}
      {diff > 0 ? <span className="material__diff">+{diff}</span> : null}
    </div>
  );
}

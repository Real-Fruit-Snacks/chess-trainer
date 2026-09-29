import { Chess } from 'chess.js';
import { useMemo } from 'react';
import type { Fen, LongColor } from '@/chess/types';
import './chess-components.css';

const ORDER = ['queen', 'rook', 'bishop', 'knight', 'pawn'] as const;
type Role = (typeof ORDER)[number];
const VALUES: Record<Role, number> = { queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1 };
const START: Record<Role, number> = { queen: 1, rook: 2, bishop: 2, knight: 2, pawn: 8 };
const ROLE: Record<string, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

function emptyCounts(): Record<Role, number> {
  return { queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 };
}

/**
 * Shows the pieces `color` has captured from the opponent (i.e. the opponent's
 * missing material) and the material difference, Lichess-style.
 */
export function Material({ fen, color }: { fen: Fen; color: LongColor }) {
  const opponent: LongColor = color === 'white' ? 'black' : 'white';

  const { captured, diff } = useMemo(() => {
    const chess = new Chess(fen);
    const onBoard: Record<LongColor, Record<Role, number>> = {
      white: emptyCounts(),
      black: emptyCounts(),
    };
    for (const row of chess.board()) {
      for (const piece of row) {
        if (!piece || piece.type === 'k') continue;
        const role = ROLE[piece.type];
        if (!role) continue;
        onBoard[piece.color === 'w' ? 'white' : 'black'][role]++;
      }
    }
    const capturedList: Role[] = [];
    let mine = 0;
    let theirs = 0;
    for (const role of ORDER) {
      const missing = Math.max(0, START[role] - onBoard[opponent][role]);
      for (let i = 0; i < missing; i++) capturedList.push(role);
      mine += onBoard[color][role] * VALUES[role];
      theirs += onBoard[opponent][role] * VALUES[role];
    }
    return { captured: capturedList, diff: mine - theirs };
  }, [fen, color, opponent]);

  return (
    <div className="material cg-wrap" aria-label={`Material captured by ${color}`}>
      {ORDER.map((role) => {
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

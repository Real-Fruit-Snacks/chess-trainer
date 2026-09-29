import type { ReactNode } from 'react';
import type { Fen, LongColor } from '@/chess/types';
import { Material } from './Material';
import './chess-components.css';

export function PlayerBar({
  name,
  color,
  fen,
  thinking = false,
  extra,
}: {
  name: ReactNode;
  color: LongColor;
  fen: Fen;
  thinking?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="playerbar">
      <span className="playerbar__name">
        <span className={`playerbar__dot playerbar__dot--${color}`} aria-hidden="true" />
        {name}
        {thinking ? (
          <span className="playerbar__thinking">
            <span className="spinner" aria-hidden="true" /> thinking
          </span>
        ) : null}
      </span>
      <span className="row">
        {extra}
        <Material fen={fen} color={color} />
      </span>
    </div>
  );
}

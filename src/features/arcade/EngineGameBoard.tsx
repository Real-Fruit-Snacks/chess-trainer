import type { ReactNode } from 'react';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { Button, Card } from '@/components/ui';
import type { LongColor } from '@/chess/types';
import type { UsePlayVsEngine } from '@/features/play/usePlayVsEngine';
import '@/features/play/play.css';

/**
 * The board column of an arcade game played through `usePlayVsEngine`: player
 * bars, the board, promotion picker and an optional overlay (start card, result).
 */
export function EngineGameBoard({
  play,
  engineName,
  ariaLabel,
  overlay,
  blindfold = false,
  showMaterial = true,
  below,
}: {
  play: UsePlayVsEngine;
  engineName: string;
  ariaLabel: string;
  overlay?: ReactNode;
  blindfold?: boolean;
  showMaterial?: boolean;
  /** Rendered under the bottom player bar (peek button, move input…). */
  below?: ReactNode;
}) {
  const { game } = play;
  const { position } = game;
  const topColor: LongColor = play.orientation === 'white' ? 'black' : 'white';
  const bottomColor: LongColor = play.orientation;
  const nameFor = (c: LongColor) => (c === play.playerColor ? 'You' : engineName);
  const playerTurn =
    play.started && !play.gameOver && !play.thinking && position.turn === play.playerColor;

  return (
    <div className="play__boardcol">
      <PlayerBar
        name={nameFor(topColor)}
        color={topColor}
        fen={position.fen}
        thinking={play.thinking && topColor !== play.playerColor}
        showMaterial={showMaterial}
      />
      <div className="trainer__board" style={{ position: 'relative' }}>
        <Board
          fen={position.fen}
          orientation={play.orientation}
          turnColor={position.turn}
          movableColor={playerTurn ? play.playerColor : undefined}
          dests={playerTurn ? position.dests : new Map()}
          lastMove={position.lastMove}
          check={position.inCheck}
          autoShapes={play.hintShapes}
          onMove={(from, to) => play.playerMove(from, to)}
          ariaLabel={ariaLabel}
          className={blindfold ? 'board--blindfold' : undefined}
        />
        {game.pendingPromotion ? (
          <PromotionPicker color={game.pendingPromotion.color} onSelect={play.resolvePromotion} />
        ) : null}
        {overlay ? <div className="trainer__overlay">{overlay}</div> : null}
      </div>
      <PlayerBar
        name={nameFor(bottomColor)}
        color={bottomColor}
        fen={position.fen}
        thinking={play.thinking && bottomColor !== play.playerColor}
        showMaterial={showMaterial}
      />
      {below}
    </div>
  );
}

/** The move list with the usual buttons, for the side panel of an arcade game. */
export function GameMoves({
  play,
  onResign,
  extra,
}: {
  play: UsePlayVsEngine;
  onResign?: () => void;
  extra?: ReactNode;
}) {
  const { position } = play.game;
  return (
    <Card>
      <MoveList
        moves={position.history}
        currentPly={position.history.length}
        onSelectPly={() => undefined}
        startsWithBlack={play.startFen.split(' ')[1] === 'b'}
        startMoveNumber={Number(play.startFen.split(' ')[5] ?? 1)}
      />
      <div className="row" style={{ marginTop: 12 }}>
        {extra}
        {onResign ? (
          <Button
            size="sm"
            variant="danger"
            onClick={onResign}
            disabled={!play.started || !!play.gameOver}
          >
            Resign
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

import { type ReactNode, type Ref, useState } from 'react';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { Button, Card } from '@/components/ui';
import type { LongColor } from '@/chess/types';
import type { UsePlayVsEngine } from '@/features/play/usePlayVsEngine';
import { FocusToggle, GameExportButtons, ResignDialog } from './arcadeControls';
import '@/features/play/play.css';
import './arcade.css';

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
  preview = null,
  boardColRef,
}: {
  play: UsePlayVsEngine;
  engineName: string;
  ariaLabel: string;
  overlay?: ReactNode;
  blindfold?: boolean;
  showMaterial?: boolean;
  /** Rendered under the bottom player bar (peek button, move input…). */
  below?: ReactNode;
  /**
   * While the game is set up: the position it will start from, as a picture (no moves), from the
   * side the learner will play — with the pieces hidden for a blindfold game.
   */
  preview?: { fen: string; orientation?: LongColor; hidePieces?: boolean } | null;
  boardColRef?: Ref<HTMLDivElement>;
}) {
  const { game } = play;
  const { position } = game;
  const orientation: LongColor = preview ? (preview.orientation ?? 'white') : play.orientation;
  const topColor: LongColor = orientation === 'white' ? 'black' : 'white';
  const bottomColor: LongColor = orientation;
  const fen = preview ? preview.fen : position.fen;
  const nameFor = (c: LongColor) =>
    c === (preview ? orientation : play.playerColor) ? 'You' : engineName;
  const playerTurn =
    play.started && !play.gameOver && !play.thinking && position.turn === play.playerColor;

  return (
    <div className="play__boardcol" ref={boardColRef}>
      <PlayerBar
        name={nameFor(topColor)}
        color={topColor}
        fen={fen}
        thinking={!preview && play.thinking && topColor !== play.playerColor}
        showMaterial={showMaterial && !preview}
      />
      <div className="trainer__board">
        {preview ? (
          <Board
            fen={preview.fen}
            orientation={orientation}
            viewOnly
            ariaLabel={
              preview.hidePieces
                ? 'The board, its pieces hidden as they will be in the game'
                : `The game's starting position, ${orientation === 'white' ? 'White' : 'Black'} at the bottom`
            }
            className={preview.hidePieces ? 'board--blindfold' : undefined}
          />
        ) : (
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
        )}
        {!preview && game.pendingPromotion ? (
          <PromotionPicker color={game.pendingPromotion.color} onSelect={play.resolvePromotion} />
        ) : null}
        {overlay ? <div className="trainer__overlay">{overlay}</div> : null}
      </div>
      <PlayerBar
        name={nameFor(bottomColor)}
        color={bottomColor}
        fen={fen}
        thinking={!preview && play.thinking && bottomColor !== play.playerColor}
        showMaterial={showMaterial && !preview}
      />
      {preview ? null : below}
    </div>
  );
}

/**
 * The move list with the usual buttons, for the side panel of an arcade game:
 * Copy PGN and Analyze game (as on the Play page), focus mode, and Resign
 * behind the arcade's one confirmation.
 */
export function GameMoves({
  play,
  resignNote,
  extra,
}: {
  play: UsePlayVsEngine;
  /** What resigning means here (defaults to "recorded as a loss"). */
  resignNote?: ReactNode;
  extra?: ReactNode;
}) {
  const { position } = play.game;
  const [confirmResign, setConfirmResign] = useState(false);
  return (
    <Card>
      <MoveList
        moves={position.history}
        currentPly={position.history.length}
        startsWithBlack={play.startFen.split(' ')[1] === 'b'}
        startMoveNumber={Number(play.startFen.split(' ')[5] ?? 1)}
      />
      <div className="row arcade__game-actions">
        <GameExportButtons
          pgn={play.pgn}
          orientation={play.playerColor}
          disabled={position.history.length === 0}
        />
        <FocusToggle />
        {extra}
        <Button
          size="sm"
          variant="danger"
          onClick={() => setConfirmResign(true)}
          disabled={!play.started || !!play.gameOver}
        >
          Resign
        </Button>
      </div>
      <ResignDialog
        open={confirmResign && play.started && !play.gameOver}
        onClose={() => setConfirmResign(false)}
        onConfirm={play.resign}
      >
        {resignNote}
      </ResignDialog>
    </Card>
  );
}

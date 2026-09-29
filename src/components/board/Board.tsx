import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key, MoveMetadata } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from 'react';
import type { LongColor } from '@/chess/types';
import { useSettings } from '@/store/settings';
import { boardBackground } from './boardThemes';
import './board.css';

export type { DrawShape, Key };

export interface BoardProps {
  fen: string;
  orientation?: LongColor;
  turnColor?: LongColor;
  /** Colour(s) allowed to move pieces. Omit for a read-only board. */
  movableColor?: LongColor | 'both';
  /** Legal destinations per origin square; when omitted any move is accepted (free mode). */
  dests?: Map<Key, Key[]>;
  lastMove?: readonly [Key, Key] | null;
  /** Highlight the king of the side to move as being in check. */
  check?: boolean;
  /** Extra CSS classes per square, e.g. lesson hints (`hint`, `right`, `wrong`). */
  highlights?: Map<Key, string>;
  /** Persistent arrows/circles drawn by the app (e.g. lesson hints). */
  shapes?: DrawShape[];
  /** Transient arrows such as the engine's best move. */
  autoShapes?: DrawShape[];
  /** Disable all interaction. */
  viewOnly?: boolean;
  /** Let the user draw arrows with right-click / two-finger drag. */
  drawable?: boolean;
  coordinates?: boolean;
  animate?: boolean;
  /** Fired after the user drops a piece. Squares are real board squares (chessground's "a0" never occurs here). */
  onMove?: (from: Square, to: Square, meta: MoveMetadata) => void;
  onSelect?: (key: Key) => void;
  /** Called when the user changes the drawn shapes. */
  onShapesChange?: (shapes: DrawShape[]) => void;
  className?: string;
  /** Accessible description of the position, announced to screen readers. */
  ariaLabel?: string;
}

/**
 * React wrapper around Lichess' Chessground. The chessground instance is
 * created once and reconfigured through `api.set` on every prop change, which
 * keeps piece animations intact.
 */
export function Board({
  fen,
  orientation = 'white',
  turnColor,
  movableColor,
  dests,
  lastMove,
  check = false,
  highlights,
  shapes,
  autoShapes,
  viewOnly = false,
  drawable = true,
  coordinates,
  animate,
  onMove,
  onSelect,
  onShapesChange,
  className,
  ariaLabel,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const callbacks = useRef({ onMove, onSelect, onShapesChange });
  callbacks.current = { onMove, onSelect, onShapesChange };

  const boardTheme = useSettings((s) => s.boardTheme);
  const settingsCoordinates = useSettings((s) => s.showCoordinates);
  const settingsAnimations = useSettings((s) => s.animations);
  const showLegalMoves = useSettings((s) => s.showLegalMoves);

  const showCoordinates = coordinates ?? settingsCoordinates;
  const animationsEnabled = animate ?? settingsAnimations;
  const effectiveTurn = turnColor ?? (fen.split(' ')[1] === 'b' ? 'black' : 'white');

  const buildConfig = (): Config => ({
    fen,
    orientation,
    turnColor: effectiveTurn,
    check,
    lastMove: lastMove ? [...lastMove] : undefined,
    coordinates: showCoordinates,
    viewOnly,
    disableContextMenu: true,
    addDimensionsCssVarsTo: containerRef.current ?? undefined,
    highlight: { lastMove: true, check: true, custom: highlights },
    animation: { enabled: animationsEnabled, duration: 200 },
    movable: {
      free: !dests,
      color: viewOnly ? undefined : movableColor,
      dests,
      showDests: showLegalMoves,
      rookCastle: true,
      events: {
        after: (orig, dest, meta) =>
          callbacks.current.onMove?.(orig as Square, dest as Square, meta),
      },
    },
    premovable: { enabled: false },
    draggable: { enabled: !viewOnly, showGhost: true, autoDistance: true },
    selectable: { enabled: !viewOnly },
    drawable: {
      enabled: drawable && !viewOnly,
      visible: true,
      shapes: shapes ?? [],
      autoShapes: autoShapes ?? [],
      eraseOnMovablePieceClick: false,
      onChange: (next) => callbacks.current.onShapesChange?.(next),
    },
    events: {
      select: (key) => callbacks.current.onSelect?.(key),
    },
  });

  // Create the instance. `viewOnly` decides which DOM events chessground binds,
  // so changing it recreates the board; everything else is applied via `set`.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const api = Chessground(el, buildConfig());
    apiRef.current = api;

    const observer = new ResizeObserver(() => {
      api.state.dom.bounds.clear();
      api.redrawAll();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      api.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewOnly]);

  // Reconfigure on every relevant change.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.set({
      fen,
      orientation,
      turnColor: effectiveTurn,
      check,
      lastMove: lastMove ? [...lastMove] : undefined,
      coordinates: showCoordinates,
      highlight: { custom: highlights ?? new Map() },
      animation: { enabled: animationsEnabled },
      movable: {
        free: !dests,
        color: viewOnly ? undefined : movableColor,
        dests,
        showDests: showLegalMoves,
      },
      draggable: { enabled: !viewOnly },
      selectable: { enabled: !viewOnly },
      drawable: { enabled: drawable && !viewOnly },
    });
  }, [
    fen,
    orientation,
    effectiveTurn,
    check,
    lastMove,
    highlights,
    showCoordinates,
    animationsEnabled,
    dests,
    movableColor,
    viewOnly,
    showLegalMoves,
    drawable,
  ]);

  // Shapes are managed separately so that redrawing arrows doesn't touch pieces.
  useEffect(() => {
    apiRef.current?.setShapes(shapes ?? []);
  }, [shapes]);

  useEffect(() => {
    apiRef.current?.setAutoShapes(autoShapes ?? []);
  }, [autoShapes]);

  const style = { '--board-bg': boardBackground(boardTheme) } as CSSProperties;

  return (
    <div className={['board', className].filter(Boolean).join(' ')} style={style}>
      <div
        ref={containerRef}
        className="board__cg"
        role="img"
        aria-label={ariaLabel ?? `Chess board, ${effectiveTurn} to move`}
      />
    </div>
  );
}

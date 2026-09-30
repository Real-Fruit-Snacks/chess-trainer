import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key, MoveMetadata } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { LongColor } from '@/chess/types';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useSettings } from '@/store/settings';
import { describeMove } from './announce';
import { boardBackground } from './boardThemes';
import {
  defaultCursor,
  describePosition,
  describeSquare,
  moveCursor,
  squareOffset,
} from './keyboard';
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
  /** Announce each move (derived from `fen` and `lastMove`) to screen readers. Default true. */
  announceMoves?: boolean;
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
  announceMoves = true,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const callbacks = useRef({ onMove, onSelect, onShapesChange });
  callbacks.current = { onMove, onSelect, onShapesChange };

  const boardTheme = useSettings((s) => s.boardTheme);
  const settingsCoordinates = useSettings((s) => s.showCoordinates);
  const settingsAnimations = useSettings((s) => s.animations);
  const showLegalMoves = useSettings((s) => s.showLegalMoves);
  const reducedMotion = useReducedMotion();

  const showCoordinates = coordinates ?? settingsCoordinates;
  const animationsEnabled = (animate ?? settingsAnimations) && !reducedMotion;
  const effectiveTurn = turnColor ?? (fen.split(' ')[1] === 'b' ? 'black' : 'white');

  const buildConfig = (): Config => ({
    fen,
    orientation,
    turnColor: effectiveTurn,
    check,
    lastMove: lastMove ? [...lastMove] : undefined,
    coordinates: false,
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

  // Screen-reader announcement of the last move, derived from consecutive positions.
  const previousFen = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const before = previousFen.current;
    previousFen.current = fen;
    if (!announceMoves || before === fen) return;
    const text = describeMove(before, fen, lastMove);
    if (text) setAnnouncement(text);
  }, [fen, lastMove, announceMoves]);

  // Keyboard control: a square cursor moved with the arrow keys; Enter selects
  // a piece and then its destination through chessground, so the same rules,
  // callbacks and highlights apply as for the mouse.
  const [cursor, setCursor] = useState<Square | null>(null);
  const [focused, setFocused] = useState(false);
  const [cursorText, setCursorText] = useState('');
  const pendingFile = useRef<string | null>(null);
  const interactive = !viewOnly;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive || e.altKey || e.ctrlKey || e.metaKey) return;
    const current = cursor ?? defaultCursor(orientation);
    const moved = moveCursor(current, e.key, orientation);
    if (moved) {
      setCursor(moved);
      setCursorText(describeSquare(fen, moved));
      pendingFile.current = null;
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!movableColor) return;
      apiRef.current?.selectSquare(current);
      setCursor(current);
      const selected = apiRef.current?.state.selected;
      setCursorText(
        selected === current
          ? `${describeSquare(fen, current)} selected. Move to a destination and press Enter.`
          : describeSquare(fen, current),
      );
    } else if (e.key === 'Escape') {
      if (!apiRef.current?.state.selected) return;
      apiRef.current.selectSquare(null);
      setCursorText('Selection cleared.');
    } else if (/^[a-h]$/.test(e.key)) {
      // Remember the file but let the key through: pages use letters as shortcuts too.
      pendingFile.current = e.key;
      return;
    } else if (/^[1-8]$/.test(e.key) && pendingFile.current) {
      const square = `${pendingFile.current}${e.key}` as Square;
      pendingFile.current = null;
      setCursor(square);
      setCursorText(describeSquare(fen, square));
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const style = { '--board-bg': boardBackground(boardTheme) } as CSSProperties;
  const cursorStyle: CSSProperties | undefined =
    focused && cursor
      ? {
          left: `${squareOffset(cursor, orientation).x * 100}%`,
          top: `${squareOffset(cursor, orientation).y * 100}%`,
        }
      : undefined;

  return (
    <div
      className={[
        'board',
        `board--theme-${boardTheme}`,
        showCoordinates ? 'board--coords' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      data-animated={animationsEnabled}
      data-orientation={orientation}
    >
      <div className="board__surface">
        <div
          ref={containerRef}
          className="board__cg"
          role={interactive ? 'application' : 'img'}
          aria-roledescription={interactive ? 'chess board' : undefined}
          aria-label={ariaLabel ?? `Chess board, ${effectiveTurn} to move`}
          tabIndex={interactive ? 0 : undefined}
          onKeyDown={interactive ? onKeyDown : undefined}
          onFocus={() => {
            if (!interactive) return;
            setFocused(true);
            if (!cursor) setCursor(defaultCursor(orientation));
          }}
          onBlur={() => setFocused(false)}
        />
        {cursorStyle ? (
          <div
            className="board__cursor"
            style={cursorStyle}
            aria-hidden="true"
            data-testid="board-cursor"
          />
        ) : null}
      </div>
      {showCoordinates ? <BoardCoords orientation={orientation} /> : null}
      {interactive ? (
        <button
          type="button"
          className="sr-only sr-only--focusable board__describe"
          onClick={() => setCursorText(describePosition(fen))}
        >
          Describe position
        </button>
      ) : null}
      <div className="sr-only board__announce" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="sr-only board__cursor-announce" aria-live="polite" aria-atomic="true">
        {cursorText}
      </div>
    </div>
  );
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Coordinates drawn by the app in a gutter outside the playing surface: rank
 * numbers down the left, file letters along the bottom, each centred on its
 * square. Off the board they never sit under a piece and read the same on
 * every square colour and theme.
 */
function BoardCoords({ orientation }: { orientation: LongColor }) {
  // Ranks top to bottom, files left to right, as seen from the orientation.
  const ranks = orientation === 'white' ? [...RANKS].reverse() : [...RANKS];
  const files = orientation === 'white' ? [...FILES] : [...FILES].reverse();
  return (
    <div className="board__coords" aria-hidden="true" data-testid="board-coords">
      <div className="board__ranks">
        {ranks.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
      <div className="board__files">
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    </div>
  );
}

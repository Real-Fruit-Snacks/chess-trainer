import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key, MoveMetadata } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { castlingKingDest, withRookCastleDests } from '@/chess/helpers';
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
  squareFromKeys,
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
  /**
   * Fired after the user drops a piece. Squares are real board squares (chessground's "a0"
   * never occurs here) and a king dropped on its own rook reports the castling square.
   */
  onMove?: (from: Square, to: Square, meta: MoveMetadata) => void;
  onSelect?: (key: Key) => void;
  /** Called when the user changes the drawn shapes. */
  onShapesChange?: (shapes: DrawShape[]) => void;
  className?: string;
  /** Accessible name of the board, announced to screen readers. */
  ariaLabel?: string;
  /** Announce each move (derived from `fen` and `lastMove`) to screen readers. Default true. */
  announceMoves?: boolean;
}

/** Whether two destination maps allow the same moves (pages may rebuild the Map every render). */
function sameDests(a: Map<Key, Key[]> | undefined, b: Map<Key, Key[]> | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.size !== b.size) return false;
  for (const [from, targets] of a) {
    const other = b.get(from) ?? [];
    if (other.length !== targets.length) return false;
    if (targets.some((t, i) => t !== other[i])) return false;
  }
  return true;
}

const INSTRUCTIONS =
  'Use the arrow keys or type a square such as e4 to move the cursor. ' +
  'Press Enter to select a piece, then Enter on a destination to move it. ' +
  'Escape clears the selection.';

/**
 * React wrapper around Lichess' Chessground. The chessground instance is
 * created once and reconfigured through `api.set` on every prop change, which
 * keeps piece animations intact.
 *
 * The board is self-healing: after `onMove` the position from the props is
 * applied again unless the props changed in the meantime, so a cancelled
 * promotion or a drill that keeps its position puts the piece back and keeps
 * the board movable instead of leaving chessground's optimistic move behind.
 */
function BoardImpl({
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
  const instructionsId = useId();

  const boardTheme = useSettings((s) => s.boardTheme);
  const settingsCoordinates = useSettings((s) => s.showCoordinates);
  const settingsAnimations = useSettings((s) => s.animations);
  const showLegalMoves = useSettings((s) => s.showLegalMoves);
  const boardHighlights = useSettings((s) => s.boardHighlights);
  const magnifyDrag = useSettings((s) => s.magnifyDrag);
  const dragTarget = useSettings((s) => s.dragTarget);
  const moveMethod = useSettings((s) => s.moveMethod);
  const reducedMotion = useReducedMotion();

  const showCoordinates = coordinates ?? settingsCoordinates;
  const animationsEnabled = (animate ?? settingsAnimations) && !reducedMotion;
  const effectiveTurn = turnColor ?? (fen.split(' ')[1] === 'b' ? 'black' : 'white');
  const canDrag = !viewOnly && moveMethod !== 'tap';
  const canTap = !viewOnly && moveMethod !== 'drag';
  // Chessground castles when the king is dropped on its rook only if the rook square is a destination.
  const cgDests = useMemo(
    () => (dests ? withRookCastleDests(fen, dests as Map<Square, Square[]>) : undefined),
    [dests, fen],
  );

  // The latest position props, for the self-healing step after a move.
  const position = useRef({ fen, effectiveTurn, cgDests, lastMove, movableColor, check });
  position.current = { fen, effectiveTurn, cgDests, lastMove, movableColor, check };
  // The shapes currently on the board: the `shapes` prop or what the user drew since.
  const shapesRef = useRef<DrawShape[]>(shapes ?? []);

  const positionConfig = (): Config => {
    const p = position.current;
    return {
      fen: p.fen,
      turnColor: p.effectiveTurn,
      check: p.check,
      lastMove: p.lastMove ? [...p.lastMove] : undefined,
      movable: {
        free: !p.cgDests,
        color: viewOnly ? undefined : p.movableColor,
        dests: p.cgDests,
      },
      drawable: { shapes: shapesRef.current },
    };
  };

  const afterMove = (orig: Key, dest: Key, meta: MoveMetadata) => {
    const before = position.current;
    const from = orig as Square;
    const to = castlingKingDest(before.fen, from, dest as Square);
    // Chessground calls this from a timeout, outside any React event, so the page's state
    // updates are flushed here; afterwards the latest render is in `position`.
    flushSync(() => callbacks.current.onMove?.(from, to, meta));
    // When the page did not answer with a new position (a cancelled promotion, a drill that
    // keeps its position), chessground's optimistic move is undone.
    queueMicrotask(() => {
      const api = apiRef.current;
      const now = position.current;
      const same =
        now.fen === before.fen &&
        now.effectiveTurn === before.effectiveTurn &&
        sameDests(now.cgDests, before.cgDests) &&
        now.movableColor === before.movableColor &&
        now.check === before.check &&
        (now.lastMove === before.lastMove ||
          (now.lastMove?.[0] === before.lastMove?.[0] &&
            now.lastMove?.[1] === before.lastMove?.[1]));
      if (api && same) api.set(positionConfig());
    });
  };

  const buildConfig = (): Config => ({
    ...positionConfig(),
    orientation,
    coordinates: false,
    viewOnly,
    disableContextMenu: true,
    addDimensionsCssVarsTo: containerRef.current ?? undefined,
    highlight: { lastMove: boardHighlights, check: boardHighlights, custom: highlights },
    animation: { enabled: animationsEnabled, duration: 200 },
    movable: {
      free: !cgDests,
      color: viewOnly ? undefined : movableColor,
      dests: cgDests,
      showDests: showLegalMoves,
      rookCastle: true,
      events: { after: afterMove },
    },
    premovable: { enabled: false },
    draggable: { enabled: canDrag, showGhost: true, autoDistance: true },
    selectable: { enabled: canTap },
    drawable: {
      enabled: drawable && !viewOnly,
      visible: true,
      shapes: shapesRef.current,
      autoShapes: autoShapes ?? [],
      eraseOnMovablePieceClick: false,
      onChange: (next) => {
        shapesRef.current = next;
        callbacks.current.onShapesChange?.(next);
      },
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

    // Chessground caches the board's bounding box and refreshes it only on scroll and
    // resize. A layout shift above the board (a toast, a banner, a card changing height)
    // or a scroll whose event has not been delivered yet would map the next click to the
    // wrong square, so the cache is cleared before every interaction instead.
    const refreshBounds = () => api.state.dom.bounds.clear();
    el.addEventListener('mousedown', refreshBounds, { capture: true });
    el.addEventListener('touchstart', refreshBounds, { capture: true, passive: true });

    return () => {
      el.removeEventListener('mousedown', refreshBounds, { capture: true });
      el.removeEventListener('touchstart', refreshBounds, { capture: true });
      observer.disconnect();
      api.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewOnly]);

  // Reconfigure on every relevant change. Passing `fen` makes chessground reset its shapes,
  // so the current ones are passed along with it.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.set({
      ...positionConfig(),
      orientation,
      highlight: {
        lastMove: boardHighlights,
        check: boardHighlights,
        custom: highlights ?? new Map(),
      },
      animation: { enabled: animationsEnabled },
      movable: {
        free: !cgDests,
        color: viewOnly ? undefined : movableColor,
        dests: cgDests,
        showDests: showLegalMoves,
      },
      draggable: { enabled: canDrag },
      selectable: { enabled: canTap },
      drawable: { enabled: drawable && !viewOnly, shapes: shapesRef.current },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fen,
    orientation,
    effectiveTurn,
    check,
    lastMove,
    highlights,
    boardHighlights,
    animationsEnabled,
    cgDests,
    movableColor,
    viewOnly,
    canDrag,
    canTap,
    showLegalMoves,
    drawable,
  ]);

  // The drag target: a mark on the square the dragged piece is over, placed
  // straight on the DOM from the pointer position so it never waits for a render.
  // The pointer is followed on the window so the mark hides when it leaves the board.
  const targetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const marker = targetRef.current;
    if (!marker || !canDrag || dragTarget === 'none') return;
    const hide = () => {
      marker.hidden = true;
    };
    const onPointerMove = (e: PointerEvent) => {
      const api = apiRef.current;
      const drag = api?.state.draggable.current;
      if (!api || !drag?.started) {
        hide();
        return;
      }
      const bounds = api.state.dom.bounds();
      const x = Math.floor(((e.clientX - bounds.left) / bounds.width) * 8);
      const y = Math.floor(((e.clientY - bounds.top) / bounds.height) * 8);
      if (x < 0 || x > 7 || y < 0 || y > 7) {
        hide();
        return;
      }
      marker.style.left = `${x * 12.5}%`;
      marker.style.top = `${y * 12.5}%`;
      marker.hidden = false;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', hide);
    window.addEventListener('pointercancel', hide);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', hide);
      window.removeEventListener('pointercancel', hide);
    };
  }, [canDrag, dragTarget]);

  // Shapes are managed separately so that redrawing arrows doesn't touch pieces.
  useEffect(() => {
    shapesRef.current = shapes ?? [];
    apiRef.current?.setShapes(shapesRef.current);
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
    else if (before && !lastMove) setAnnouncement('New position.');
  }, [fen, lastMove, announceMoves]);

  // Keyboard control: a square cursor moved with the arrow keys; Enter selects
  // a piece and then its destination through chessground, so the same rules,
  // callbacks and highlights apply as for the mouse.
  const [cursor, setCursor] = useState<Square | null>(null);
  const [focused, setFocused] = useState(false);
  const [cursorText, setCursorText] = useState('');
  const pendingFile = useRef<string | null>(null);
  const interactive = !viewOnly;

  /** Enter or Space on `square`: select a piece, move to a destination, or explain why not. */
  const activate = (square: Square) => {
    const api = apiRef.current;
    if (!api) return;
    const selected = api.state.selected as Square | undefined;
    const ownTurn = movableColor === 'both' || movableColor === effectiveTurn;
    if (!movableColor || !ownTurn) {
      setCursorText('It is not your move.');
      return;
    }
    if (selected && selected !== square) {
      const legal = !cgDests || (cgDests.get(selected)?.includes(square) ?? false);
      if (legal) {
        api.selectSquare(square, true);
        if (!api.state.pieces.has(selected)) {
          // Moved: the announcement follows from the new position; the old square is stale.
          setCursorText('');
          return;
        }
      }
      const piece = api.state.pieces.get(square);
      if (piece?.color === effectiveTurn) {
        api.selectSquare(square, true);
        setCursorText(
          `${describeSquare(fen, square)} selected. Move to a destination and press Enter.`,
        );
        return;
      }
      setCursorText('Not a legal destination.');
      return;
    }
    const piece = api.state.pieces.get(square);
    if (piece && piece.color !== effectiveTurn) {
      setCursorText(`${describeSquare(fen, square)}. Not one of your pieces.`);
      return;
    }
    // Forced, so the keyboard still selects when tapping is switched off.
    api.selectSquare(square, true);
    setCursorText(
      api.state.selected === square
        ? `${describeSquare(fen, square)} selected. Move to a destination and press Enter.`
        : describeSquare(fen, square),
    );
  };

  const describeCursor = (square: Square) =>
    describeSquare(fen, square, {
      selected: (apiRef.current?.state.selected as Square | undefined) ?? null,
      dests: cgDests,
    });

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive || e.altKey || e.ctrlKey || e.metaKey) return;
    const current = cursor ?? defaultCursor(orientation);
    const arrow = moveCursor(current, e.key, orientation);
    if (arrow) {
      setCursor(arrow);
      setCursorText(describeCursor(arrow));
      pendingFile.current = null;
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Always swallowed: Space must not scroll the page under a focused board.
      setCursor(current);
      activate(current);
    } else if (e.key === 'Escape') {
      if (!apiRef.current?.state.selected) return;
      apiRef.current.selectSquare(null);
      setCursorText('Selection cleared.');
    } else if (/^[a-hA-H]$/.test(e.key)) {
      // The first half of a typed square. Swallowed so page shortcuts (h for hint,
      // f to flip, s for the solution) never fire from the board.
      pendingFile.current = e.key;
    } else if (/^[1-8]$/.test(e.key) && pendingFile.current) {
      const square = squareFromKeys(pendingFile.current, e.key);
      pendingFile.current = null;
      if (square) {
        setCursor(square);
        setCursorText(describeCursor(square));
      }
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

  // A view-only board is an image; its description carries the position.
  const positionDescription = useMemo(
    () => (interactive ? undefined : describePosition(fen)),
    [interactive, fen],
  );

  return (
    <div
      className={[
        'board',
        `board--theme-${boardTheme}`,
        showCoordinates ? 'board--coords' : null,
        magnifyDrag && canDrag ? 'board--magnify' : null,
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
          aria-description={positionDescription}
          aria-describedby={interactive ? instructionsId : undefined}
          tabIndex={interactive ? 0 : undefined}
          onKeyDown={interactive ? onKeyDown : undefined}
          onFocus={() => {
            if (!interactive) return;
            setFocused(true);
            const square = cursor ?? defaultCursor(orientation);
            if (!cursor) setCursor(square);
            setCursorText(describeCursor(square));
          }}
          onBlur={() => setFocused(false)}
        />
        {canDrag && dragTarget !== 'none' ? (
          <div
            ref={targetRef}
            className={`board__dragtarget board__dragtarget--${dragTarget}`}
            hidden
            aria-hidden="true"
            data-testid="board-dragtarget"
          />
        ) : null}
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
        <>
          <p id={instructionsId} className="sr-only">
            {INSTRUCTIONS}
          </p>
          <button
            type="button"
            className="sr-only sr-only--focusable board__describe"
            onClick={() => setCursorText(describePosition(fen))}
          >
            Describe position
          </button>
        </>
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

/** Memoised: a clock ticking in the parent must not redraw the board every tenth of a second. */
export const Board = memo(BoardImpl);

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

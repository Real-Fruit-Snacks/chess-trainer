import type { Color, PieceSymbol, Square } from 'chess.js';
import { useMemo, useState } from 'react';
import { ClickBoard, type ClickBoardPiece, type PieceRole } from '@/components/board/ClickBoard';
import { Alert, Button, Segmented } from '@/components/ui';
import { START_FEN } from '@/chess/helpers';
import type { Fen, LongColor } from '@/chess/types';
import {
  availableCastling,
  type EditorPosition,
  parseBoard,
  type Piece,
  ROLE,
  toFen,
  validatePosition,
} from './boardEditorModel';
import './board-editor.css';

type Tool = { kind: 'piece'; piece: Piece } | { kind: 'move' } | { kind: 'erase' };
const PALETTE_ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export function BoardEditor({
  initialFen,
  onApply,
  onCancel,
}: {
  initialFen: Fen;
  onApply: (fen: Fen) => void;
  onCancel: () => void;
}) {
  const [position, setPosition] = useState<EditorPosition>(() => parseBoard(initialFen));
  const [tool, setTool] = useState<Tool>({ kind: 'move' });
  const [selected, setSelected] = useState<Square | null>(null);
  const [orientation, setOrientation] = useState<LongColor>('white');

  const fen = useMemo(() => toFen(position), [position]);
  const error = useMemo(() => validatePosition(fen), [fen]);
  const allowed = useMemo(() => availableCastling(position.pieces), [position.pieces]);

  const update = (fn: (pieces: Map<Square, Piece>) => void) => {
    setPosition((prev) => {
      const pieces = new Map(prev.pieces);
      fn(pieces);
      return { ...prev, pieces };
    });
  };

  const clickSquare = (square: Square) => {
    if (tool.kind === 'piece') {
      const existing = position.pieces.get(square);
      update((pieces) => {
        if (existing?.color === tool.piece.color && existing.type === tool.piece.type) {
          pieces.delete(square);
        } else {
          pieces.set(square, tool.piece);
        }
      });
      return;
    }
    if (tool.kind === 'erase') {
      update((pieces) => pieces.delete(square));
      return;
    }
    // Move tool: pick up, then drop.
    if (selected === null) {
      if (position.pieces.has(square)) setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    const from = selected;
    update((pieces) => {
      const piece = pieces.get(from);
      pieces.delete(from);
      if (piece) pieces.set(square, piece);
    });
    setSelected(null);
  };

  const boardPieces = useMemo(() => {
    const map = new Map<Square, ClickBoardPiece>();
    for (const [square, piece] of position.pieces) {
      map.set(square, {
        color: piece.color === 'w' ? 'white' : 'black',
        role: ROLE[piece.type] as PieceRole,
      });
    }
    return map;
  }, [position.pieces]);

  const paletteFor = (color: Color) =>
    PALETTE_ORDER.map((type) => {
      const active =
        tool.kind === 'piece' && tool.piece.color === color && tool.piece.type === type;
      const label = `${color === 'w' ? 'White' : 'Black'} ${ROLE[type]}`;
      return (
        <button
          type="button"
          key={type}
          className={`editor__tool${active ? ' editor__tool--active' : ''}`}
          onClick={() => {
            setSelected(null);
            setTool(active ? { kind: 'move' } : { kind: 'piece', piece: { color, type } });
          }}
          aria-pressed={active}
          aria-label={label}
          title={label}
        >
          <piece className={`${ROLE[type]} ${color === 'w' ? 'white' : 'black'}`} />
        </button>
      );
    });

  return (
    <div className="editor cg-wrap">
      <div className="editor__layout">
        <div className="editor__palette" aria-label="White pieces" role="group">
          {paletteFor('w')}
        </div>
        <div className="editor__board">
          <ClickBoard
            pieces={boardPieces}
            orientation={orientation}
            marks={selected ? new Map([[selected, 'selected']]) : undefined}
            onSquare={clickSquare}
            ariaLabel="Board editor"
          />
        </div>
        <div className="editor__palette" aria-label="Black pieces" role="group">
          {paletteFor('b')}
        </div>
      </div>

      <div className="editor__controls stack">
        <div className="row">
          <Segmented
            ariaLabel="Tool"
            value={tool.kind === 'piece' ? 'piece' : tool.kind}
            options={[
              { value: 'move', label: 'Move pieces' },
              { value: 'erase', label: 'Erase' },
              { value: 'piece', label: 'Place' },
            ]}
            onChange={(kind) => {
              setSelected(null);
              if (kind === 'move') setTool({ kind: 'move' });
              else if (kind === 'erase') setTool({ kind: 'erase' });
              else setTool({ kind: 'piece', piece: { color: 'w', type: 'p' } });
            }}
          />
          <span className="small muted">
            {tool.kind === 'piece'
              ? 'Click a square to place the selected piece; click again to remove it.'
              : tool.kind === 'erase'
                ? 'Click a square to clear it.'
                : 'Click a piece, then its destination.'}
          </span>
        </div>
        <div className="row">
          <Segmented
            ariaLabel="Side to move"
            value={position.turn}
            options={[
              { value: 'w', label: 'White to move' },
              { value: 'b', label: 'Black to move' },
            ]}
            onChange={(turn) => setPosition((p) => ({ ...p, turn }))}
          />
        </div>
        <fieldset className="editor__castling">
          <legend className="small muted">Castling rights</legend>
          {(
            [
              ['K', 'White O-O'],
              ['Q', 'White O-O-O'],
              ['k', 'Black O-O'],
              ['q', 'Black O-O-O'],
            ] as const
          ).map(([right, label]) => (
            <label key={right} className={`small${allowed[right] ? '' : ' muted'}`}>
              <input
                type="checkbox"
                checked={position.castling[right] && allowed[right]}
                disabled={!allowed[right]}
                onChange={(e) =>
                  setPosition((p) => ({
                    ...p,
                    castling: { ...p.castling, [right]: e.target.checked },
                  }))
                }
              />{' '}
              {label}
            </label>
          ))}
        </fieldset>
        <div className="row">
          <Button size="sm" onClick={() => setPosition(parseBoard(START_FEN))}>
            Start position
          </Button>
          <Button size="sm" onClick={() => setPosition((p) => ({ ...p, pieces: new Map() }))}>
            Clear board
          </Button>
          <Button
            size="sm"
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
          >
            Flip
          </Button>
        </div>
        <code className="editor__fen small">{fen}</code>
        {error ? <Alert tone="warning">{error}</Alert> : null}
        <div className="row">
          <Button variant="primary" onClick={() => onApply(fen)} disabled={!!error}>
            Analyze this position
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

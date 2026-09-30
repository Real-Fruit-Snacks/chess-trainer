import { Fragment, type ReactNode, useEffect, useRef } from 'react';
import { NAG_GLYPHS } from '@/chess/pgn';
import type { GameTree, TreeNode } from '@/chess/tree';
import { Button, Kbd, Icon } from '@/components/ui';
import type { MoveJudgement } from './MoveList';
import './chess-components.css';

const JUDGEMENT_GLYPH: Record<NonNullable<MoveJudgement>, string> = {
  blunder: '??',
  mistake: '?',
  inaccuracy: '?!',
  best: '',
  good: '',
};

export interface TreeMoveListProps {
  tree: GameTree;
  /** Change signal for the mutable tree. */
  version: number;
  current: TreeNode;
  onSelect: (node: TreeNode) => void;
  judgements?: Map<number, MoveJudgement>;
}

function moveNumberFor(node: TreeNode, force: boolean): string {
  const parentFen = node.parent?.fen ?? '';
  const parts = parentFen.split(' ');
  const black = parts[1] === 'b';
  const fullmove = parts[5] ?? '1';
  if (black) return force ? `${fullmove}…` : '';
  return `${fullmove}.`;
}

/**
 * A move list that shows the whole game tree: the main line flows across the
 * card and variations appear as indented blocks under the move they branch
 * from, Lichess-style. Comments and glyphs are shown inline.
 */
export function TreeMoveList({ tree, version, current, onSelect, judgements }: TreeMoveListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const renderMove = (node: TreeNode, forceNumber: boolean): ReactNode => {
    const judgement = judgements?.get(node.id) ?? null;
    const glyphs = node.nags.map((n) => NAG_GLYPHS[n] ?? '').join('');
    const judgementGlyph = judgement && !glyphs ? JUDGEMENT_GLYPH[judgement] : '';
    const number = moveNumberFor(node, forceNumber);
    return (
      <button
        type="button"
        key={node.id}
        className={[
          'treemoves__move',
          node === current && 'treemoves__move--current',
          judgement &&
            judgement !== 'good' &&
            judgement !== 'best' &&
            `treemoves__move--${judgement}`,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect(node)}
        aria-current={node === current ? 'true' : undefined}
        aria-label={`${number} ${node.san}${glyphs || judgementGlyph}`}
      >
        {number ? <span className="treemoves__number">{number}</span> : null}
        {node.san}
        {glyphs || judgementGlyph ? (
          <span className="treemoves__glyph">{glyphs || judgementGlyph}</span>
        ) : null}
      </button>
    );
  };

  /** Renders the line that starts after `from`, plus the variation blocks branching off it. */
  const renderLine = (from: TreeNode, depth: number, forceFirstNumber: boolean): ReactNode[] => {
    const out: ReactNode[] = [];
    let node = from.children[0];
    let parent = from;
    let needNumber = forceFirstNumber;
    while (node) {
      out.push(renderMove(node, needNumber));
      needNumber = false;
      if (node.comment) {
        out.push(
          <span key={`c${node.id}`} className="treemoves__comment">
            {node.comment}
          </span>,
        );
        needNumber = true;
      }
      const variations = parent.children.slice(1);
      if (variations.length) {
        out.push(
          <div
            key={`v${node.id}`}
            className="treemoves__variations"
            style={{ '--depth': depth + 1 } as React.CSSProperties}
          >
            {variations.map((variation) => (
              <div key={variation.id} className="treemoves__variation">
                <span className="treemoves__paren">(</span>
                {renderMove(variation, true)}
                {variation.comment ? (
                  <span className="treemoves__comment">{variation.comment}</span>
                ) : null}
                {renderLine(variation, depth + 1, !!variation.comment)}
                <span className="treemoves__paren">)</span>
              </div>
            ))}
          </div>,
        );
        needNumber = true;
      }
      parent = node;
      node = node.children[0];
    }
    return out;
  };

  const empty = tree.root.children.length === 0;

  return (
    <div className="treemoves" ref={listRef} role="list" aria-label="Moves" data-version={version}>
      {tree.root.comment ? <span className="treemoves__comment">{tree.root.comment}</span> : null}
      {empty ? (
        <span className="muted small">No moves yet — play on the board or import a game.</span>
      ) : (
        <Fragment>{renderLine(tree.root, 0, true)}</Fragment>
      )}
    </div>
  );
}

export function TreeNavigation({
  canBack,
  canForward,
  onStart,
  onBack,
  onForward,
  onEnd,
}: {
  canBack: boolean;
  canForward: boolean;
  onStart: () => void;
  onBack: () => void;
  onForward: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="movenav" role="group" aria-label="Move navigation">
      <Button
        size="sm"
        onClick={onStart}
        disabled={!canBack}
        aria-label="First move"
        title="Start (Home)"
      >
        <Icon name="skip-back" size={16} />
      </Button>
      <Button
        size="sm"
        onClick={onBack}
        disabled={!canBack}
        aria-label="Previous move"
        title="Back (←)"
      >
        <Icon name="chevron-left" size={16} />
      </Button>
      <Button
        size="sm"
        onClick={onForward}
        disabled={!canForward}
        aria-label="Next move"
        title="Forward (→)"
      >
        <Icon name="chevron-right" size={16} />
      </Button>
      <Button
        size="sm"
        onClick={onEnd}
        disabled={!canForward}
        aria-label="Last move"
        title="End (End)"
      >
        <Icon name="skip-forward" size={16} />
      </Button>
      <span className="movenav__hint small muted">
        <Kbd>←</Kbd> <Kbd>→</Kbd>
      </span>
    </div>
  );
}

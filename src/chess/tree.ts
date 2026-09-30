import { Chess, type Move } from 'chess.js';
import { START_FEN, toUci, tryMove } from './helpers';
import { NAG_GLYPHS, type PgnGame, type PgnLine, parsePgn } from './pgn';
import type { Fen, MoveInput, San, Uci } from './types';

export interface TreeNode {
  readonly id: number;
  /** SAN of the move that leads to this node ('' for the root). */
  san: San;
  uci: Uci;
  /** Position after the move. */
  fen: Fen;
  /** Half-moves played from the start position to reach this node. */
  ply: number;
  parent: TreeNode | null;
  /** First child is the main continuation; the rest are variations. */
  children: TreeNode[];
  comment?: string;
  nags: number[];
}

let nextId = 1;

function makeNode(
  partial: Omit<TreeNode, 'id' | 'children' | 'nags'> & { nags?: number[] },
): TreeNode {
  return { id: nextId++, children: [], nags: [], ...partial };
}

function moveNumberPrefix(parentFen: Fen, forceNumber: boolean): string {
  const parts = parentFen.split(' ');
  const black = parts[1] === 'b';
  const fullmove = parts[5] ?? '1';
  if (black) return forceNumber ? `${fullmove}... ` : '';
  return `${fullmove}. `;
}

/**
 * A game as a tree of positions. The first child of every node is the main
 * line; further children are variations, in display order.
 */
export class GameTree {
  readonly root: TreeNode;
  current: TreeNode;
  headers: Record<string, string> = {};
  result = '*';

  constructor(startFen: Fen = START_FEN) {
    this.root = makeNode({ san: '', uci: '', fen: startFen, ply: 0, parent: null });
    this.current = this.root;
  }

  get startFen(): Fen {
    return this.root.fen;
  }

  /** Plays a move from the current node; reuses an existing child when the move is already there. */
  addMove(input: MoveInput | San, options: { navigate?: boolean } = {}): TreeNode | null {
    const chess = new Chess(this.current.fen);
    const move = tryMove(chess, input);
    if (!move) return null;
    const node = this.attach(this.current, move, chess.fen());
    if (options.navigate !== false) this.current = node;
    return node;
  }

  private attach(parent: TreeNode, move: Move, fenAfter: Fen): TreeNode {
    const uci = toUci(move);
    const existing = parent.children.find((c) => c.uci === uci);
    if (existing) return existing;
    const node = makeNode({ san: move.san, uci, fen: fenAfter, ply: parent.ply + 1, parent });
    parent.children.push(node);
    return node;
  }

  goTo(node: TreeNode): void {
    this.current = node;
  }

  back(): boolean {
    if (!this.current.parent) return false;
    this.current = this.current.parent;
    return true;
  }

  forward(): boolean {
    const next = this.current.children[0];
    if (!next) return false;
    this.current = next;
    return true;
  }

  goStart(): void {
    this.current = this.root;
  }

  /** Follows main continuations from the current node to the end of the line. */
  goEnd(): void {
    while (this.forward()) {
      /* keep going */
    }
  }

  /** Nodes from the first move down to `node` (root excluded). */
  pathTo(node: TreeNode): TreeNode[] {
    const path: TreeNode[] = [];
    let cursor: TreeNode | null = node;
    while (cursor?.parent) {
      path.unshift(cursor);
      cursor = cursor.parent;
    }
    return path;
  }

  /** The main line from the root. */
  mainLine(): TreeNode[] {
    const line: TreeNode[] = [];
    let cursor = this.root.children[0];
    while (cursor) {
      line.push(cursor);
      cursor = cursor.children[0];
    }
    return line;
  }

  /** Whether `node` lies on the main line. */
  isMainLine(node: TreeNode): boolean {
    let cursor: TreeNode | null = node;
    while (cursor?.parent) {
      if (cursor.parent.children[0] !== cursor) return false;
      cursor = cursor.parent;
    }
    return true;
  }

  /** Makes `node`'s line the main line all the way back to the root. */
  promoteToMain(node: TreeNode): void {
    let cursor: TreeNode | null = node;
    while (cursor?.parent) {
      const siblings = cursor.parent.children;
      const index = siblings.indexOf(cursor);
      if (index > 0) {
        siblings.splice(index, 1);
        siblings.unshift(cursor);
      }
      cursor = cursor.parent;
    }
  }

  /** Moves `node` one place up among its siblings. */
  promote(node: TreeNode): void {
    const siblings = node.parent?.children;
    if (!siblings) return;
    const index = siblings.indexOf(node);
    if (index > 0) {
      siblings.splice(index, 1);
      siblings.splice(index - 1, 0, node);
    }
  }

  /** Removes `node` and everything after it. */
  deleteNode(node: TreeNode): void {
    const parent = node.parent;
    if (!parent) return;
    parent.children = parent.children.filter((c) => c !== node);
    // If the current node was inside the deleted subtree, step back to the parent.
    let cursor: TreeNode | null = this.current;
    while (cursor) {
      if (cursor === node) {
        this.current = parent;
        break;
      }
      cursor = cursor.parent;
    }
  }

  /** Sets or clears the comment shown after `node`'s move. */
  setComment(node: TreeNode, text: string): void {
    const trimmed = text.trim();
    if (trimmed) node.comment = trimmed;
    else delete node.comment;
  }

  /** Replaces the move-assessment glyph ($1–$6) on `node`; null removes it. */
  setGlyph(node: TreeNode, nag: number | null): void {
    node.nags = node.nags.filter((n) => n < 1 || n > 6);
    if (nag !== null) node.nags.unshift(nag);
  }

  /** Removes all moves after the current node (main line and variations). */
  truncateAfterCurrent(): void {
    this.current.children = [];
  }

  /** The moves of the current line from the start, as UCI (for the engine). */
  currentLineUci(): Uci[] {
    return this.pathTo(this.current).map((n) => n.uci);
  }

  /** PGN movetext with variations, comments and glyphs. */
  toPgn(headers: Record<string, string> = {}): string {
    const merged = { ...this.headers, ...headers };
    if (this.root.fen !== START_FEN) {
      merged.SetUp = '1';
      merged.FEN = this.root.fen;
    }
    const headerText = Object.entries(merged)
      .map(([key, value]) => `[${key} "${value.replace(/"/g, '\\"')}"]`)
      .join('\n');
    const body = writeLine(this.root, true);
    const result = merged.Result ?? this.result;
    const movetext = `${body} ${result}`.trim();
    return headerText ? `${headerText}\n\n${wrap(movetext)}` : wrap(movetext);
  }

  /** Builds a tree from PGN text (supports variations, comments and NAGs). */
  static fromPgn(pgn: string): GameTree {
    const game = parsePgn(pgn);
    return GameTree.fromParsed(game);
  }

  static fromParsed(game: PgnGame): GameTree {
    const startFen = game.headers.FEN ?? START_FEN;
    const tree = new GameTree(startFen);
    tree.headers = { ...game.headers };
    tree.result = game.result;
    if (game.comment) tree.root.comment = game.comment;
    const addLine = (parent: TreeNode, line: PgnLine) => {
      let cursor = parent;
      for (const entry of line) {
        const chess = new Chess(cursor.fen);
        const move = tryMove(chess, entry.san);
        if (!move) throw new Error(`Illegal move "${entry.san}" after ${cursor.san || 'start'}`);
        const node = tree.attach(cursor, move, chess.fen());
        if (entry.comment) node.comment = entry.comment;
        if (entry.nags.length) node.nags = [...entry.nags];
        for (const variation of entry.variations) addLine(cursor, variation);
        cursor = node;
      }
    };
    addLine(tree.root, game.moves);
    tree.current = tree.root;
    return tree;
  }
}

function writeLine(from: TreeNode, forceNumber: boolean): string {
  const out: string[] = [];
  let node = from.children[0];
  let needNumber = forceNumber;
  let parent = from;
  while (node) {
    out.push(writeMove(node, parent.fen, needNumber));
    needNumber = false;
    // Variations of this move (siblings after it)
    const siblings = parent.children.slice(1);
    for (const sibling of siblings) {
      out.push(
        `(${writeMove(sibling, parent.fen, true)}${sibling.children.length ? ' ' + writeLine(sibling, false) : ''})`,
      );
      needNumber = true;
    }
    if (node.comment) needNumber = true;
    parent = node;
    node = node.children[0];
  }
  return out.join(' ');
}

function writeMove(node: TreeNode, parentFen: Fen, forceNumber: boolean): string {
  let text = moveNumberPrefix(parentFen, forceNumber) + node.san;
  for (const nag of node.nags) text += NAG_GLYPHS[nag] ?? ` $${nag}`;
  if (node.comment) text += ` {${node.comment.replace(/[{}]/g, '')}}`;
  return text;
}

function wrap(text: string, width = 80): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

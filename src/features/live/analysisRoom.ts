import type { Square } from 'chess.js';
import { parseUci } from '@/chess/helpers';
import { GameTree, type TreeNode } from '@/chess/tree';
import type { MoveInput } from '@/chess/types';
import type { DrawShape } from '@/components/board/Board';
import {
  ANALYSIS_ROOM,
  groupOptions,
  isPlayerName,
  LIMITS,
  MEMBER_PATTERN,
} from '../../../relay/src/live/shared.mjs';
import { createRelayGroup, type GroupKindClient } from './relayGroup';
import type {
  AnalysisEvent,
  AnalysisPending,
  AnalysisRoomSession,
  AnalysisRoomState,
  AnalysisRoomView,
  GroupOptions,
} from './types';

/**
 * A game analysed together, in a room on the relay (relay/src/live/analysisRoom.mjs),
 * from this device. The room keeps the tree of moves, checks every move, and
 * keeps the shared position; this side holds the same tree as a `GameTree`
 * (so the analysis board's own parts can show it), kept in step with the
 * room's messages, and plays this player's moves and steps at once on the
 * board while they go to the room.
 *
 * A device follows the shared position (`follow`): its board shows what the
 * others following see, and each step it takes moves the shared position for
 * everyone. Or it browses alone: its steps are its own, though a move it plays
 * still joins the room's tree. Steps through the moves go to the room no faster
 * than its message limits allow: a key held down sends where it ended up.
 */

/** The brushes the room keeps: the board's own, as a right click (and shift, alt) draws them. */
const BRUSHES: ReadonlySet<string> = new Set(ANALYSIS_ROOM.brushes);
const SQUARE = /^[a-h][1-8]$/;
/** Steps through the moves go to the room at most this often… */
const STEP_GAP_MS = 300;
/** …and only while this device has sent fewer than this many messages in the room's window. */
const WINDOW_BUDGET = LIMITS.rateMessages - 6;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const isNodeId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isMemberId = (value: unknown): value is string =>
  typeof value === 'string' && MEMBER_PATTERN.test(value);
const nameOf = (value: unknown): string | null => (isPlayerName(value) ? (value as string) : null);

/** Arrows and circles as the room keeps them: on real squares, in its brushes. */
export function shapesOf(value: unknown): DrawShape[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): DrawShape[] => {
    const { orig, dest, brush } = record(item);
    if (typeof orig !== 'string' || !SQUARE.test(orig)) return [];
    if (typeof brush !== 'string' || !BRUSHES.has(brush)) return [];
    const square = orig as Square;
    return typeof dest === 'string' && SQUARE.test(dest) && dest !== orig
      ? [{ orig: square, dest: dest as Square, brush }]
      : [{ orig: square, brush }];
  });
}

/** "12." or "12…": a move's number, as the move list writes it. */
export function moveNumber(node: TreeNode): string {
  const parts = (node.parent?.fen ?? '').split(' ');
  return `${parts[5] ?? '1'}${parts[1] === 'b' ? '…' : '.'}`;
}

/** "12. Nf3", "12… Nf6": a move with its number. */
const moveLabel = (node: TreeNode): string => `${moveNumber(node)} ${node.san}`;

/** Plays the room's move `uci` from `from` into the tree (or finds it there); null when it cannot. */
function attach(tree: GameTree, from: TreeNode, uci: string): TreeNode | null {
  const before = tree.current;
  tree.current = from;
  const node = tree.addMove(parseUci(uci), { navigate: false });
  tree.current = before;
  return node;
}

/**
 * The room's state from its snapshot: the variant, the start, the tree (its
 * nodes each `[id, parent, uci]`, every parent first), the shared position,
 * the drawings, the players and the result. Null when it is not one.
 */
export function analysisStateOf(
  value: unknown,
  before: AnalysisRoomState | null,
): AnalysisRoomState | null {
  const v = record(value);
  const variant =
    v.variant === 'chess960' ? 'chess960' : v.variant === 'standard' ? 'standard' : null;
  if (!variant || typeof v.fen !== 'string' || !Array.isArray(v.nodes)) return null;
  let tree: GameTree;
  try {
    tree = new GameTree(v.fen, variant);
    tree.rules.position(tree.startFen);
  } catch {
    return null;
  }
  const nodes = new Map<number, TreeNode>([[0, tree.root]]);
  const ids = new Map<TreeNode, number>([[tree.root, 0]]);
  for (const item of v.nodes as unknown[]) {
    if (!Array.isArray(item)) continue;
    const [id, parent, uci] = item as unknown[];
    if (!isNodeId(id) || !isNodeId(parent) || typeof uci !== 'string' || nodes.has(id)) continue;
    const from = nodes.get(parent);
    const node = from ? attach(tree, from, uci) : null;
    if (!node || ids.has(node)) continue;
    nodes.set(id, node);
    ids.set(node, id);
  }
  const shapes = new Map<number, DrawShape[]>();
  for (const [key, list] of Object.entries(record(v.shapes))) {
    const id = Number(key);
    const drawn = shapesOf(list);
    if (nodes.has(id) && drawn.length > 0) shapes.set(id, drawn);
  }
  return {
    variant,
    tree,
    version: (before?.version ?? 0) + 1,
    nodes,
    ids,
    at: isNodeId(v.at) && nodes.has(v.at) ? v.at : 0,
    shapes,
    white: nameOf(v.white),
    black: nameOf(v.black),
    result: typeof v.result === 'string' ? v.result : '*',
    last: before?.last ?? null,
  };
}

/**
 * The state after one of the room's messages (`before` is never changed but
 * for its tree and its maps, which change in place: `version` says so). Null
 * when the message changes nothing here, or does not fit (a snapshot follows).
 */
export function analysisChange(
  message: Record<string, unknown>,
  before: AnalysisRoomState | null,
): AnalysisRoomState | null {
  if (!before) return null;
  const by = isMemberId(message.by) ? message.by : '';
  const seq = (before.last?.seq ?? 0) + 1;
  const event = (words: string, move: AnalysisEvent['move'] = null): AnalysisEvent => ({
    seq,
    by,
    words,
    move,
  });
  const nodes = before.nodes as Map<number, TreeNode>;
  const ids = before.ids as Map<TreeNode, number>;
  switch (message.t) {
    case 'added': {
      const [id, parent, uci] = Array.isArray(message.node) ? (message.node as unknown[]) : [];
      if (!isNodeId(id) || !isNodeId(parent) || typeof uci !== 'string' || nodes.has(id)) {
        return null;
      }
      const from = nodes.get(parent);
      const node = from ? attach(before.tree, from, uci) : null;
      if (!from || !node || ids.has(node)) return null;
      nodes.set(id, node);
      ids.set(node, id);
      const go = message.at === true;
      return {
        ...before,
        version: before.version + 1,
        at: go ? id : before.at,
        last: event(`${go ? 'played' : 'added'} ${moveLabel(node)}`, { fen: from.fen, uci }),
      };
    }
    case 'at': {
      const at = message.node;
      const node = isNodeId(at) ? nodes.get(at) : undefined;
      if (!node || !isNodeId(at)) return null;
      return {
        ...before,
        at,
        last: event(node.parent ? `went to ${moveLabel(node)}` : 'went back to the start'),
      };
    }
    case 'deleted': {
      const node = isNodeId(message.node) ? nodes.get(message.node) : undefined;
      if (!node?.parent) return null;
      const words = `deleted ${moveLabel(node)}${node.children.length > 0 ? ' and the moves after it' : ''}`;
      before.tree.deleteNode(node);
      const shapes = new Map(before.shapes);
      const stack = [node];
      while (stack.length > 0) {
        const gone = stack.pop() as TreeNode;
        const id = ids.get(gone);
        if (id !== undefined) {
          nodes.delete(id);
          shapes.delete(id);
        }
        ids.delete(gone);
        stack.push(...gone.children);
      }
      const at = isNodeId(message.at) && nodes.has(message.at) ? message.at : 0;
      return { ...before, version: before.version + 1, at, shapes, last: event(words) };
    }
    case 'promoted': {
      const node = isNodeId(message.node) ? nodes.get(message.node) : undefined;
      if (!node?.parent) return null;
      before.tree.promoteToMain(node);
      return {
        ...before,
        version: before.version + 1,
        last: event(`made ${moveLabel(node)} the main line`),
      };
    }
    case 'shapes': {
      const on = message.node;
      const node = isNodeId(on) ? nodes.get(on) : undefined;
      if (!node || !isNodeId(on)) return null;
      const drawn = shapesOf(message.shapes);
      const shapes = new Map(before.shapes);
      if (drawn.length > 0) shapes.set(on, drawn);
      else shapes.delete(on);
      const after = node.parent ? `the position after ${moveLabel(node)}` : 'the start position';
      return {
        ...before,
        shapes,
        last: event(drawn.length > 0 ? `drew on ${after}` : `cleared the drawing on ${after}`),
      };
    }
    default:
      return null;
  }
}

const CLIENT: GroupKindClient<AnalysisRoomState> = {
  kind: 'analysis',
  read: analysisStateOf,
  message: analysisChange,
};

/** The moves of a tree from `from` on, as the room takes them: UCI, variations in brackets. */
function movesFrom(from: TreeNode, out: string[]): void {
  let parent = from;
  let node = parent.children[0];
  while (node) {
    out.push(node.uci);
    for (const variation of parent.children.slice(1)) {
      out.push('(', variation.uci);
      movesFrom(variation, out);
      out.push(')');
    }
    parent = node;
    node = node.children[0];
  }
}

/** How many moves a tree holds, and its longest line. */
function measure(root: TreeNode): { nodes: number; depth: number } {
  let nodes = 0;
  let depth = 0;
  const stack = [...root.children];
  while (stack.length > 0) {
    const node = stack.pop() as TreeNode;
    nodes += 1;
    depth = Math.max(depth, node.ply - root.ply);
    stack.push(...node.children);
  }
  return { nodes, depth };
}

/**
 * The options of a room for analysing `tree` together: its variant, its start,
 * its moves with their variations (the main line only when they would not all
 * fit, and only as far as a room's lines go), its result, and the players when
 * their names are the app's (a stranger's words never reach the others).
 */
export function analysisOptionsFor(tree: GameTree): GroupOptions {
  const { nodes, depth } = measure(tree.root);
  let moves: string[] = [];
  if (nodes <= ANALYSIS_ROOM.nodes && depth <= ANALYSIS_ROOM.depth) movesFrom(tree.root, moves);
  if (moves.length === 0 || moves.join(' ').length > ANALYSIS_ROOM.movesChars) {
    moves = tree
      .mainLine()
      .slice(0, ANALYSIS_ROOM.depth)
      .map((node) => node.uci);
  }
  const result = tree.headers.Result ?? tree.result;
  const opts: GroupOptions = {
    variant: tree.variant,
    fen: tree.startFen,
    moves: moves.join(' '),
    result: ANALYSIS_ROOM.results.includes(result) ? result : '*',
  };
  if (isPlayerName(tree.headers.White)) opts.white = tree.headers.White;
  if (isPlayerName(tree.headers.Black)) opts.black = tree.headers.Black;
  return groupOptions('analysis', opts) ?? { variant: tree.variant, fen: tree.startFen };
}

/** The connection to analysis room `id`. */
export function createAnalysisRoom(id: string): AnalysisRoomSession {
  const listeners = new Set<() => void>();
  let follow = true;
  /** The position shown, and its node (to find the nearest one left when it is deleted). */
  let viewed = 0;
  let viewedNode: TreeNode | null = null;
  let pending: AnalysisPending | null = null;
  /** Following: the step to send (it waits for the message limits), and the one sent. */
  let wantAt: number | null = null;
  let sentAt: number | null = null;
  let lastStep = 0;
  let stepTimer: ReturnType<typeof setTimeout> | null = null;
  /** When this device sent its recent messages, against the room's limits. */
  let sentTimes: number[] = [];
  let closed = false;

  const group = createRelayGroup<AnalysisRoomState>(id, CLIENT, (_view, snapshot) => {
    if (!snapshot) return;
    // The room as it stands: a move or a step on its way may have been lost with the connection.
    pending = null;
    sentAt = null;
    refresh();
  });

  let view: AnalysisRoomView = { ...group.getView(), follow, viewed, pending };

  /** Brings what this device shows in line with the room. */
  function settle(): void {
    const state = group.getView().state;
    if (!state) return;
    if (pending) {
      const from = state.nodes.get(pending.from);
      const landed = from?.children.find((child) => child.uci === pending?.uci);
      if (!from) pending = null;
      else if (landed) {
        pending = null;
        // Browsing alone, the move this device played is where it goes on.
        if (!follow) viewed = state.ids.get(landed) ?? viewed;
      }
    }
    if (sentAt !== null && (sentAt === state.at || !state.nodes.has(sentAt))) sentAt = null;
    if (wantAt !== null && !state.nodes.has(wantAt)) wantAt = null;
    if (follow) {
      viewed = wantAt ?? sentAt ?? state.at;
    } else if (!state.nodes.has(viewed)) {
      // Deleted while this device was looking at it: the nearest position left.
      let cursor = viewedNode?.parent ?? null;
      while (cursor && !state.ids.has(cursor)) cursor = cursor.parent;
      viewed = cursor ? (state.ids.get(cursor) ?? state.at) : state.at;
    }
    viewedNode = state.nodes.get(viewed) ?? null;
  }

  function refresh(): void {
    settle();
    const next: AnalysisRoomView = { ...group.getView(), follow, viewed, pending };
    const changed = (Object.keys(next) as (keyof AnalysisRoomView)[]).some(
      (key) => next[key] !== view[key],
    );
    if (!changed) return;
    view = next;
    for (const listener of [...listeners]) listener();
  }

  group.subscribe(refresh);

  /** Sends a message of the room's kind, counted against its limits. */
  function send(message: Record<string, unknown>): boolean {
    if (!group.send(message)) return false;
    sentTimes.push(Date.now());
    return true;
  }

  /** Sends the step waiting, once the limits allow. */
  function step(): void {
    if (closed || wantAt === null) return;
    const now = Date.now();
    sentTimes = sentTimes.filter((at) => now - at < LIMITS.rateWindowMs);
    const wait = Math.max(
      lastStep + STEP_GAP_MS - now,
      sentTimes.length >= WINDOW_BUDGET ? (sentTimes[0] ?? now) + LIMITS.rateWindowMs - now : 0,
    );
    if (wait > 0) {
      stepTimer ??= setTimeout(() => {
        stepTimer = null;
        step();
      }, wait);
      return;
    }
    const node = wantAt;
    wantAt = null;
    // Back where the room is, with no other step on its way: nothing to say.
    const there = node === group.getView().state?.at && sentAt === null;
    if (!there && send({ t: 'at', node })) {
      sentAt = node;
      lastStep = now;
    }
    refresh();
  }

  const member = () => group.getView().you !== null;

  function goTo(node: number): void {
    const state = group.getView().state;
    if (closed || !state?.nodes.has(node) || pending) return;
    // Someone only looking cannot move the shared position: they browse alone.
    if (follow && !member()) follow = false;
    if (follow) {
      wantAt = node;
      step();
    } else {
      viewed = node;
    }
    refresh();
  }

  function play(move: MoveInput): boolean {
    const state = group.getView().state;
    const from = state?.nodes.get(viewed);
    if (closed || !state || !from || pending) return false;
    const played = state.tree.rules.play(from.fen, move);
    if (!played) return false;
    const known = from.children.find((child) => child.uci === played.uci);
    const knownId = known ? state.ids.get(known) : undefined;
    if (knownId !== undefined) {
      goTo(knownId);
      return true;
    }
    if (!member()) {
      group.setError('Join the room to add moves.');
      return false;
    }
    if (!send({ t: 'move', node: viewed, uci: played.uci, go: follow })) return false;
    // The move takes the shared position with it: no step need go before it.
    if (follow) wantAt = null;
    pending = {
      from: viewed,
      uci: played.uci,
      fen: played.after,
      lastMove: [played.from, played.to],
    };
    refresh();
    return true;
  }

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    join: () => group.join(),
    leave: () => group.leave(),
    say: (phrase) => group.say(phrase),
    setFollow(on) {
      if (closed || on === follow) return;
      follow = on;
      wantAt = null;
      refresh();
    },
    goTo,
    play,
    remove(node) {
      if (!closed && node !== 0) send({ t: 'delete', node });
    },
    promote(node) {
      if (!closed && node !== 0) send({ t: 'promote', node });
    },
    draw(node, shapes) {
      if (closed || !member()) return;
      const kept = shapesOf(shapes).slice(0, ANALYSIS_ROOM.shapes);
      send({ t: 'shapes', node, shapes: kept });
    },
    close() {
      if (closed) return;
      closed = true;
      if (stepTimer !== null) clearTimeout(stepTimer);
      stepTimer = null;
      group.close();
    },
  };
}

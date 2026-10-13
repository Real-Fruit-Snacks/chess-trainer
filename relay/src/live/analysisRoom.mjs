/**
 * A game analysed together, in a room of up to eight (a kind of group room:
 * group.mjs runs the room, this module the analysis in it). The room keeps a
 * tree of moves from a start position, checks every move against the rules
 * (standard chess on chess.js, Chess960 on chessops: chess960.mjs, castling
 * as the king taking its own rook), and keeps the shared position, the node
 * the members who follow it are on. Arrows and circles drawn on a position
 * are kept with it, for everyone.
 *
 * A room is made with its variant, its start position and its moves (UCI,
 * variations in brackets as a PGN's: "e2e4 e7e5 ( c7c5 ) g1f3"), each played
 * through here: by a member from the analysis board (through the waiting
 * room's `create-room`), or by the room of a game that has ended, under an id
 * derived from the game's (room.mjs; `analysisRoomId` in shared.mjs).
 *
 * A member may play a move from any node (`move`): it joins the tree as that
 * node's last child (or is found there already), and, unless they browse
 * alone (`go: false`), the shared position moves to it (`added` says both at
 * once). They may move the
 * shared position (`at`), make a node's line the main line (`promote`), and set
 * a node's arrows and circles (`shapes`; none clears them). Only the host may
 * delete a node and everything after it (`delete`): anyone with the link can
 * join, and a deletion takes everyone's work with it. Everything is public:
 * each change goes to everyone in the room as it happens, and the snapshot
 * holds the whole tree.
 *
 * The tree is plain data: its nodes, each with its parent, its move and its
 * children in order (the first is the main line), the root (node 0) the start
 * position. Positions are worked out from the moves when needed, and kept in
 * memory only.
 */
import { Chess } from 'chess.js';
import { Chess960Game } from './chess960.mjs';
import { playUci } from './rules.mjs';
import { ANALYSIS_ROOM, groupOptions } from './shared.mjs';

/**
 * @typedef {{ orig: string, dest?: string, brush: string }} Shape
 *   An arrow from `orig` to `dest`, or a circle on `orig`, in one of the board's brushes.
 *
 * @typedef {{ id: number, parent: number, uci: string, children: number[], shapes?: Shape[] }} AnalysisNode
 *   A position: the move that leads to it from `parent` (the root, node 0, has
 *   none and parent -1), and the moves played from it, the main line first.
 *
 * @typedef {{
 *   variant: 'standard' | 'chess960',
 *   fen: string,
 *   white: string | null,
 *   black: string | null,
 *   result: string,
 *   nodes: AnalysisNode[],
 *   next: number,
 *   at: number,
 * }} AnalysisState
 *   `nodes` in the order they were made, the root first; `next` the id the next
 *   node gets (ids are never used twice); `at` the shared position.
 *
 * @typedef {import('./group.mjs').GroupContext} GroupContext
 * @typedef {import('./rules.mjs').RulesGame} RulesGame
 */

const SQUARE = /^[a-h][1-8]$/;

/** The position a FEN gives, by the variant's rules; null when it is not a legal one. */
function load(/** @type {string} */ variant, /** @type {string} */ fen) {
  try {
    return /** @type {RulesGame} */ (
      variant === 'chess960' ? new Chess960Game(fen) : new Chess(fen)
    );
  } catch {
    return null;
  }
}

/** The nodes by id. @param {AnalysisState} s */
const index = (s) => new Map(s.nodes.map((node) => [node.id, node]));

/**
 * Each room's positions by node id, worked out as they are needed and kept
 * while the room is in memory (a room woken from storage works them out again).
 * @type {WeakMap<AnalysisState, Map<number, string>>}
 */
const positions = new WeakMap();

/**
 * The FEN of node `id`: played through from the nearest node whose position
 * is known. Null for a node that is not there.
 * @param {AnalysisState} s
 * @param {Map<number, AnalysisNode>} byId
 * @param {number} id
 */
function fenAt(s, byId, id) {
  let known = positions.get(s);
  if (!known) {
    known = new Map([[0, s.fen]]);
    positions.set(s, known);
  }
  /** @type {AnalysisNode[]} */
  const path = [];
  let cursor = byId.get(id);
  while (cursor && !known.has(cursor.id)) {
    path.push(cursor);
    cursor = byId.get(cursor.parent);
  }
  if (!cursor) return null;
  let fen = /** @type {string} */ (known.get(cursor.id));
  for (const node of path.reverse()) {
    const game = load(s.variant, fen);
    if (!game || !playUci(game, node.uci)) return null;
    fen = game.fen();
    known.set(node.id, fen);
  }
  return fen;
}

/** How many moves lead from the start to node `id`. */
function depthOf(/** @type {Map<number, AnalysisNode>} */ byId, /** @type {number} */ id) {
  let depth = 0;
  let cursor = byId.get(id);
  while (cursor && cursor.parent >= 0) {
    depth += 1;
    cursor = byId.get(cursor.parent);
  }
  return depth;
}

/**
 * Plays `uci` from node `from`: the node it leads to (found among the
 * children, or `added`), or why it cannot be played: not legal there (or no
 * such node), or the tree is full, or the line too long.
 * @param {AnalysisState} s
 * @param {Map<number, AnalysisNode>} byId
 * @param {number} from
 * @param {unknown} uci
 * @returns {{ node: AnalysisNode, added: boolean } | { error: 'illegal' | 'full' | 'deep' }}
 */
function play(s, byId, from, uci) {
  const parent = byId.get(from);
  const fen = parent ? fenAt(s, byId, from) : null;
  const game = fen ? load(s.variant, fen) : null;
  const move = game ? playUci(game, uci) : null;
  if (!parent || !game || !move) return { error: 'illegal' };
  // A piece named for a move that promotes nothing is not that move (chess.js would let it be).
  const played = `${move.from}${move.to}${move.promotion ?? ''}`;
  if (played !== uci) return { error: 'illegal' };
  const known = parent.children.map((id) => byId.get(id)).find((node) => node?.uci === played);
  if (known) return { node: known, added: false };
  if (s.nodes.length - 1 >= ANALYSIS_ROOM.nodes) return { error: 'full' };
  if (depthOf(byId, from) + 1 > ANALYSIS_ROOM.depth) return { error: 'deep' };
  /** @type {AnalysisNode} */
  const node = { id: s.next, parent: from, uci: played, children: [] };
  s.next += 1;
  s.nodes.push(node);
  parent.children.push(node.id);
  byId.set(node.id, node);
  positions.get(s)?.set(node.id, game.fen());
  return { node, added: true };
}

/**
 * Plays a room's moves into its tree from the root: UCI moves, each from the
 * one before, and variations in brackets, each an alternative to the move
 * before it (as in a PGN). False when one is not legal, the brackets do not
 * match, or the tree would be too large.
 * @param {AnalysisState} s
 * @param {string} text
 */
function plant(s, text) {
  const tokens = text.replace(/[()]/g, ' $& ').split(' ').filter(Boolean);
  const byId = index(s);
  /** The node the next move is played from, and the last move played (null at a variation's start). */
  let from = 0;
  /** @type {number | null} */
  let last = null;
  /** @type {{ from: number, last: number | null }[]} */
  const stack = [];
  for (const token of tokens) {
    if (token === '(') {
      if (last === null) return false;
      stack.push({ from, last });
      from = /** @type {AnalysisNode} */ (byId.get(last)).parent;
      last = null;
    } else if (token === ')') {
      const back = stack.pop();
      if (!back) return false;
      ({ from, last } = back);
    } else {
      const played = play(s, byId, from, token);
      if ('error' in played) return false;
      from = played.node.id;
      last = played.node.id;
    }
  }
  return stack.length === 0;
}

/**
 * A room's state from its options (checked by `groupOptions`), its moves
 * played through; null when they cannot be.
 * @param {Record<string, string | number>} o
 * @returns {AnalysisState | null}
 */
function build(o) {
  const variant = o.variant === 'chess960' ? 'chess960' : 'standard';
  const fen = String(o.fen);
  if (!load(variant, fen)) return null;
  /** @type {AnalysisState} */
  const s = {
    variant,
    fen,
    white: typeof o.white === 'string' ? o.white : null,
    black: typeof o.black === 'string' ? o.black : null,
    result: typeof o.result === 'string' ? o.result : '*',
    nodes: [{ id: 0, parent: -1, uci: '', children: [] }],
    next: 1,
    at: 0,
  };
  return plant(s, String(o.moves ?? '')) ? s : null;
}

/**
 * The trees built while checking options, for `create` to take rather than
 * play every move through again.
 * @type {WeakMap<object, AnalysisState>}
 */
const built = new WeakMap();

/** A room's options, checked down to every move; null when they are not an analysis. */
function options(/** @type {unknown} */ opts) {
  const o = groupOptions('analysis', opts);
  const s = o ? build(o) : null;
  if (!o || !s) return null;
  built.set(o, s);
  return o;
}

/**
 * A node's arrows and circles as a member sends them, checked: at most
 * `ANALYSIS_ROOM.shapes`, on real squares, in the board's brushes, each once.
 * Null when they are not.
 * @param {unknown} value
 * @returns {Shape[] | null}
 */
function shapesOf(value) {
  if (!Array.isArray(value) || value.length > ANALYSIS_ROOM.shapes) return null;
  /** @type {Shape[]} */
  const shapes = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const { orig, dest, brush } = /** @type {Record<string, unknown>} */ (item);
    if (typeof orig !== 'string' || !SQUARE.test(orig)) return null;
    if (dest != null && (typeof dest !== 'string' || !SQUARE.test(dest))) return null;
    if (typeof brush !== 'string' || !ANALYSIS_ROOM.brushes.includes(brush)) return null;
    /** @type {Shape} */
    const shape =
      typeof dest === 'string' && dest !== orig ? { orig, dest, brush } : { orig, brush };
    if (shapes.some((other) => other.orig === shape.orig && other.dest === shape.dest)) continue;
    shapes.push(shape);
  }
  return shapes;
}

/** A node id as a message carries it, or null. */
const nodeId = (/** @type {unknown} */ value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/**
 * Everything in the room, for its snapshot: the tree's nodes in order, each
 * `[id, parent, uci]`, every parent before its children and the main line
 * first; the shared position; the arrows and circles by node.
 * @param {AnalysisState} s
 */
function view(s) {
  const byId = index(s);
  /** @type {[number, number, string][]} */
  const nodes = [];
  const stack = [...(byId.get(0)?.children ?? [])].reverse();
  while (stack.length > 0) {
    const node = byId.get(/** @type {number} */ (stack.pop()));
    if (!node) continue;
    nodes.push([node.id, node.parent, node.uci]);
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(/** @type {number} */ (node.children[i]));
    }
  }
  /** @type {Record<string, Shape[]>} */
  const shapes = {};
  for (const node of s.nodes) if (node.shapes?.length) shapes[node.id] = node.shapes;
  return {
    variant: s.variant,
    fen: s.fen,
    white: s.white,
    black: s.black,
    result: s.result,
    nodes,
    at: s.at,
    shapes,
  };
}

const REFUSALS = {
  illegal: 'That move is not legal there.',
  full: 'The analysis holds all the moves it can: delete a variation first.',
  deep: 'That line is as long as a line here can be.',
};

/**
 * The analysis room, as group.mjs takes a kind (see `GroupKindModule` there).
 * @type {import('./group.mjs').GroupKindModule<AnalysisState>}
 */
export const analysisRoom = {
  options,

  create: (opts) => {
    const s = built.get(opts) ?? build(opts);
    built.delete(opts);
    if (!s) throw new Error('Not an analysis.');
    return s;
  },

  view: (s) => view(s),

  deadline: () => null,

  // A step through the tree, or a drawing, is written with the room's other light changes;
  // a move added, a delete or a promote changes the tree, and is written at once.
  light: (msg) => msg.t === 'at' || msg.t === 'shapes',

  message(ctx, conn, s, sender, msg) {
    const by = sender.id;
    const byId = index(s);
    const id = nodeId(msg.node);
    const node = id === null ? undefined : byId.get(id);
    switch (msg.t) {
      case 'move': {
        if (!node) {
          ctx.refuse(conn, 'bad-request', 'That position is no longer in the analysis.');
          return true;
        }
        const played = play(s, byId, node.id, msg.uci);
        if ('error' in played) {
          ctx.refuse(
            conn,
            played.error === 'illegal' ? 'illegal' : 'limit',
            REFUSALS[played.error],
          );
          return true;
        }
        // Browsing alone (`go: false`): the move joins the tree, and the shared position stays.
        const go = msg.go !== false && s.at !== played.node.id;
        if (go) s.at = played.node.id;
        if (played.added) {
          const added = [played.node.id, node.id, played.node.uci];
          ctx.announce({ t: 'added', node: added, at: go, by });
        } else if (go) {
          ctx.announce({ t: 'at', node: s.at, by });
        }
        return true;
      }
      case 'at': {
        if (!node) {
          ctx.refuse(conn, 'bad-request', 'That position is no longer in the analysis.');
          return true;
        }
        if (s.at !== node.id) {
          s.at = node.id;
          ctx.announce({ t: 'at', node: s.at, by });
        }
        return true;
      }
      case 'delete': {
        // Deleting takes the work of everyone in the room with it: the host's alone.
        if (!sender.host) {
          ctx.refuse(conn, 'not-host', 'Only the host can delete moves.');
          return true;
        }
        if (!node || node.id === 0) {
          ctx.refuse(conn, 'bad-request', 'That move is no longer in the analysis.');
          return true;
        }
        /** @type {Set<number>} */
        const gone = new Set();
        const stack = [node.id];
        while (stack.length > 0) {
          const next = byId.get(/** @type {number} */ (stack.pop()));
          if (!next) continue;
          gone.add(next.id);
          stack.push(...next.children);
        }
        const parent = /** @type {AnalysisNode} */ (byId.get(node.parent));
        parent.children = parent.children.filter((child) => child !== node.id);
        s.nodes = s.nodes.filter((n) => !gone.has(n.id));
        const known = positions.get(s);
        for (const n of gone) known?.delete(n);
        if (gone.has(s.at)) s.at = parent.id;
        ctx.announce({ t: 'deleted', node: node.id, at: s.at, by });
        return true;
      }
      case 'promote': {
        if (!node || node.id === 0) {
          ctx.refuse(conn, 'bad-request', 'That move is no longer in the analysis.');
          return true;
        }
        // Its line becomes the main line: each move on it first among its parent's.
        let changed = false;
        let cursor = node;
        while (cursor.parent >= 0) {
          const parent = /** @type {AnalysisNode} */ (byId.get(cursor.parent));
          if (parent.children[0] !== cursor.id) {
            const moved = cursor.id;
            parent.children = [moved, ...parent.children.filter((child) => child !== moved)];
            changed = true;
          }
          cursor = parent;
        }
        if (changed) ctx.announce({ t: 'promoted', node: node.id, by });
        return true;
      }
      case 'shapes': {
        const shapes = shapesOf(msg.shapes);
        if (!node || !shapes) {
          ctx.refuse(conn, 'bad-request', 'Those arrows cannot be drawn there.');
          return true;
        }
        const drawn = s.nodes.reduce((sum, n) => sum + (n.shapes?.length ?? 0), 0);
        if (drawn - (node.shapes?.length ?? 0) + shapes.length > ANALYSIS_ROOM.allShapes) {
          ctx.refuse(conn, 'limit', 'The analysis holds all the arrows it can: clear some first.');
          return true;
        }
        if (shapes.length > 0) node.shapes = shapes;
        else delete node.shapes;
        ctx.announce({ t: 'shapes', node: node.id, shapes, by });
        return true;
      }
      default:
        return false;
    }
  },

  timer: () => undefined,
};

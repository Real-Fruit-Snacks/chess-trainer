import { START_FEN } from '@/chess/helpers';
import { parsePgn, splitPgnGames } from '@/chess/pgn';
import { GameTree, type TreeNode } from '@/chess/tree';
import type { StudyLink } from '@/store/lichess';
import { cutUnits, fullCleanUp, softCleanUp } from './lichessNames';

/**
 * Repertoires and saved analyses kept in private Lichess studies: the model
 * and the rules, with no network code (see `studies.ts` for the requests).
 *
 * Each custom repertoire is a chapter of the study "Chess Trainer ·
 * Repertoires"; each saved analysis a chapter of "Chess Trainer · Analyses:
 * <collection>". A study holds at most 64 chapters, so a list that outgrows
 * one continues in "… (2)", "… (3)".
 *
 * Changes are found by comparing each side with how it looked when the two
 * last agreed (a link remembers a hash of each side's content), so the
 * small rewrites Lichess makes to a PGN never look like edits.
 */
export const STUDY_PREFIX = 'Chess Trainer · ';
export const REPERTOIRE_GROUP = 'Repertoires';
const REPERTOIRE_STUDY = `${STUDY_PREFIX}${REPERTOIRE_GROUP}`;
const ANALYSIS_STUDY = `${STUDY_PREFIX}Analyses: `;
/** Lichess's limit on chapters per study. */
export const MAX_CHAPTERS = 64;
/** Lichess's limits on one chapter: moves in the whole tree, and the PGN's length. */
export const MAX_CHAPTER_NODES = 3_000;
export const MAX_CHAPTER_PGN = 100_000;
/** Lichess keeps the first 80 characters of a chapter name (and 100 of a study name). */
export const MAX_NAME = 80;
/** A collection name as it fits in a study name (prefix, name and part number). */
const MAX_GROUP = 64;

export type StudyKind = 'repertoire' | 'analysis';

/** A repertoire or an analysis on this device, as the sync sees it. */
export interface SyncItem {
  /** `rep:<id>` or `ana:<id>`. */
  key: string;
  kind: StudyKind;
  /** The repertoire list, or the analysis's collection (fitted, see `fitGroup`). */
  group: string;
  name: string;
  /** A repertoire's side; analyses face White. */
  color: 'white' | 'black';
  /** The PGN to send: moves, variations and comments, the start position when not the usual one. */
  pgn: string;
  startFen: string;
  hash: string;
  movesHash: string;
  /** Within Lichess's limits for a chapter (an item that is not stays on this device). */
  fits: boolean;
  /** No moves from the usual start (not sent until it has some). */
  blank: boolean;
}

/** A chapter of one of the app's studies, as Lichess exported it. */
export interface RemoteChapter {
  studyId: string;
  chapterId: string;
  kind: StudyKind;
  group: string;
  name: string;
  color: 'white' | 'black';
  pgn: string;
  startFen: string;
  hash: string;
  movesHash: string;
  /** No moves from the usual start: Lichess's blank first chapter, never pulled. */
  blank: boolean;
}

/** One of the app's studies on Lichess. */
export interface AppStudy {
  id: string;
  kind: StudyKind;
  group: string;
  part: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Names                                                              */
/* ------------------------------------------------------------------ */

/**
 * Text as it can travel: on one line, without the backslashes and straight
 * double quotes a PGN tag would have to escape.
 */
const tidy = (text: string) => text.replace(/\s+/g, ' ').replace(/\\/g, '/').replace(/"/g, "'");

/**
 * A collection's name as it can appear in a study name: as Lichess would
 * clean it (emoji and symbols go), short enough for the name's 100 characters.
 */
export function fitGroup(group: string): string {
  return cutUnits(tidy(fullCleanUp(tidy(group))), MAX_GROUP).trim();
}

/**
 * The study holding part `part` (1-based) of a list. The first part has no
 * number, unless the collection's own name ends like one ("Games (2)" is
 * written "Games (2) (1)", so it never reads as part 2 of "Games").
 */
export function studyName(kind: StudyKind, group: string, part: number): string {
  if (kind === 'repertoire') return `${REPERTOIRE_STUDY}${part > 1 ? ` (${part})` : ''}`;
  const fitted = fitGroup(group);
  const numbered = part > 1 || / \(\d+\)$/.test(fitted);
  return `${ANALYSIS_STUDY}${fitted}${numbered ? ` (${part})` : ''}`;
}

/** What a study name says, or null for a study that is not one of the app's. */
export function parseStudyName(
  name: string,
): { kind: StudyKind; group: string; part: number } | null {
  const repertoire = /^Chess Trainer · Repertoires(?: \((\d+)\))?$/.exec(name);
  if (repertoire) {
    return { kind: 'repertoire', group: REPERTOIRE_GROUP, part: Number(repertoire[1] ?? 1) };
  }
  const analysis = /^Chess Trainer · Analyses: (.+?)(?: \((\d+)\))?$/.exec(name);
  const group = analysis?.[1]?.trim();
  if (group) {
    return { kind: 'analysis', group: fitGroup(group), part: Number(analysis?.[2] ?? 1) };
  }
  return null;
}

/** A chapter name as Lichess keeps it (cleaned as Lichess cleans it, at most 80 characters). */
export function fitName(name: string): string {
  return cutUnits(tidy(softCleanUp(tidy(name))), MAX_NAME).trim() || 'Untitled';
}

/* ------------------------------------------------------------------ */
/* Content                                                            */
/* ------------------------------------------------------------------ */

/** 53-bit string hash (cyrb53), as hex: enough to tell one version of an item from another. */
export function hash53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const cleanText = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * A start position as both sides agree on it: the placement and the side to
 * move (move counters, castling flags and en passant squares are written
 * differently by different programs).
 */
export function positionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 2).join(' ');
}

/** Arrows and coloured squares are content; clocks and evaluations are not. */
function shapes(node: TreeNode): string {
  const kept = (node.commands ?? [])
    .filter((c) => c.name === 'cal' || c.name === 'csl')
    .map(
      (c) =>
        `${c.name}:${c.args
          .split(',')
          .map((a) => a.trim())
          .sort()
          .join(',')}`,
    )
    .sort();
  return kept.length ? `[${kept.join(';')}]` : '';
}

/** One move as text: the move, and (optionally) its glyphs, comments and shapes. */
function moveText(node: TreeNode, annotations: boolean): string {
  let text = node.san;
  if (annotations) {
    if (node.nags.length) text += `$${[...node.nags].sort((a, b) => a - b).join('$')}`;
    const before = cleanText(node.commentBefore);
    const after = cleanText(node.comment);
    if (before) text += `<${before}>`;
    if (after) text += `{${after}}`;
    text += shapes(node);
  }
  return text;
}

/**
 * The tree below `root` as text, PGN-like: each line in order, with the
 * alternatives to a move in brackets just before it. Lines are walked in a
 * loop and only side lines nest, so a very long game cannot run out of stack.
 */
function encode(root: TreeNode, annotations: boolean): string {
  const out: string[] = [];
  const alternatives = (others: readonly TreeNode[]) => {
    for (const other of others) {
      out.push('(');
      line(other);
      out.push(')');
    }
  };
  const line = (first: TreeNode) => {
    let node: TreeNode | undefined = first;
    while (node) {
      out.push(moveText(node, annotations));
      alternatives(node.children.slice(1));
      node = node.children[0];
    }
  };
  const [first, ...others] = root.children;
  alternatives(others);
  if (first) line(first);
  return out.join(' ');
}

export interface TreeContent {
  startFen: string;
  /** Moves, variations, comments, glyphs and shapes. */
  hash: string;
  /** The moves and variations alone (to recognise the same item on both sides). */
  movesHash: string;
  /** The PGN to store or send: no tags except the start position. */
  pgn: string;
  /** Main-line moves. */
  moves: number;
  /** Moves in the whole tree, variations included (what Lichess counts). */
  nodes: number;
  blank: boolean;
}

function countNodes(root: TreeNode): number {
  let count = 0;
  const waiting = [...root.children];
  for (let node = waiting.pop(); node; node = waiting.pop()) {
    count++;
    waiting.push(...node.children);
  }
  return count;
}

/** Reads a PGN into the sync's view of it; null when it cannot be read. */
export function treeContent(pgn: string): TreeContent | null {
  let tree: GameTree;
  try {
    tree = GameTree.fromPgn(pgn);
  } catch {
    return null;
  }
  return contentOfTree(tree);
}

export function contentOfTree(tree: GameTree): TreeContent {
  const startFen = tree.startFen;
  const rootComment = cleanText(tree.root.comment);
  const moves = encode(tree.root, false);
  const full = encode(tree.root, true);
  // A copy without the source's tags: the chapter name travels separately.
  const clean = tree.clone();
  clean.headers = {};
  clean.result = '*';
  const start = positionKey(startFen);
  return {
    startFen,
    hash: hash53(`${start}|${rootComment}|${shapes(tree.root)}|${full}`),
    movesHash: hash53(`${start}|${moves}`),
    pgn: clean.toPgn(),
    moves: tree.mainLine().length,
    nodes: countNodes(tree.root),
    blank: moves === '' && startFen === START_FEN,
  };
}

/** Whether an item can be a Lichess chapter (the PGN measured as `chapterPgn` writes it, roughly). */
export function fitsChapter(content: Pick<TreeContent, 'nodes' | 'pgn'>, name: string): boolean {
  return (
    content.nodes <= MAX_CHAPTER_NODES &&
    content.pgn.length + fitName(name).length + 64 <= MAX_CHAPTER_PGN
  );
}

/** The PGN of one chapter to import: its name in a `ChapterName` tag, which Lichess reads. */
export function chapterPgn(item: Pick<SyncItem, 'name' | 'pgn'>): string {
  const tree = GameTree.fromPgn(item.pgn);
  tree.headers = {};
  tree.result = '*';
  return tree.toPgn({ ChapterName: fitName(item.name) });
}

export interface StudyExport {
  chapters: RemoteChapter[];
  /** Chapters this app cannot read (`studyId/chapterId`): left alone, never taken as deleted. */
  unreadable: string[];
}

const CHAPTER_URL = /\/study\/([A-Za-z0-9]{8})\/([A-Za-z0-9]{8})/;

/** The chapters in a study's PGN export (each with the id from its `ChapterURL` tag). */
export function chaptersFromExport(study: AppStudy, text: string): StudyExport {
  const chapters: RemoteChapter[] = [];
  const unreadable: string[] = [];
  for (const chunk of splitPgnGames(text)) {
    const url = CHAPTER_URL.exec(/\[ChapterURL "([^"]*)"\]/.exec(chunk)?.[1] ?? '');
    const chapterId = url?.[2];
    if (url?.[1] !== study.id || !chapterId) continue;
    let tree: GameTree;
    let headers: Record<string, string>;
    try {
      const game = parsePgn(chunk);
      headers = game.headers;
      tree = GameTree.fromParsed(game);
    } catch {
      unreadable.push(`${study.id}/${chapterId}`);
      continue;
    }
    const content = contentOfTree(tree);
    const eventName = (headers.Event ?? '').split(': ').slice(1).join(': ');
    chapters.push({
      studyId: study.id,
      chapterId,
      kind: study.kind,
      group: study.group,
      name: fitName(headers.ChapterName ?? eventName),
      color: headers.Orientation === 'black' ? 'black' : 'white',
      pgn: content.pgn,
      startFen: content.startFen,
      hash: content.hash,
      movesHash: content.movesHash,
      blank: content.blank,
    });
  }
  return { chapters, unreadable };
}

/* ------------------------------------------------------------------ */
/* Reconciling                                                        */
/* ------------------------------------------------------------------ */

export type SyncAction =
  /** A chapter new to this device becomes an item (`replacesKey`: the item it restores). */
  | { type: 'pull-new'; chapter: RemoteChapter; name: string; replacesKey?: string }
  /** The chapter changed on Lichess: the item takes its content, name and side. */
  | { type: 'pull-update'; key: string; chapter: RemoteChapter }
  /** The chapter was deleted on Lichess and the item is as it was: it goes here too. */
  | { type: 'pull-delete'; key: string }
  /** An item new to Lichess becomes a chapter. */
  | { type: 'push-new'; item: SyncItem; replacesKey?: string }
  /** The item's moves changed: they replace the chapter's. */
  | { type: 'push-update'; item: SyncItem; link: StudyLink }
  /** The item's name, list, side or start changed: a new chapter replaces the old one. */
  | { type: 'push-replace'; item: SyncItem; link: StudyLink }
  /** The item was deleted here: its chapter goes. */
  | { type: 'push-delete'; key: string; link: StudyLink }
  /** The same item on both sides, not yet known to be: they are linked as they are. */
  | { type: 'link'; item: SyncItem; chapter: RemoteChapter }
  | { type: 'unlink'; key: string };

export interface ReconcileInput {
  items: readonly SyncItem[];
  /** The chapters of every study that could be read in full. */
  chapters: readonly RemoteChapter[];
  links: Readonly<Record<string, StudyLink>>;
  /** Every app study Lichess listed (read or not). */
  listed: ReadonlySet<string>;
  /** The studies whose chapters are all in `chapters` (or `frozen`). */
  read: ReadonlySet<string>;
  /**
   * Chapters to leave as they are (`studyId/chapterId`): ones this app cannot
   * read, and ones holding an item that stays on this device for now.
   */
  frozen?: ReadonlySet<string>;
  /** Linked items the learner deleted here; any other missing item was lost and comes back. */
  deleted?: ReadonlySet<string>;
}

/** Name of the copy kept here when an item changed on both sides. */
export function copyName(name: string): string {
  return fitName(`${name} (Lichess)`);
}

/**
 * The remote hash of a link made by sending an item, before Lichess's own
 * version of the chapter was read: the moves sent, which is all that can be
 * compared until then.
 */
export function pendingRemoteHash(movesHash: string): string {
  return `?${movesHash}`;
}

/** Whether a chapter differs from how it looked when the link was made. */
function chapterChanged(link: StudyLink, chapter: RemoteChapter): boolean {
  const content = link.remoteHash.startsWith('?')
    ? chapter.movesHash !== link.remoteHash.slice(1)
    : chapter.hash !== link.remoteHash;
  return (
    content ||
    chapter.name !== link.name ||
    (chapter.kind === 'repertoire' && chapter.color !== link.color)
  );
}

const sameItemShape = (
  item: SyncItem,
  chapter: Pick<RemoteChapter, 'name' | 'color' | 'startFen'>,
) =>
  fitName(item.name) === chapter.name &&
  (item.kind !== 'repertoire' || item.color === chapter.color) &&
  positionKey(item.startFen) === positionKey(chapter.startFen);

/**
 * Decides what to do with every item and chapter. Each side is compared with
 * how it looked at the last agreement: a change on one side wins; changes on
 * both keep both (the Lichess version becomes a copy here). A chapter deleted
 * on Lichess deletes an unchanged item; an item deleted here deletes an
 * unchanged chapter (an item missing here that was not deleted — a damaged
 * save — comes back from its chapter). A study that is gone from Lichess is created again —
 * the device never loses data because a whole study disappeared — and a
 * study that could not be read changes nothing.
 */
export function reconcile({
  items,
  chapters,
  links,
  listed,
  read,
  frozen = new Set(),
  deleted = new Set(),
}: ReconcileInput): SyncAction[] {
  const actions: SyncAction[] = [];
  const itemByKey = new Map(items.map((i) => [i.key, i]));
  const chapterById = new Map(chapters.map((c) => [`${c.studyId}/${c.chapterId}`, c]));
  const linkedChapters = new Set<string>();

  for (const [key, link] of Object.entries(links)) {
    const where = `${link.studyId}/${link.chapterId}`;
    linkedChapters.add(where);
    if (frozen.has(where)) continue;
    const item = itemByKey.get(key);
    const chapter = chapterById.get(where);
    const studyRead = read.has(link.studyId);
    const studyGone = !listed.has(link.studyId);
    const localChanged =
      !!item &&
      (item.hash !== link.localHash ||
        fitName(item.name) !== link.name ||
        item.group !== link.group ||
        (item.kind === 'repertoire' && item.color !== link.color));
    const remoteChanged = !!chapter && chapterChanged(link, chapter);

    if (item && chapter) {
      if (!localChanged && !remoteChanged) {
        // Sent before Lichess's version could be read: remember that version now.
        if (link.remoteHash.startsWith('?')) actions.push({ type: 'link', item, chapter });
        continue;
      }
      if (localChanged && !remoteChanged) {
        const reshaped = !sameItemShape(item, chapter) || item.group !== chapter.group;
        actions.push({ type: reshaped ? 'push-replace' : 'push-update', item, link });
      } else if (!localChanged && remoteChanged) {
        actions.push({ type: 'pull-update', key, chapter });
      } else {
        // Both changed: keep this device's version on Lichess, and Lichess's as a copy here.
        if (!chapter.blank) {
          actions.push({ type: 'pull-new', chapter, name: copyName(chapter.name) });
        }
        const reshaped = !sameItemShape(item, chapter) || item.group !== chapter.group;
        actions.push({ type: reshaped ? 'push-replace' : 'push-update', item, link });
      }
    } else if (item && !chapter) {
      if (studyGone) actions.push({ type: 'push-new', item, replacesKey: key });
      else if (studyRead) {
        actions.push(
          localChanged
            ? { type: 'push-new', item, replacesKey: key }
            : { type: 'pull-delete', key },
        );
      }
      // A study that could not be read: nothing is decided about it.
    } else if (!item && chapter) {
      if (deleted.has(key) && (!remoteChanged || chapter.blank)) {
        actions.push({ type: 'push-delete', key, link });
      } else if (!chapter.blank) {
        // Changed on Lichess since, or lost here rather than deleted: it comes back.
        actions.push({ type: 'pull-new', chapter, name: chapter.name, replacesKey: key });
      } else {
        actions.push({ type: 'unlink', key });
      }
    } else if (studyRead || studyGone) {
      actions.push({ type: 'unlink', key });
    }
  }

  // Items and chapters that no link connects yet: the same item on both sides is linked as it
  // is; anything else is new to the other side (names may repeat: the lists allow it).
  const unlinkedChapters = chapters.filter(
    (c) => !linkedChapters.has(`${c.studyId}/${c.chapterId}`) && !c.blank,
  );
  const matched = new Set<string>();
  for (const item of items) {
    if (links[item.key]) continue;
    const twin = unlinkedChapters.find(
      (c) =>
        !matched.has(`${c.studyId}/${c.chapterId}`) &&
        c.kind === item.kind &&
        c.group === item.group &&
        c.movesHash === item.movesHash &&
        sameItemShape(item, c),
    );
    if (twin) {
      matched.add(`${twin.studyId}/${twin.chapterId}`);
      actions.push({ type: 'link', item, chapter: twin });
    } else {
      actions.push({ type: 'push-new', item });
    }
  }
  for (const chapter of unlinkedChapters) {
    if (matched.has(`${chapter.studyId}/${chapter.chapterId}`)) continue;
    actions.push({ type: 'pull-new', chapter, name: chapter.name });
  }
  return actions;
}

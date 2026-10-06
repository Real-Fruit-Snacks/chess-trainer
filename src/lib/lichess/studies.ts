import { DEFAULT_COLLECTION, MAX_ANALYSES, useAnalyses } from '@/store/analyses';
import { type StudyLink, useLichess } from '@/store/lichess';
import { useRepertoire } from '@/store/repertoire';
import {
  LichessError,
  lichessJson,
  lichessNdjson,
  lichessSend,
  lichessText,
  lichessTextStream,
} from './api';
import {
  type AppStudy,
  chapterPgn,
  chaptersFromExport,
  fitGroup,
  fitName,
  fitsChapter,
  MAX_CHAPTERS,
  parseStudyName,
  pendingRemoteHash,
  positionKey,
  REPERTOIRE_GROUP,
  type RemoteChapter,
  reconcile,
  type StudyExport,
  type StudyKind,
  studyName,
  type SyncAction,
  type SyncItem,
  type TreeContent,
  treeContent,
} from './studyModel';

/**
 * Keeping custom repertoires and saved analyses in step with private Lichess
 * studies: reads the app's studies, decides with `reconcile`, applies what
 * comes down to the local stores and sends what goes up. Studies are created
 * when a list needs one (private, chat off, shared and exported by their owner
 * only), filled in batches (Lichess names each chapter from its `ChapterName`
 * tag), and read again afterwards so the links remember Lichess's own version
 * of every chapter.
 */

export interface StudySyncResult {
  /** Items created, updated or deleted here. */
  pulled: number;
  /** Chapters created, updated or deleted on Lichess. */
  pushed: number;
  /** Copies kept because an item had changed on both sides. */
  copies: number;
  /** Items that stay on this device: too big for a chapter, or refused by Lichess. */
  heldBack: string[];
  /** Analyses left on Lichess because the library here is full. */
  notPulled: number;
  /** Nothing had changed on either side: no study was read. */
  skipped: boolean;
}

/** An item as the sync sees it, built from its content. */
function itemOf(
  key: string,
  kind: StudyKind,
  group: string,
  name: string,
  color: 'white' | 'black',
  content: TreeContent,
): SyncItem {
  return {
    key,
    kind,
    group,
    name,
    color,
    pgn: content.pgn,
    startFen: content.startFen,
    hash: content.hash,
    movesHash: content.movesHash,
    fits: fitsChapter(content, name),
    blank: content.blank,
  };
}

/** This device's repertoires and analyses (unreadable ones are left out). */
export function localItems(): SyncItem[] {
  const items: SyncItem[] = [];
  for (const rep of useRepertoire.getState().custom) {
    const content = treeContent(rep.pgn);
    if (!content) continue;
    items.push(
      itemOf(`rep:${rep.id}`, 'repertoire', REPERTOIRE_GROUP, rep.name, rep.color, content),
    );
  }
  for (const entry of Object.values(useAnalyses.getState().items)) {
    const content = treeContent(entry.pgn);
    if (!content) continue;
    const group = fitGroup(entry.collection) || DEFAULT_COLLECTION;
    items.push(itemOf(`ana:${entry.id}`, 'analysis', group, entry.name, 'white', content));
  }
  return items;
}

/** The app's studies among the account's. */
export async function listAppStudies(token: string, username: string): Promise<AppStudy[]> {
  const studies: AppStudy[] = [];
  await lichessNdjson(
    `/api/study/by/${encodeURIComponent(username)}`,
    (item) => {
      if (typeof item !== 'object' || item === null) return;
      const { id, name, updatedAt } = item as { id?: unknown; name?: unknown; updatedAt?: unknown };
      if (typeof id !== 'string' || typeof name !== 'string') return;
      const parsed = parseStudyName(name);
      if (!parsed) return;
      studies.push({ id, ...parsed, updatedAt: typeof updatedAt === 'number' ? updatedAt : 0 });
    },
    { token },
  );
  return studies;
}

/** How every study export is asked for: no clocks; comments, variations and each side. */
const EXPORT_QUERY = { clocks: false, comments: true, variations: true, orientation: true };

async function readStudy(token: string, study: AppStudy): Promise<StudyExport> {
  const text = await lichessText(`/api/study/${study.id}.pgn`, {
    token,
    accept: 'application/x-chess-pgn',
    query: EXPORT_QUERY,
  });
  return chaptersFromExport(study, text);
}

/**
 * How long the export of all the account's studies may take to read: Lichess
 * sends it about twenty chapters a second, and the studies wanted may come
 * after many others.
 */
const ACCOUNT_EXPORT_TIMEOUT_MS = 10 * 60 * 1000;

/** Lichess ends every chapter of an export with two empty lines. */
const CHAPTER_END = '\n\n\n';
const CHAPTER_URL_TAG = /\[ChapterURL "[^"]*\/study\/([A-Za-z0-9]{8})\/[A-Za-z0-9]{8}"\]/;

/**
 * Studies read from the export of all the account's studies: the way to read
 * a study Lichess will not export on its own. Lichess refuses the export of a
 * study whose sharing is set to nobody — even to its owner — and 0.17.0 made
 * its studies so; that setting cannot be changed through Lichess's API.
 * Lichess sends the most recently updated study first, each with all its
 * chapters in a row, so reading stops once every study wanted has gone by. A
 * study counts as read only once all its chapters have come (a study missing
 * from the export, or cut off, is left for the next sync).
 */
async function readFromAccountExport(
  token: string,
  username: string,
  studies: readonly AppStudy[],
): Promise<Map<string, StudyExport>> {
  const wanted = new Set(studies.map((s) => s.id));
  const complete = new Set<string>();
  const kept: string[] = [];
  let current: string | null = null;
  let stopped = false;
  let rest = '';
  // One chapter (or, when a comment holds two empty lines, a piece of one: it belongs to the
  // study whose chapter came last, and joins it again when the pieces are put back together).
  const take = (chunk: string) => {
    const id = CHAPTER_URL_TAG.exec(chunk)?.[1] ?? null;
    if (id !== null && id !== current) {
      if (current !== null && wanted.has(current)) complete.add(current);
      current = id;
      if (!wanted.has(id) && complete.size === wanted.size) {
        stopped = true;
        return;
      }
    }
    if (current !== null && wanted.has(current)) kept.push(chunk);
  };
  const finished = await lichessTextStream(
    `/api/study/by/${encodeURIComponent(username)}/export.pgn`,
    (piece) => {
      rest += piece;
      const chunks = rest.split(CHAPTER_END);
      rest = chunks.pop() ?? '';
      for (const chunk of chunks) {
        take(chunk);
        if (stopped) return false;
      }
      return true;
    },
    {
      token,
      accept: 'application/x-chess-pgn',
      query: EXPORT_QUERY,
      timeoutMs: ACCOUNT_EXPORT_TIMEOUT_MS,
    },
  );
  if (finished && !stopped) {
    if (rest.trim()) take(rest);
    if (!stopped && current !== null && wanted.has(current)) complete.add(current);
  }
  const text = kept.join(CHAPTER_END);
  return new Map(
    studies.filter((s) => complete.has(s.id)).map((s) => [s.id, chaptersFromExport(s, text)]),
  );
}

/**
 * Reads studies, each on its own; those Lichess will not export on their own
 * are read together from the account's export of all its studies. A study
 * deleted meanwhile is left out (it is read next time); any other failure
 * stops the reading.
 */
async function readStudies(
  token: string,
  username: string,
  studies: readonly AppStudy[],
): Promise<Map<string, StudyExport>> {
  const read = new Map<string, StudyExport>();
  const refused: AppStudy[] = [];
  for (const study of studies) {
    try {
      read.set(study.id, await readStudy(token, study));
    } catch (err) {
      if (err instanceof LichessError && err.kind === 'refused') refused.push(study);
      else if (!(err instanceof LichessError) || err.kind !== 'not-found') throw err;
    }
  }
  if (refused.length > 0) {
    for (const [id, exported] of await readFromAccountExport(token, username, refused)) {
      read.set(id, exported);
    }
  }
  return read;
}

async function createStudy(token: string, name: string): Promise<string> {
  const answer = await lichessJson<{ id?: unknown }>('/api/study', {
    token,
    form: {
      name,
      visibility: 'private',
      computer: 'everyone',
      explorer: 'everyone',
      cloneable: 'nobody',
      // Only the owner may share and export it: with "nobody", Lichess refuses even the
      // owner's export, and the app reads its studies through that export.
      shareable: 'owner',
      chat: 'nobody',
      sticky: 'false',
      description: 'false',
    },
  });
  if (!answer || typeof answer.id !== 'string') {
    throw new LichessError('Lichess did not say which study it created.', 'server');
  }
  return answer.id;
}

/**
 * Imports chapters (one side for all). Lichess adds them in order and stops
 * at the first it cannot take: the ids are those of the chapters made, and
 * `error` says why it stopped, if it did.
 */
async function importChapters(
  token: string,
  studyId: string,
  items: readonly SyncItem[],
  orientation: 'white' | 'black',
): Promise<{ ids: string[]; error: string | null }> {
  const answer = await lichessJson<{ chapters?: unknown; error?: unknown }>(
    `/api/study/${studyId}/import-pgn`,
    { token, form: { pgn: items.map((item) => chapterPgn(item)).join('\n\n\n'), orientation } },
  );
  const chapters = Array.isArray(answer?.chapters) ? (answer.chapters as unknown[]) : [];
  const ids = chapters.flatMap((c) =>
    typeof c === 'object' && c !== null && typeof (c as { id?: unknown }).id === 'string'
      ? [(c as { id: string }).id]
      : [],
  );
  return { ids, error: typeof answer?.error === 'string' ? answer.error : null };
}

async function deleteChapter(token: string, studyId: string, chapterId: string): Promise<void> {
  try {
    await lichessSend(`/api/study/${studyId}/${chapterId}`, { method: 'DELETE', token });
  } catch (err) {
    // A study that is gone took its chapters with it.
    if (!(err instanceof LichessError) || err.kind !== 'not-found') throw err;
  }
}

const keyKind = (key: string): StudyKind => (key.startsWith('rep:') ? 'repertoire' : 'analysis');
const keyId = (key: string) => key.slice(4);

/** A link as the two sides agree right now. */
function linkFor(
  item: Pick<SyncItem, 'hash' | 'name' | 'group' | 'color' | 'kind'>,
  studyId: string,
  chapterId: string,
  remoteHash: string,
): StudyLink {
  return {
    studyId,
    chapterId,
    localHash: item.hash,
    remoteHash,
    name: fitName(item.name),
    group: item.group,
    color: item.kind === 'repertoire' ? item.color : null,
  };
}

interface Pulls {
  pulled: number;
  notPulled: number;
  /** Copies made because both sides changed: each goes up as a chapter of its own. */
  copies: SyncItem[];
}

/** Applies what comes down to the stores, keeping `links` in step. */
function applyPulls(actions: readonly SyncAction[], links: Record<string, StudyLink>): Pulls {
  const result: Pulls = { pulled: 0, notPulled: 0, copies: [] };
  const repertoire = useRepertoire.getState();
  const analyses = useAnalyses.getState();
  for (const action of actions) {
    if (action.type === 'pull-new') {
      const { chapter } = action;
      const content = treeContent(chapter.pgn);
      if (!content) continue;
      let key: string;
      if (chapter.kind === 'repertoire') {
        const created = repertoire.addCustom({
          name: action.name,
          color: chapter.color,
          pgn: content.pgn,
        });
        key = `rep:${created.id}`;
      } else {
        // A full library would drop its oldest entry. The chapter stays on Lichess, unlinked.
        if (Object.keys(useAnalyses.getState().items).length >= MAX_ANALYSES) {
          if (action.replacesKey) delete links[action.replacesKey];
          result.notPulled++;
          continue;
        }
        const created = analyses.save({
          name: action.name,
          collection: chapter.group,
          pgn: content.pgn,
          startFen: content.startFen,
          moves: content.moves,
        });
        key = `ana:${created.id}`;
      }
      if (action.replacesKey) delete links[action.replacesKey];
      if (action.name === chapter.name) {
        links[key] = {
          studyId: chapter.studyId,
          chapterId: chapter.chapterId,
          localHash: content.hash,
          remoteHash: chapter.hash,
          name: chapter.name,
          group: chapter.group,
          color: chapter.kind === 'repertoire' ? chapter.color : null,
        };
      } else {
        result.copies.push(
          itemOf(key, chapter.kind, chapter.group, action.name, chapter.color, content),
        );
      }
      result.pulled++;
    } else if (action.type === 'pull-update') {
      const { chapter, key } = action;
      const content = treeContent(chapter.pgn);
      const link = links[key];
      if (!content || !link) continue;
      const agreed: StudyLink = {
        ...link,
        localHash: content.hash,
        remoteHash: chapter.hash,
        name: chapter.name,
        color: chapter.kind === 'repertoire' ? chapter.color : null,
      };
      if (chapter.kind === 'repertoire') {
        repertoire.updateCustom(keyId(key), {
          name: chapter.name,
          color: chapter.color,
          pgn: content.pgn,
        });
      } else {
        const current = useAnalyses.getState().items[keyId(key)];
        if (!current) continue;
        if (positionKey(current.startFen) !== positionKey(content.startFen)) {
          // A different start position makes a different analysis: the entry is replaced.
          analyses.remove(current.id);
          const created = analyses.save({
            name: chapter.name,
            collection: current.collection,
            pgn: content.pgn,
            startFen: content.startFen,
            moves: content.moves,
          });
          delete links[key];
          links[`ana:${created.id}`] = agreed;
          result.pulled++;
          continue;
        }
        analyses.update(current.id, { name: chapter.name, pgn: content.pgn, moves: content.moves });
      }
      links[key] = agreed;
      result.pulled++;
    } else if (action.type === 'pull-delete') {
      if (keyKind(action.key) === 'repertoire') repertoire.removeCustom(keyId(action.key));
      else analyses.remove(keyId(action.key));
      delete links[action.key];
      result.pulled++;
    } else if (action.type === 'link') {
      links[action.item.key] = linkFor(
        action.item,
        action.chapter.studyId,
        action.chapter.chapterId,
        action.chapter.hash,
      );
    } else if (action.type === 'unlink') {
      delete links[action.key];
    }
  }
  return result;
}

/** Whether an item differs from its link (or has none). */
function itemChanged(item: SyncItem, link: StudyLink | undefined): boolean {
  if (!link) return true;
  return (
    link.localHash !== item.hash ||
    link.name !== fitName(item.name) ||
    link.group !== item.group ||
    (item.kind === 'repertoire' && link.color !== item.color)
  );
}

/**
 * Brings repertoires and analyses in step with the account's private studies.
 * `onStep` hears what is happening, for the status line.
 */
export async function syncStudies(
  token: string,
  username: string,
  onStep: (text: string) => void = () => undefined,
): Promise<StudySyncResult> {
  const store = useLichess.getState();
  const links: Record<string, StudyLink> = { ...store.links };

  onStep('Looking for your studies on Lichess');
  const studies = await listAppStudies(token, username);
  const listed = new Set(studies.map((s) => s.id));

  // An empty item is not sent until it has moves, unless its chapter already exists.
  const all = localItems().filter((item) => !item.blank || links[item.key]);
  // Refusals are remembered for the content refused; a changed item is tried again.
  const refused = Object.fromEntries(
    Object.entries(store.refused).filter(([key, hash]) =>
      all.some((item) => item.key === key && item.hash === hash),
    ),
  );
  const held = all.filter((item) => !item.fits || refused[item.key] === item.hash);
  const heldKeys = new Set(held.map((item) => item.key));
  const heldBack = held.map((item) => item.name);
  const items = all.filter((item) => !heldKeys.has(item.key));
  // A deletion is remembered while its chapter is linked; once the link goes, so does the note.
  const save = (extra: { studyStamps?: Record<string, number> } = {}) =>
    useLichess.getState().setStudySync({
      links: { ...links },
      refused: { ...refused },
      deleted: useLichess.getState().deleted.filter((key) => links[key]),
      ...extra,
    });

  // Nothing changed on either side since the last time: no study needs reading.
  const itemKeys = new Set(items.map((item) => item.key));
  const localDirty =
    items.some((item) => itemChanged(item, links[item.key])) ||
    Object.keys(links).some((key) => !itemKeys.has(key) && !heldKeys.has(key));
  const remoteDirty =
    studies.some((s) => store.studyStamps[s.id] !== s.updatedAt) ||
    Object.entries(links).some(([key, link]) => !heldKeys.has(key) && !listed.has(link.studyId));
  if (!localDirty && !remoteDirty) {
    save();
    return { pulled: 0, pushed: 0, copies: 0, heldBack, notPulled: 0, skipped: true };
  }

  onStep('Reading your repertoires and analyses on Lichess');
  const chapters: RemoteChapter[] = [];
  const unreadable: string[] = [];
  const exports = await readStudies(token, username, studies);
  for (const study of studies) {
    const exported = exports.get(study.id);
    if (!exported) continue;
    chapters.push(...exported.chapters);
    unreadable.push(...exported.unreadable);
  }
  const read = new Set(exports.keys());
  // Chapters nothing is decided about: unreadable here, or holding an item that stays here.
  const frozen = new Set(unreadable);
  for (const key of heldKeys) {
    const link = links[key];
    if (link) frozen.add(`${link.studyId}/${link.chapterId}`);
  }

  const deleted = new Set(store.deleted);
  const actions = reconcile({ items, chapters, links, listed, read, frozen, deleted });
  const pulls = applyPulls(actions, links);
  // What came down is saved at once: a failure while sending must not undo it.
  save();

  let pushed = 0;
  const touched = new Set<string>();
  const counts = new Map<string, number>();
  const bump = (studyId: string, by: number) =>
    counts.set(studyId, Math.max(0, (counts.get(studyId) ?? 0) + by));
  for (const chapter of chapters) bump(chapter.studyId, 1);
  for (const where of unreadable) bump(where.split('/')[0] ?? '', 1);
  const pushNew: SyncItem[] = [...pulls.copies];

  // Deletions first: they make room.
  for (const action of actions) {
    if (action.type !== 'push-delete' && action.type !== 'push-replace') continue;
    const { link } = action;
    onStep('Updating your studies on Lichess');
    await deleteChapter(token, link.studyId, link.chapterId);
    bump(link.studyId, -1);
    touched.add(link.studyId);
    delete links[action.type === 'push-delete' ? action.key : action.item.key];
    save();
    pushed++;
    if (action.type === 'push-replace') pushNew.push(action.item);
  }

  // New moves for chapters that keep their name, side and start.
  for (const action of actions) {
    if (action.type !== 'push-update') continue;
    const { item, link } = action;
    onStep('Updating your studies on Lichess');
    try {
      await lichessSend(`/api/study/${link.studyId}/${link.chapterId}/moves`, {
        token,
        form: { pgn: chapterPgn(item) },
      });
    } catch (err) {
      // Lichess answers 400 when the chapter is gone, or will not take the moves:
      // the old chapter goes (if it is still there) and the item is sent anew.
      if (!(err instanceof LichessError) || err.kind !== 'invalid') throw err;
      await deleteChapter(token, link.studyId, link.chapterId);
      delete links[item.key];
      save();
      pushNew.push(item);
      continue;
    }
    links[item.key] = linkFor(
      item,
      link.studyId,
      link.chapterId,
      pendingRemoteHash(item.movesHash),
    );
    save();
    touched.add(link.studyId);
    pushed++;
  }

  for (const action of actions) {
    if (action.type !== 'push-new') continue;
    // The chapter it was linked to is gone.
    if (action.replacesKey) delete links[action.replacesKey];
    pushNew.push(action.item);
  }

  // New chapters: a batch per study and side; a full study continues in the next part.
  const groups = new Map<string, SyncItem[]>();
  for (const item of pushNew) {
    const id = `${item.kind}|${item.group}`;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  const created = new Set<string>();
  for (const groupItems of groups.values()) {
    const first = groupItems[0];
    if (!first) continue;
    const parts = studies
      .filter((s) => s.kind === first.kind && s.group === first.group)
      .sort((a, b) => a.part - b.part);
    for (const side of ['white', 'black'] as const) {
      let queue = groupItems.filter((item) => item.color === side);
      while (queue.length > 0) {
        let target = parts.find((s) => (counts.get(s.id) ?? 0) < MAX_CHAPTERS);
        if (!target) {
          onStep('Creating a study on Lichess');
          const part = (parts.at(-1)?.part ?? 0) + 1;
          const id = await createStudy(token, studyName(first.kind, first.group, part));
          target = { id, kind: first.kind, group: first.group, part, updatedAt: 0 };
          parts.push(target);
          studies.push(target);
          created.add(id);
          // Lichess starts a study with one empty chapter; it goes once the others are in.
          counts.set(id, 1);
        }
        const studyId = target.id;
        const batch = queue.slice(0, MAX_CHAPTERS - (counts.get(studyId) ?? 0));
        onStep('Sending your repertoires and analyses to Lichess');
        const { ids, error } = await importChapters(token, studyId, batch, side);
        const made = Math.min(ids.length, batch.length);
        for (let i = 0; i < made; i++) {
          const item = batch[i];
          const chapterId = ids[i];
          if (item && chapterId) {
            links[item.key] = linkFor(item, studyId, chapterId, pendingRemoteHash(item.movesHash));
          }
        }
        bump(studyId, made);
        touched.add(studyId);
        pushed += made;
        queue = queue.slice(made);
        if (made < batch.length) {
          if (error && /too many chapters/i.test(error) && !created.has(studyId)) {
            // Fuller than it looked (chapters added meanwhile): the rest goes to the next part.
            counts.set(studyId, MAX_CHAPTERS);
          } else {
            // Lichess would not take the next one: it stays here until it changes.
            const bad = queue[0];
            if (bad) {
              refused[bad.key] = bad.hash;
              heldBack.push(bad.name);
            }
            queue = queue.slice(1);
          }
        }
        save();
      }
    }
  }

  /**
   * Each link takes Lichess's own version of its chapter, and the empty chapter
   * a new study starts with goes (when other chapters stay).
   */
  const settle = async (studyId: string, exported: StudyExport): Promise<boolean> => {
    const keyOf = new Map(
      Object.entries(links)
        .filter(([, link]) => link.studyId === studyId)
        .map(([key, link]) => [link.chapterId, key]),
    );
    const staying =
      exported.chapters.filter((c) => !c.blank || keyOf.has(c.chapterId)).length +
      exported.unreadable.length;
    let changed = false;
    for (const chapter of exported.chapters) {
      const key = keyOf.get(chapter.chapterId);
      const link = key ? links[key] : undefined;
      if (key && link) {
        if (link.remoteHash.startsWith('?')) links[key] = { ...link, remoteHash: chapter.hash };
      } else if (chapter.blank && staying > 0) {
        await deleteChapter(token, studyId, chapter.chapterId);
        changed = true;
      }
    }
    return changed;
  };

  // Read the studies that changed, so each link holds Lichess's own version of its chapter.
  if (touched.size > 0) onStep('Checking your studies on Lichess');
  const fresh = await readStudies(
    token,
    username,
    studies.filter((s) => touched.has(s.id)),
  );
  for (const study of studies) {
    const exported = fresh.get(study.id);
    if (exported) await settle(study.id, exported);
  }

  // A run that stopped before reading back what it had sent (its links still waited for
  // Lichess's version of their chapters) left that tidying undone: it is done now, from what
  // was read at the start, for the studies this run did not change.
  const tidied = new Set<string>();
  for (const studyId of new Set(
    Object.values(store.links)
      .filter((link) => link.remoteHash.startsWith('?'))
      .map((link) => link.studyId),
  )) {
    const exported = exports.get(studyId);
    if (exported && !touched.has(studyId) && (await settle(studyId, exported))) {
      tidied.add(studyId);
    }
  }

  // The stamps to compare with next time. Studies changed just now are left out: Lichess
  // records the change a few seconds later, so they are read once more next time.
  const studyStamps = Object.fromEntries(
    studies
      .filter((s) => read.has(s.id) && !touched.has(s.id) && !tidied.has(s.id))
      .map((s) => [s.id, s.updatedAt]),
  );
  save({ studyStamps });
  return {
    pulled: pulls.pulled,
    pushed,
    copies: pulls.copies.length,
    heldBack,
    notPulled: pulls.notPulled,
    skipped: false,
  };
}

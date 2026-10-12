import { create } from 'zustand';
import { ID_PATTERN } from '../../../relay/src/live/shared.mjs';
import { createAnalysisRoom } from './analysisRoom';
import { setBarReason } from './bar';
import { createRaceRoom, racing } from './raceRoom';
import { memberships, roomPath } from './rooms';
import type {
  AnalysisRoomSession,
  GroupKind,
  GroupView,
  RaceRoomSession,
  RaceRoomView,
} from './types';

/**
 * The group rooms' connections on this device (puzzle race rooms, analysis
 * rooms), one per room whatever shows it (the room's page, the bar that leads
 * back to it). A room this device is a member of stays connected wherever the
 * player goes in the app, until they leave it or it closes; one only looked
 * at is let go a minute after nothing shows it.
 */

/** A room only looked at is let go once nothing has shown it for this long. */
export const VISIT_LINGER_MS = 60_000;

/** What every kind of room's connection gives. */
interface RoomSession {
  getView(): GroupView<unknown>;
  subscribe(listener: () => void): () => void;
  close(): void;
}

interface Entry {
  key: string;
  id: string;
  kind: GroupKind;
  inner: RoomSession;
  /** What callers get: the same room, its subscribers counted. */
  session: RoomSession;
  watchers: number;
  timer: ReturnType<typeof setTimeout> | null;
  stop: () => void;
}

const entries = new Map<string, Entry>();

/** The connection to the room `id` of `kind` (the same one for every caller), made by `make`. */
function getRoom<S extends RoomSession>(
  kind: GroupKind,
  id: string,
  make: (id: string) => S,
): S | null {
  if (!ID_PATTERN.test(id)) return null;
  const key = `${kind}/${id}`;
  const known = entries.get(key);
  if (known) return known.session as S;
  const inner = make(id);
  const entry: Entry = {
    key,
    id,
    kind,
    inner,
    session: inner,
    watchers: 0,
    timer: null,
    stop: () => undefined,
  };
  const session = {
    ...inner,
    getView: () => inner.getView(),
    subscribe: (listener: () => void) => {
      entry.watchers += 1;
      lifetime(entry);
      const off = inner.subscribe(listener);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        off();
        entry.watchers -= 1;
        if (entries.get(key) === entry) lifetime(entry);
      };
    },
    close: () => drop(entry),
  };
  entry.session = session;
  entries.set(key, entry);
  entry.stop = inner.subscribe(() => changed(entry));
  changed(entry);
  return session;
}

/** The connection to a race room (the same one for every caller); null when `id` is not a room's. */
export function getRaceRoom(id: string): RaceRoomSession | null {
  return getRoom('race', id, createRaceRoom);
}

/** The connection to an analysis room (the same one for every caller); null when `id` is not a room's. */
export function getAnalysisRoom(id: string): AnalysisRoomSession | null {
  return getRoom('analysis', id, createAnalysisRoom);
}

let checked = false;

/**
 * After a restart, connects once to every room this device is a member of: one
 * still open shows in the bar, which leads back to it; the others are found
 * gone and forgotten.
 */
export function checkOnRooms(): void {
  if (checked) return;
  checked = true;
  for (const { id, kind } of memberships()) {
    if (kind === 'analysis') getAnalysisRoom(id);
    else getRaceRoom(id);
  }
}

/** A member's room stays; a room only looked at (or gone) goes a minute after nothing shows it. */
function lifetime(entry: Entry): void {
  const view = entry.inner.getView();
  const passing = view.missing || view.you === null;
  if (passing && entry.watchers === 0) {
    entry.timer ??= setTimeout(() => drop(entry), VISIT_LINGER_MS);
  } else if (entry.timer !== null) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

function changed(entry: Entry): void {
  if (entries.get(entry.key) !== entry) return;
  lifetime(entry);
  publish();
}

function drop(entry: Entry): void {
  if (entry.timer !== null) clearTimeout(entry.timer);
  entry.timer = null;
  if (entries.get(entry.key) !== entry) return;
  entries.delete(entry.key);
  entry.stop();
  entry.inner.close();
  publish();
}

/** Closes every room's connection (a test's clean slate). */
export function closeRooms(): void {
  for (const entry of [...entries.values()]) drop(entry);
  checked = false;
}

/** A room this device is in, for the bar that leads back to it. */
export interface ActiveRoom {
  id: string;
  kind: GroupKind;
  path: string;
  /** A race room's race is on, and this device races in it. */
  racing: boolean;
}

/** The rooms this device is in (normally none or one). */
export const useActiveRooms = create<{ rooms: ActiveRoom[] }>()(() => ({ rooms: [] }));

/** A room the bar can lead back to: this device a member, connected (or reconnecting). */
const inRoom = (view: GroupView<unknown>) =>
  view.you !== null && !view.missing && view.connection !== 'connecting';

function publish(): void {
  const rooms: ActiveRoom[] = [];
  for (const entry of entries.values()) {
    const view = entry.inner.getView();
    if (!inRoom(view)) continue;
    rooms.push({
      id: entry.id,
      kind: entry.kind,
      path: roomPath(entry.kind, entry.id),
      racing: entry.kind === 'race' && racing(view as RaceRoomView),
    });
  }
  const before = useActiveRooms.getState().rooms;
  const same =
    before.length === rooms.length &&
    before.every(
      (room, i) =>
        room.id === rooms[i]?.id && room.kind === rooms[i].kind && room.racing === rooms[i].racing,
    );
  if (!same) useActiveRooms.setState({ rooms });
  setBarReason('rooms', rooms.length > 0);
}

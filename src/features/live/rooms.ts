import { safeLocalStorage } from '@/lib/persistStorage';
import { storageKeyFor } from '@/store/profiles';
import {
  GROUP_LIMITS,
  groupOptions,
  ID_PATTERN,
  isGroupKind,
  SEAT_PATTERN,
} from '../../../relay/src/live/shared.mjs';
import { shownRating, useLivePrefs } from './prefs';
import { liveSocketUrl } from './relayUrls';
import { LiveSocket } from './socket';
import type { GroupKind, GroupOptions } from './types';

/**
 * Group rooms (relay/src/live/group.mjs: a puzzle race for up to eight, a game
 * analysed together): where a room's page is, its link, the rooms this device
 * is a member of, and making one. A member's token is the only way back to their place, and the
 * room hands it out once, so it is kept in storage: a reload, or the bar
 * after a restart, finds the room again. A room lives some hours at most, and
 * so does a membership kept here.
 */
export const ROOMS_STORAGE_KEY = 'open-file:live-rooms';

/** How long the relay may take to make a room before this side gives up. */
const CREATE_TIMEOUT_MS = 15_000;
const UNREACHABLE = 'The room could not be made: the relay could not be reached.';

export interface Membership {
  token: string;
  kind: GroupKind;
  /** When this device joined (Date.now()). */
  at: number;
}

/** The page of a race room: /play/race/<id>. */
export function raceRoomPath(id: string): string {
  return `/play/race/${encodeURIComponent(id)}`;
}

/** The link that opens a race room, to send to the others. */
export function raceRoomLink(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}play/race/${encodeURIComponent(id)}`;
}

/** The page of an analysis room: /analyze/together/<id>. */
export function analysisRoomPath(id: string): string {
  return `/analyze/together/${encodeURIComponent(id)}`;
}

/** The link that opens an analysis room, to send to the others. */
export function analysisRoomLink(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}analyze/together/${encodeURIComponent(id)}`;
}

/** The page of a group room of any kind. */
export function roomPath(kind: GroupKind, id: string): string {
  return kind === 'analysis' ? analysisRoomPath(id) : raceRoomPath(id);
}

const roomsKey = () => storageKeyFor(ROOMS_STORAGE_KEY);

function readMemberships(now: number): Record<string, Membership> {
  const raw = safeLocalStorage.getItem(roomsKey());
  if (typeof raw !== 'string') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const rooms: Record<string, Membership> = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!ID_PATTERN.test(id) || typeof value !== 'object' || value === null) continue;
    const { token, kind, at } = value as Record<string, unknown>;
    if (typeof token !== 'string' || !SEAT_PATTERN.test(token) || !isGroupKind(kind)) continue;
    if (typeof at !== 'number' || !Number.isFinite(at) || now - at >= GROUP_LIMITS.ageMs) continue;
    rooms[id] = { token, kind, at };
  }
  return rooms;
}

function writeMemberships(rooms: Record<string, Membership>): void {
  safeLocalStorage.setItem(roomsKey(), JSON.stringify(rooms));
}

/** Keeps this device's member token for a room (and lets the old ones go). */
export function rememberMembership(
  id: string,
  token: string,
  kind: GroupKind,
  now = Date.now(),
): void {
  if (!ID_PATTERN.test(id) || !SEAT_PATTERN.test(token)) return;
  const rooms = readMemberships(now);
  if (rooms[id]?.token === token) return;
  rooms[id] = { token, kind, at: now };
  writeMemberships(rooms);
}

/** This device's membership of a room, or null. */
export function membershipOf(id: string, now = Date.now()): Membership | null {
  return readMemberships(now)[id] ?? null;
}

/** Forgets a room: its place given up, or the room gone. */
export function forgetMembership(id: string, now = Date.now()): void {
  const rooms = readMemberships(now);
  if (!rooms[id]) return;
  delete rooms[id];
  writeMemberships(rooms);
}

/** The rooms this device is a member of (those not older than a room can be). */
export function memberships(now = Date.now()): (Membership & { id: string })[] {
  return Object.entries(readMemberships(now)).map(([id, membership]) => ({ ...membership, id }));
}

/**
 * Makes a group room through the waiting room, under this device's name: its
 * maker is the host, and the token is kept at once. Resolves with the room's
 * id; rejects with a sentence to show.
 */
export function makeGroupRoom(kind: GroupKind, opts: GroupOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const checked = groupOptions(kind, opts);
    if (!checked) {
      reject(new Error('That room cannot be made.'));
      return;
    }
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      socket.dispose();
      settle();
    };
    const socket = new LiveSocket(() => liveSocketUrl('/v1/lobby'), {
      open: () => {
        socket.send({
          t: 'create-room',
          kind,
          opts: checked,
          name: useLivePrefs.getState().name,
          rating: shownRating(),
        });
      },
      message: (message) => {
        if (message.t === 'room-created') {
          const { room, token } = message;
          if (typeof room !== 'string' || !ID_PATTERN.test(room)) return;
          if (typeof token !== 'string' || !SEAT_PATTERN.test(token)) return;
          rememberMembership(room, token, kind);
          finish(() => resolve(room));
        } else if (message.t === 'error') {
          const text =
            typeof message.message === 'string' ? message.message : 'The room could not be made.';
          finish(() => reject(new Error(text)));
        }
      },
      down: () => finish(() => reject(new Error(UNREACHABLE))),
    });
    if (!socket.connect()) {
      finish(() => reject(new Error('Live games are not available right now.')));
      return;
    }
    timer = setTimeout(() => finish(() => reject(new Error(UNREACHABLE))), CREATE_TIMEOUT_MS);
  });
}

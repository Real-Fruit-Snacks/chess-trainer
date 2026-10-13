/** Types for group.mjs, for TypeScript callers: the relay's tests. */

export interface Member {
  id: string;
  name: string;
  rating: number | null;
  /** SHA-256 of the member's token, lowercase hex. */
  tokenHash: string;
  joinedAt: number;
  /** Since when a socket of theirs has been open; null while they are away. */
  hereSince: number | null;
  /** Since when they have had no socket open; null while they are here. */
  goneSince: number | null;
  lastPhraseAt: number;
}

export interface GroupState {
  v: 1;
  id: string;
  kind: string;
  createdAt: number;
  members: Member[];
  /** The host's member id ('' while the room has no members). */
  host: string;
  /** Since when no member has been here; null while someone is. */
  emptySince: number | null;
  chat: { by: string; phrase: string }[];
  /** The kind's own state. */
  state: unknown;
}

export interface GroupSpec {
  id: string;
  kind: string;
  opts: unknown;
  /** The maker, the first member and host; null for a room made with no members (a game's analysis room). */
  host: { name: string; rating: number | null; tokenHash: string } | null;
}

export interface GroupData {
  id: string;
  /** The member this socket is, once it has said hello with their token (or joined). */
  member: string | null;
  /** The socket said hello without a member's token: it looks, and may join. */
  visitor: boolean;
  openedAt: number;
  rateStart: number;
  rateCount: number;
  /** The client's address as the limits count it (`addressKey`); '' when not known. */
  address: string;
  /** The socket's refused messages lately (`refusedTooOften`). */
  refused?: { start: number; count: number };
}

export interface GroupConn {
  data: GroupData;
  send(text: string): void;
  close(code: number, reason: string): void;
  save(): void;
}

export interface GroupPlatform {
  connections(): GroupConn[];
  load(): Promise<GroupState | null>;
  store(state: GroupState): Promise<void>;
  remove(): Promise<void>;
  schedule(at: number | null): void | Promise<void>;
  /**
   * When the timer is set for (null: not set), read when a room wakes so that it sets the timer
   * only when it must (none: the room's first save sets it).
   */
  alarm?: () => Promise<number | null>;
  /**
   * A timer in memory, besides the stored one, for what may slip if the room is evicted (a
   * socket's time to say hello, the light changes' write); none: those wait for its next event.
   */
  timers?: { set(at: number, run: () => void): unknown; clear(handle: unknown): void };
  now(): number;
}

export interface PublicMember {
  id: string;
  name: string;
  rating: number | null;
}

export interface Sender extends PublicMember {
  host: boolean;
}

/** What a kind's module has of its room. */
export interface GroupContext {
  /** One message for everyone in the room (members and visitors): nothing private. */
  announce(message: unknown): void;
  /** Each socket its own message: `make` gets the member's id, or null for a visitor. */
  tell(make: (member: string | null) => unknown): void;
  /** An error to one socket, followed by the room as it stands. */
  refuse(conn: unknown, code: string, message: string): void;
  /** The members, in the order they joined. */
  members(): PublicMember[];
  /** The ids of the members here. */
  here(): string[];
  host(): string;
}

/** What a kind of group room gives the room (raceRoom.mjs is one). */
export interface GroupKindModule<S> {
  /** The room's options, checked; null when they are not valid. */
  options(opts: unknown): Record<string, string | number> | null;
  /** The kind's state in a new room. */
  create(opts: Record<string, string | number>, now: number): S;
  /** What a member (or a visitor: null) sees of it, in the room's snapshot. */
  view(state: S, member: string | null, now: number): unknown;
  /** When the kind next needs `timer`. */
  deadline(state: S): number | null;
  /** Whether a member's message may be larger than an ordinary one (up to LIMITS.contentBytes). */
  big?(msg: Record<string, unknown>, sender: Sender): boolean;
  /**
   * Whether what a member's message changes may wait to be written with the room's other light
   * changes, at most every ABUSE_LIMITS.lightWriteMs (none: everything is written at once).
   */
  light?(msg: Record<string, unknown>): boolean;
  /** A member's message: false when it is not the kind's (the room refuses it). */
  message(
    ctx: GroupContext,
    conn: unknown,
    state: S,
    sender: Sender,
    msg: Record<string, unknown>,
    now: number,
  ): boolean;
  timer(ctx: GroupContext, state: S, now: number): void;
  /** Someone came, went, joined or left. */
  presence?(ctx: GroupContext, state: S, now: number): void;
}

export function groupData(now?: number, address?: string): GroupData;
export function newGroup(spec: GroupSpec, now: number): GroupState;
export function createGroup(platform: GroupPlatform): {
  create(spec: GroupSpec): Promise<void>;
  open(conn: GroupConn): Promise<void>;
  message(conn: GroupConn, text: string): Promise<void>;
  close(conn: GroupConn): Promise<void>;
  timer(): Promise<void>;
};

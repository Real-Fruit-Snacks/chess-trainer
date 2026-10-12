import {
  CLOSE,
  GROUP_LIMITS,
  isPhrase,
  LIMITS,
  MEMBER_PATTERN,
  PHRASES,
  SEAT_PATTERN,
} from '../../../relay/src/live/shared.mjs';
import { shownRating, useLivePrefs } from './prefs';
import { forgetMembership, membershipOf, rememberMembership } from './rooms';
import { liveSocketUrl } from './relayUrls';
import { LiveSocket } from './socket';
import type { GroupKind, GroupMember, GroupView, PhraseId } from './types';

/**
 * A group room on the relay (relay/src/live/group.mjs) from this device: the
 * members, the host, the phrases, joining and leaving — whatever the room's
 * kind (a race, raceRoom.ts; an analysis, analysisRoom.ts). The kind's own state comes through `GroupKindClient`, which reads it
 * from the room's snapshot and from the kind's messages.
 *
 * A member connects with their token (kept by rooms.ts), so a reconnection
 * keeps their place; anyone else connects as a visitor, who sees the room and
 * may join it. The connection stays until `close()`: what holds it decides
 * (roomSessions.ts).
 */

/** How a kind of room reads its state on this side. */
export interface GroupKindClient<S> {
  kind: GroupKind;
  /** The message that carries the kind's whole state (`{t:'race', state}`), if the kind has one. */
  stateMessage?: string;
  /**
   * The kind's state as the room sent it (the snapshot's, or the state
   * message's); `before` is what this device had. Null when it is not one.
   */
  read(value: unknown, before: S | null): S | null;
  /** Any other message of the kind's: the new state, or null to leave it as it is. */
  message?(message: Record<string, unknown>, before: S | null): S | null;
}

export interface GroupSession<S> {
  getView(): GroupView<S>;
  subscribe(listener: () => void): () => void;
  join(): void;
  leave(): void;
  say(phrase: PhraseId): void;
  /** Sends a message of the kind's; false (and an error shown) when the connection is down. */
  send(message: Record<string, unknown>): boolean;
  /** Shows (or clears) an error of the kind's. */
  setError(error: string | null): void;
  close(): void;
}

export const DOWN_MESSAGE = 'The connection is down: try again in a moment.';

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const isMemberId = (value: unknown): value is string =>
  typeof value === 'string' && MEMBER_PATTERN.test(value);

function membersOf(value: unknown): GroupMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const { id, name, rating, here } = record(item);
    if (!isMemberId(id) || typeof name !== 'string') return [];
    return [
      {
        id,
        name,
        rating: typeof rating === 'number' && Number.isFinite(rating) ? rating : null,
        here: here === true,
      },
    ];
  });
}

function chatOf(value: unknown): GroupView<unknown>['chat'] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((line: unknown) => {
      const { by, phrase } = record(line);
      return isMemberId(by) && isPhrase(phrase) ? [{ by, text: PHRASES[phrase] }] : [];
    })
    .slice(-LIMITS.phrasesKept);
}

function blank<S>(id: string, kind: GroupKind): GroupView<S> {
  return {
    id,
    kind,
    connection: 'connecting',
    missing: false,
    you: null,
    host: null,
    members: [],
    max: GROUP_LIMITS.members,
    chat: [],
    state: null,
    joining: false,
    error: null,
  };
}

/**
 * The connection to group room `id`, of the kind `client` reads. `onState`
 * hears every change of the kind's state (and every snapshot).
 */
export function createRelayGroup<S>(
  id: string,
  client: GroupKindClient<S>,
  onState: (view: GroupView<S>, snapshot: boolean) => void = () => undefined,
): GroupSession<S> {
  let view = blank<S>(id, client.kind);
  const listeners = new Set<() => void>();
  let loaded = false;
  let gone = false;
  let closed = false;
  /** Asked to join while the connection was down: it goes once it is back. */
  let wantsToJoin = false;

  const socket = new LiveSocket(() => liveSocketUrl(`/v1/rooms/${id}`), {
    open: () => {
      const token = membershipOf(id)?.token;
      socket.send(token ? { t: 'hello', token } : { t: 'hello' });
    },
    message: onMessage,
    down: onDown,
  });

  function emit(patch: Partial<GroupView<S>>): void {
    const next = { ...view, ...patch };
    const changed = (Object.keys(next) as (keyof GroupView<S>)[]).some(
      (key) => next[key] !== view[key],
    );
    if (!changed) return;
    view = next;
    for (const listener of [...listeners]) listener();
  }

  function start(): void {
    if (closed || gone || socket.state !== 'idle') return;
    if (!socket.connect()) {
      gone = true;
      emit({ missing: true, connection: 'closed' });
      return;
    }
    emit({ connection: loaded ? 'reconnecting' : 'connecting' });
  }

  function onDown({ code }: { code: number; opened: boolean }): void {
    if (closed) return;
    if (code === CLOSE.noGame || code === CLOSE.closed) {
      gone = true;
      forgetMembership(id);
      emit({ missing: true, connection: 'closed', joining: false });
      return;
    }
    socket.retry();
    emit({ connection: loaded ? 'reconnecting' : 'connecting' });
  }

  function onMessage(message: Record<string, unknown>): void {
    switch (message.t) {
      case 'room':
        return onSnapshot(message);
      case 'members': {
        const host = isMemberId(message.host) ? message.host : null;
        return emit({ host, members: membersOf(message.members) });
      }
      case 'joined': {
        const { member, token } = message;
        if (!isMemberId(member) || typeof token !== 'string' || !SEAT_PATTERN.test(token)) return;
        rememberMembership(id, token, client.kind);
        wantsToJoin = false;
        return emit({ you: member, joining: false, error: null });
      }
      case 'left':
        forgetMembership(id);
        return emit({ you: null, chat: [], error: null });
      case 'say': {
        const { by, phrase } = message;
        if (!isMemberId(by) || !isPhrase(phrase)) return;
        return emit({
          chat: [...view.chat, { by, text: PHRASES[phrase] }].slice(-LIMITS.phrasesKept),
        });
      }
      case 'error': {
        if (message.code === 'not-member') {
          // A place given up (or taken over by someone who joined): this device looks on.
          forgetMembership(id);
          return emit({ you: null, joining: false });
        }
        wantsToJoin = false;
        return emit({
          joining: false,
          error: typeof message.message === 'string' ? message.message : 'That was refused.',
        });
      }
      default: {
        if (client.stateMessage && message.t === client.stateMessage) {
          const state = client.read(message.state, view.state);
          if (!state) return;
          emit({ state });
          onState(view, false);
          return;
        }
        const state = client.message?.(message, view.state) ?? null;
        if (!state) return;
        emit({ state });
        onState(view, false);
      }
    }
  }

  function onSnapshot(message: Record<string, unknown>): void {
    if (message.id !== id) return;
    const you = isMemberId(message.you) ? message.you : null;
    const state = client.read(message.state, view.state);
    loaded = true;
    socket.settled();
    emit({
      connection: 'open',
      missing: false,
      you,
      host: isMemberId(message.host) ? message.host : null,
      members: membersOf(message.members),
      max:
        typeof message.max === 'number' && Number.isInteger(message.max)
          ? message.max
          : GROUP_LIMITS.members,
      chat: chatOf(message.chat),
      state: state ?? view.state,
    });
    onState(view, true);
    if (you) {
      wantsToJoin = false;
      if (view.joining) emit({ joining: false });
    } else if (wantsToJoin) {
      sendJoin();
    }
  }

  function sendJoin(): void {
    if (!socket.send({ t: 'join', name: useLivePrefs.getState().name, rating: shownRating() })) {
      return;
    }
    wantsToJoin = false;
  }

  /** Sends a message; with the connection down, says so instead. */
  function act(message: Record<string, unknown>): boolean {
    if (closed || gone || view.missing) return false;
    if (!socket.send(message)) {
      emit({ error: DOWN_MESSAGE });
      return false;
    }
    if (view.error) emit({ error: null });
    return true;
  }

  start();

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    join() {
      if (closed || gone || view.you || view.joining) return;
      wantsToJoin = true;
      emit({ joining: true, error: null });
      if (socket.state === 'open' && view.connection === 'open') sendJoin();
    },
    leave() {
      if (view.you) act({ t: 'leave' });
    },
    say(phrase) {
      if (view.you && isPhrase(phrase)) act({ t: 'say', phrase });
    },
    send: (message) => act(message),
    setError: (error) => emit({ error }),
    close() {
      if (closed) return;
      closed = true;
      socket.dispose();
      emit({ connection: 'closed' });
    },
  };
}

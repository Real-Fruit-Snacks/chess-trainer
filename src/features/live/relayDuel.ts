import { duelContent, duelReport } from '../../../relay/src/live/duelRules.mjs';
import {
  CLOSE,
  DUEL_RULES,
  gameOptions,
  ID_PATTERN,
  isDuel,
  isPhrase,
  LIMITS,
  PHRASES,
  SEAT_PATTERN,
} from '../../../relay/src/live/shared.mjs';
import { liveSocketUrl } from './relayUrls';
import { liveGamePath, rememberSeat } from './seats';
import { LiveSocket } from './socket';
import type {
  DuelItems,
  DuelKind,
  DuelProgress,
  DuelReport,
  DuelResult,
  DuelRound,
  DuelSession,
  DuelView,
  GameOptions,
  LivePlayer,
  OfferOp,
  Side,
} from './types';

/**
 * A duel on the relay (relay/src/live/duel.mjs), from this device's seat: a
 * puzzle race, an Arbiter duel or a Who Stands Better? duel. The room runs the
 * rounds by its clock and decides them; this side shows them as the room tells
 * them, and reports this player's results as this device measured them.
 *
 * The host (the poster, in the white seat) makes the rounds once the duel
 * exists (`prepare`, duelRounds.ts) and sends them; they are kept, and sent
 * again should the first sending not have arrived.
 */

export type PrepareDuel = (game: DuelKind, opts: GameOptions) => Promise<DuelItems>;

const defaultPrepare: PrepareDuel = async (game, opts) => {
  const { prepareDuel } = await import('./duelRounds');
  return prepareDuel(game, opts);
};

const DOWN_MESSAGE = 'The connection is down: try again in a moment.';
const PHASES = ['countdown', 'live', 'reveal'] as const;
const OPS: readonly OfferOp[] = ['offer', 'accept', 'decline'];

const other = (side: Side): Side => (side === 'white' ? 'black' : 'white');
const isSide = (value: unknown): value is Side => value === 'white' || value === 'black';
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function playerOf(value: unknown): LivePlayer {
  const player = record(value);
  return {
    name: typeof player.name === 'string' ? player.name : '',
    rating: finite(player.rating),
  };
}

function resultOf(value: unknown): DuelView['result'] {
  return value === '1-0' || value === '0-1' || value === '1/2-1/2' || value === '*' ? value : null;
}

function phaseOf(value: unknown): DuelView['phase'] {
  return PHASES.find((phase) => phase === value) ?? null;
}

/** A result as the room passes it on: checked as it checks reports (a judgement may be locked). */
function duelResultOf(game: DuelKind, value: unknown): DuelResult | { locked: true } | null {
  if (typeof value !== 'object' || value === null) return null;
  const result = value as Record<string, unknown>;
  if (result.locked === true) return { locked: true };
  // The room keeps judgements on its scale already; reading one back must not change it.
  if (game === 'judge') {
    const guess = finite(result.guess);
    return guess === null ? null : { guess };
  }
  return duelReport(game, result);
}

const ownResult = (game: DuelKind, value: unknown): DuelResult | null => {
  const result = duelResultOf(game, value);
  return result && !('locked' in result) ? result : null;
};

function scoreOf(value: unknown): Record<Side, number> {
  const score = record(value);
  return { white: finite(score.white) ?? 0, black: finite(score.black) ?? 0 };
}

function progressOne(value: unknown): DuelProgress {
  const p = record(value);
  const whole = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0);
  return {
    index: whole(p.index),
    solved: whole(p.solved),
    strikes: whole(p.strikes),
    done: p.done === true,
  };
}

function progressOf(value: unknown): DuelView['progress'] {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;
  return { white: progressOne(p.white), black: progressOne(p.black) };
}

function roundOf(game: DuelKind, value: unknown): DuelRound | null {
  const r = record(value);
  const round = finite(r.round);
  if (round === null) return null;
  const results = record(r.results);
  const winner = isSide(r.winner) || r.winner === 'shared' ? r.winner : null;
  return {
    round,
    results: { white: ownResult(game, results.white), black: ownResult(game, results.black) },
    winner,
    points: scoreOf(r.points),
  };
}

function chatOf(value: unknown): DuelView['chat'] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((line: unknown) => {
      const { by, phrase } = record(line);
      return isSide(by) && isPhrase(phrase) ? [{ by, text: PHRASES[phrase] }] : [];
    })
    .slice(-LIMITS.phrasesKept);
}

/** The rematch, a duel of the same kind: its seat is kept at once, and its page is where to go. */
function nextOf(value: unknown, game: DuelKind): DuelView['next'] {
  const { game: id, seat, color } = record(value);
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat) || !isSide(color)) return null;
  rememberSeat(id, seat, color, game);
  return { path: liveGamePath('relay', id, game) };
}

function blankDuel(id: string, you: Side): DuelView {
  return {
    id,
    connection: 'connecting',
    missing: false,
    you,
    host: you === 'white',
    white: { name: '', rating: null },
    black: { name: '', rating: null },
    game: 'race',
    opts: {},
    status: 'setup',
    setupDeadline: null,
    items: null,
    round: 0,
    phase: null,
    phaseEnds: null,
    liveSince: null,
    mine: null,
    theirs: null,
    rounds: [],
    score: { white: 0, black: 0 },
    progress: null,
    result: null,
    reason: null,
    offers: { rematch: null },
    opponentPresent: false,
    chat: [],
    next: null,
    error: null,
    preparing: false,
  };
}

/**
 * The connection to a duel on the relay, with this device's seat token
 * (`color` is the seat, known from the pairing: white hosts).
 */
export function createRelayDuel(
  id: string,
  seat: string,
  color: Side = 'white',
  prepare: PrepareDuel = defaultPrepare,
): DuelSession {
  let view = blankDuel(id, color);
  const listeners = new Set<() => void>();
  let loaded = false;
  let gone = false;
  let closed = false;
  /** The rounds this device made as the host, kept until the room has them. */
  let content: DuelItems | null = null;
  let preparing = false;
  /** This device's result in the round on, until the room has it (sent again after a reconnection). */
  let pendingRound: DuelReport | null = null;
  /** A timed race's results the room has not counted yet, oldest first. */
  let pendingTimed: DuelReport[] = [];

  const socket = new LiveSocket(() => liveSocketUrl(`/v1/games/${id}`), {
    open: () => {
      socket.send({ t: 'hello', seat });
    },
    message: onMessage,
    down: onDown,
  });

  function emit(patch: Partial<DuelView>): void {
    const next = { ...view, ...patch };
    const changed = (Object.keys(next) as (keyof DuelView)[]).some(
      (key) => next[key] !== view[key],
    );
    if (!changed) return;
    view = next;
    for (const listener of [...listeners]) listener();
  }

  /** Stay connected while the duel is on, or while someone is looking at it. */
  const wanted = () => !closed && !gone && (view.status !== 'over' || listeners.size > 0);

  function start(): void {
    if (!wanted() || socket.state !== 'idle') return;
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
      pendingRound = null;
      pendingTimed = [];
      emit(
        view.status === 'over' && code === CLOSE.closed
          ? { connection: 'closed' }
          : { missing: true, connection: 'closed' },
      );
      return;
    }
    if (!wanted()) {
      emit({ connection: 'closed' });
      return;
    }
    socket.retry();
    emit({ connection: loaded ? 'reconnecting' : 'connecting' });
  }

  function onMessage(message: Record<string, unknown>): void {
    switch (message.t) {
      case 'game':
        return onSnapshot(message);
      case 'content': {
        const items = duelContent(view.game, view.opts, message.items);
        if (items) emit({ items, error: null });
        return;
      }
      case 'round':
        return onRound(message);
      case 'reported':
        return onReported(message);
      case 'round-end':
        return onRoundEnd(message);
      case 'progress': {
        const progress = progressOf(message);
        if (!progress) return;
        const done = progress[view.you].index;
        pendingTimed = pendingTimed.filter((r) => 'index' in r && r.index >= done);
        return emit({ progress });
      }
      case 'end':
        return onEnd(message);
      case 'present':
        return emit({ opponentPresent: message[other(view.you)] === true });
      case 'say': {
        const { by, phrase } = message;
        if (!isSide(by) || !isPhrase(phrase)) return;
        return emit({
          chat: [...view.chat, { by, text: PHRASES[phrase] }].slice(-LIMITS.phrasesKept),
        });
      }
      case 'offers':
        return emit({
          offers: { rematch: isSide(message.rematch) ? message.rematch : null },
          error: null,
        });
      case 'rematch': {
        const next = nextOf(message, view.game);
        if (next) emit({ next, offers: { rematch: null }, error: null });
        return;
      }
      case 'error':
        pendingRound = null;
        return emit({
          error: typeof message.message === 'string' ? message.message : 'That was refused.',
        });
      default:
        return;
    }
  }

  function onSnapshot(message: Record<string, unknown>): void {
    if (!isSide(message.you) || !isDuel(message.game)) return;
    const now = performance.now();
    const you = message.you;
    const game = message.game;
    const opts = gameOptions(game, message.opts) ?? {};
    const status =
      message.status === 'over' ? 'over' : message.status === 'playing' ? 'playing' : 'setup';
    const items = message.items == null ? null : duelContent(game, opts, message.items);
    const setupIn = finite(message.setupIn);
    const phaseIn = finite(message.phaseIn);
    const liveFor = finite(message.liveFor);
    const present = record(message.present);
    const offers = record(message.offers);
    const rounds = Array.isArray(message.rounds)
      ? message.rounds.flatMap((r: unknown) => roundOf(game, r) ?? [])
      : [];
    loaded = true;
    socket.settled();
    emit({
      connection: 'open',
      missing: false,
      you,
      host: you === 'white',
      white: playerOf(message.white),
      black: playerOf(message.black),
      game,
      opts,
      status,
      setupDeadline: status === 'setup' && setupIn !== null ? now + setupIn : null,
      items,
      round: finite(message.round) ?? 0,
      phase: status === 'playing' ? phaseOf(message.phase) : null,
      phaseEnds: status === 'playing' && phaseIn !== null ? now + phaseIn : null,
      liveSince: status === 'playing' && liveFor !== null ? now - liveFor : null,
      mine: ownResult(game, message.mine),
      theirs: duelResultOf(game, message.theirs),
      rounds,
      score: scoreOf(message.score),
      progress: progressOf(message.progress),
      result: resultOf(message.result),
      reason: typeof message.reason === 'string' ? message.reason : null,
      offers: { rematch: isSide(offers.rematch) ? offers.rematch : null },
      opponentPresent: present[other(you)] === true,
      chat: chatOf(message.chat),
      next: nextOf(message.next, game),
    });
    if (view.host && view.status === 'setup' && !view.items) sendContent();
    sendPending();
  }

  /** The host's rounds: made once, sent whenever the room does not have them yet. */
  function sendContent(): void {
    if (content) {
      socket.send({ t: 'content', items: content });
      return;
    }
    if (preparing) return;
    preparing = true;
    emit({ preparing: true });
    prepare(view.game, view.opts).then(
      (items) => {
        preparing = false;
        if (closed || gone) return;
        content = items;
        emit({ preparing: false });
        if (view.status === 'setup' && !view.items) socket.send({ t: 'content', items });
      },
      (err: unknown) => {
        preparing = false;
        if (closed || gone) return;
        emit({
          preparing: false,
          error:
            err instanceof Error && err.message ? err.message : 'The rounds could not be prepared.',
        });
        // Nothing to play: the duel is called off rather than left to time out.
        socket.send({ t: 'abort' });
      },
    );
  }

  /** Results the room may not have had: sent again once a snapshot shows where it stands. */
  function sendPending(): void {
    if (view.status !== 'playing' || view.phase !== 'live') {
      pendingRound = null;
      pendingTimed = [];
      return;
    }
    const round = pendingRound;
    if (round && 'round' in round && round.round === view.round && !view.mine) {
      socket.send({ t: 'result', ...round });
    } else {
      pendingRound = null;
    }
    const done = view.progress?.[view.you].index ?? 0;
    pendingTimed = pendingTimed.filter((r) => 'index' in r && r.index >= done);
    for (const report of pendingTimed) socket.send({ t: 'result', ...report });
  }

  function onRound(message: Record<string, unknown>): void {
    const round = finite(message.round);
    const phase = phaseOf(message.phase);
    const inMs = finite(message.inMs);
    if (round === null || (phase !== 'countdown' && phase !== 'live') || inMs === null) return;
    const now = performance.now();
    if (phase === 'countdown') {
      pendingRound = null;
      emit({
        status: 'playing',
        setupDeadline: null,
        round,
        phase,
        phaseEnds: now + inMs,
        liveSince: null,
        mine: null,
        theirs: null,
        error: null,
      });
      return;
    }
    emit({ status: 'playing', round, phase, phaseEnds: now + inMs, liveSince: now });
  }

  function onReported(message: Record<string, unknown>): void {
    if (finite(message.round) !== view.round || !isSide(message.by)) return;
    const result = duelResultOf(view.game, message.result);
    if (!result) return;
    if (message.by === view.you) {
      pendingRound = null;
      if (!('locked' in result)) emit({ mine: result });
      return;
    }
    emit({ theirs: result });
  }

  function onRoundEnd(message: Record<string, unknown>): void {
    const ended = roundOf(view.game, message);
    if (!ended) return;
    pendingRound = null;
    emit({
      rounds: [...view.rounds.filter((r) => r.round !== ended.round), ended].sort(
        (a, b) => a.round - b.round,
      ),
      score: scoreOf(message.score),
      phase: 'reveal',
      phaseEnds: performance.now() + DUEL_RULES.revealMs,
      liveSince: null,
      mine: ended.results[view.you],
      theirs: ended.results[other(view.you)],
    });
  }

  function onEnd(message: Record<string, unknown>): void {
    pendingRound = null;
    pendingTimed = [];
    emit({
      status: 'over',
      result: resultOf(message.result),
      reason: typeof message.reason === 'string' ? message.reason : null,
      score: message.score ? scoreOf(message.score) : view.score,
      progress: progressOf(message.progress) ?? view.progress,
      setupDeadline: null,
      phase: null,
      phaseEnds: null,
      liveSince: null,
      offers: { rematch: null },
      error: null,
    });
  }

  /** What this device reported, as the room will tell it back (a judgement on its scale). */
  function optimistic(report: DuelReport): DuelResult | null {
    return duelReport(view.game, report);
  }

  function report(result: DuelReport): void {
    if (closed || gone || view.missing) return;
    if (view.status !== 'playing' || view.phase !== 'live') return;
    if ('index' in result) {
      pendingTimed.push(result);
      socket.send({ t: 'result', ...result });
      return;
    }
    if (view.mine || result.round !== view.round) return;
    pendingRound = result;
    const mine = optimistic(result);
    if (mine) emit({ mine, error: null });
    // Not connected: it goes once the room's next snapshot shows the round still on.
    socket.send({ t: 'result', ...result });
  }

  /** Sends anything else; it needs the connection. */
  function act(message: Record<string, unknown>): void {
    if (closed || gone || view.missing) return;
    if (!socket.send(message)) {
      emit({ error: DOWN_MESSAGE });
      return;
    }
    emit({ error: null });
  }

  start();

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
    report,
    abort: () => act({ t: 'abort' }),
    resign: () => act({ t: 'resign' }),
    rematch: (op) => {
      if (OPS.includes(op)) act({ t: 'rematch', op });
    },
    say: (phrase) => {
      if (isPhrase(phrase)) act({ t: 'say', phrase });
    },
    close() {
      if (closed) return;
      closed = true;
      pendingRound = null;
      pendingTimed = [];
      socket.dispose();
      emit({ connection: 'closed' });
    },
  };
}

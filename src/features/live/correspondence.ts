import { create } from 'zustand';
import { safeLocalStorage } from '@/lib/persistStorage';
import { storageKeyFor } from '@/store/profiles';
import { ID_PATTERN, isCorrespondence } from '../../../relay/src/live/shared.mjs';
import { setBarReason } from './bar';
import { clockRemaining, type Verdict, verdictOf } from './liveView';
import type { LiveGameView, Side } from './types';

/**
 * This device's correspondence games as they stood when their rooms last
 * said: whose move it is, by when, and how the finished ones ended. Play lists
 * them, and the bar says when it is your move, without connecting to every
 * room each time: sessions.ts keeps the list up to date from each game's
 * connection (`noteCorrespondence`), and checks on every game when Play opens
 * and when the app starts (`checkOnCorrespondence`). Kept per profile, on this
 * device only: it is a copy of what the rooms know.
 */
export const CORRESPONDENCE_STORAGE_KEY = 'chess-trainer:live-correspondence';

export interface CorrespondenceGame {
  id: string;
  you: Side;
  /** The opponent's name; '' while their seat is open (an invitation nobody has taken). */
  opponent: string;
  /** "3d": the days for every move. */
  tc: string;
  /** A game of Chess960 rather than chess. */
  chess960: boolean;
  /** Waiting for the friend the link went to; then on; then over. */
  status: 'waiting' | 'playing' | 'over';
  /** Whose move it is, while the game is on. */
  turn: Side | null;
  /** When the side to move must have moved (Date.now()), while the game is on. */
  deadline: number | null;
  /** How it ended, from this side. */
  verdict: Verdict | null;
  /** Moves played so far. */
  moves: number;
}

const storageKey = () => storageKeyFor(CORRESPONDENCE_STORAGE_KEY);

const SIDES: readonly string[] = ['white', 'black'];
const STATUSES: readonly string[] = ['waiting', 'playing', 'over'];
const VERDICTS: readonly string[] = ['win', 'loss', 'draw', 'aborted', 'unknown'];
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** One kept game, checked; null when it is not one. */
function gameOf(value: unknown): CorrespondenceGame | null {
  if (typeof value !== 'object' || value === null) return null;
  const g = value as Record<string, unknown>;
  if (typeof g.id !== 'string' || !ID_PATTERN.test(g.id) || !isCorrespondence(g.tc)) return null;
  if (!SIDES.includes(g.you as string) || !STATUSES.includes(g.status as string)) return null;
  return {
    id: g.id,
    you: g.you as Side,
    opponent: typeof g.opponent === 'string' ? g.opponent : '',
    tc: g.tc as string,
    chess960: g.chess960 === true,
    status: g.status as CorrespondenceGame['status'],
    turn: SIDES.includes(g.turn as string) ? (g.turn as Side) : null,
    deadline: isTime(g.deadline) ? g.deadline : null,
    verdict: VERDICTS.includes(g.verdict as string) ? (g.verdict as Verdict) : null,
    moves: isTime(g.moves) && g.moves >= 0 ? Math.floor(g.moves) : 0,
  };
}

function read(): CorrespondenceGame[] {
  const raw = safeLocalStorage.getItem(storageKey());
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.flatMap((value) => gameOf(value) ?? []) : [];
  } catch {
    return [];
  }
}

/** Your move first (the nearest deadline first), then theirs, then the invitations, then the ended. */
function ordered(games: readonly CorrespondenceGame[]): CorrespondenceGame[] {
  const rank = (g: CorrespondenceGame) =>
    g.status === 'playing' ? (g.turn === g.you ? 0 : 1) : g.status === 'waiting' ? 2 : 3;
  return [...games].sort(
    (a, b) =>
      rank(a) - rank(b) || (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || b.moves - a.moves,
  );
}

/** Whether it is this device's move in the game. */
export const yourMove = (game: CorrespondenceGame): boolean =>
  game.status === 'playing' && game.turn === game.you;

export const useCorrespondence = create<{ games: CorrespondenceGame[] }>()(() => ({
  games: ordered(read()),
}));

function store(games: CorrespondenceGame[]): void {
  const next = ordered(games);
  useCorrespondence.setState({ games: next });
  safeLocalStorage.setItem(storageKey(), JSON.stringify(next));
}

/** The bar speaks up while it is your move in any of them. */
function updateBar(games: readonly CorrespondenceGame[]): void {
  setBarReason('corr', games.some(yourMove));
}
// As the module loads (with the bar, at a start when a game may be on), the list as kept can
// only raise the bar: lowering it then would take the bar away before it checks on the games.
if (useCorrespondence.getState().games.some(yourMove)) setBarReason('corr', true);
useCorrespondence.subscribe((state) => updateBar(state.games));

const same = (a: CorrespondenceGame, b: CorrespondenceGame) =>
  (Object.keys(a) as (keyof CorrespondenceGame)[]).every((key) => a[key] === b[key]);

/**
 * A correspondence game's connection has news: its line in the list follows.
 * Watching (no seat) and games played at once are not this list's.
 */
export function noteCorrespondence(view: LiveGameView): void {
  if (view.watching || view.missing || !isCorrespondence(view.tc)) return;
  // A connection still waiting for its first word knows nothing yet.
  if (view.connection === 'connecting') return;
  const opponent = view.you === 'white' ? view.black : view.white;
  const playing = view.status === 'playing' && view.open === null;
  const turn: Side = view.moves.length % 2 === 0 ? 'white' : 'black';
  const running = view.clock?.running ?? null;
  const game: CorrespondenceGame = {
    id: view.id,
    you: view.you,
    opponent: view.open === null ? opponent.name : '',
    tc: view.tc,
    chess960: view.game === 'chess960',
    status: view.status === 'over' ? 'over' : playing ? 'playing' : 'waiting',
    turn: playing ? turn : null,
    deadline:
      playing && view.clock && running
        ? Date.now() + clockRemaining(view.clock, running, performance.now())
        : null,
    verdict: view.status === 'over' ? verdictOf(view) : null,
    moves: view.moves.length,
  };
  const games = useCorrespondence.getState().games;
  const known = games.find((g) => g.id === game.id);
  // A deadline that moved by less than a minute is the same deadline, seen a moment later.
  if (
    known &&
    same({ ...known, deadline: null }, { ...game, deadline: null }) &&
    Math.abs((known.deadline ?? 0) - (game.deadline ?? 0)) < 60_000
  ) {
    return;
  }
  store([...games.filter((g) => g.id !== game.id), game]);
}

/** Keeps only the games this device still has a seat in (the others are gone, or long over). */
export function keepCorrespondence(ids: ReadonlySet<string>): void {
  const games = useCorrespondence.getState().games;
  if (games.every((g) => ids.has(g.id))) return;
  store(games.filter((g) => ids.has(g.id)));
}

/** Drops a game whose room is gone. */
export function forgetCorrespondence(id: string): void {
  const games = useCorrespondence.getState().games;
  if (games.some((g) => g.id === id)) store(games.filter((g) => g.id !== id));
}

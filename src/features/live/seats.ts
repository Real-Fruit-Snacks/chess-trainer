import { safeLocalStorage } from '@/lib/persistStorage';
import { storageKeyFor } from '@/store/profiles';
import {
  ID_PATTERN,
  isDuel,
  isGame,
  LIMITS,
  SEAT_PATTERN,
} from '../../../relay/src/live/shared.mjs';
import type { GameKind, LiveSource, Side } from './types';

/**
 * Where a live game's page is, and the seats this device holds in games on
 * the relay. A seat token is the only way into a game room, and the relay
 * hands it out once (with the pairing), so it is kept in storage: a reload,
 * or a link back to the game later, finds its way in again. A game room lives
 * six hours at most, so a seat is forgotten after a day. A correspondence
 * game's seat is kept while the game is on (a year at most), and a week after
 * its end, as long as its room.
 */
export const SEATS_STORAGE_KEY = 'chess-trainer:live-seats';
/**
 * The Lichess games played here, by id ({at, over?}): no seat is needed for
 * those (the Lichess sign-in plays them), but after a restart the app still
 * checks on one that may be under way.
 */
export const LICHESS_GAMES_STORAGE_KEY = 'chess-trainer:live-lichess';
export const SEAT_KEEP_MS = 24 * 60 * 60 * 1000;

export interface SeatEntry {
  seat: string;
  color: Side;
  /** What is played: chess, a variant of it, or a duel (its page differs). */
  kind: GameKind;
  /** When this device was given the seat (Date.now()): about when the game began. */
  at: number;
  /** A correspondence game (days a move): kept until it ends, and a week after. */
  corr?: true;
  /** The game is known to be over: nothing to go back to after a restart. */
  over?: true;
  /** When it was found to be over (Date.now()). */
  overAt?: number;
}

/** Lichess game ids: eight letters and digits (twelve with the player's part). */
export const LICHESS_GAME_ID = /^[A-Za-z0-9]{8,12}$/;

/**
 * The page of a game: /play/online/<id> (chess and its variants), /play/duel/<id>
 * (a duel), or /play/online/lichess/<id>.
 */
export function liveGamePath(source: LiveSource, id: string, kind: GameKind = 'chess'): string {
  const safe = encodeURIComponent(id);
  if (source === 'lichess') return `/play/online/lichess/${safe}`;
  return isDuel(kind) ? `/play/duel/${safe}` : `/play/online/${safe}`;
}

/** The page that watches a game on the relay: /play/watch/<id>. */
export function watchGamePath(id: string): string {
  return `/play/watch/${encodeURIComponent(id)}`;
}

const seatsKey = () => storageKeyFor(SEATS_STORAGE_KEY);

/** A time kept less than a day ago. */
const recent = (at: unknown, now: number): at is number =>
  typeof at === 'number' && Number.isFinite(at) && now - at < SEAT_KEEP_MS;

const isTime = (at: unknown): at is number => typeof at === 'number' && Number.isFinite(at);

/**
 * Whether a seat is still worth keeping: a day for a game played at once; for
 * a correspondence game, while it is on, and a week after its end.
 */
function kept(entry: Record<string, unknown>, now: number): boolean {
  if (!isTime(entry.at)) return false;
  if (entry.corr !== true) return recent(entry.at, now);
  if (entry.over !== true) return now - entry.at < LIMITS.correspondenceAgeMs;
  const overAt = isTime(entry.overAt) ? entry.overAt : entry.at;
  return now - overAt < LIMITS.correspondenceKeepMs;
}

function isEntry(value: unknown, now: number): value is SeatEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const { seat, color } = entry;
  return (
    typeof seat === 'string' &&
    SEAT_PATTERN.test(seat) &&
    (color === 'white' || color === 'black') &&
    kept(entry, now)
  );
}

/** The seats kept, those older than a day (or damaged) left out. */
function readSeats(now: number): Record<string, SeatEntry> {
  const raw = safeLocalStorage.getItem(seatsKey());
  if (typeof raw !== 'string') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const seats: Record<string, SeatEntry> = {};
  for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (ID_PATTERN.test(id) && isEntry(entry, now)) {
      // A seat kept before the other games existed is one of chess.
      const kind = (entry as { kind?: unknown }).kind;
      seats[id] = {
        seat: entry.seat,
        color: entry.color,
        kind: isGame(kind) ? kind : 'chess',
        at: entry.at,
        ...(entry.corr === true ? { corr: true as const } : {}),
        ...(entry.over === true ? { over: true as const } : {}),
        ...(isTime(entry.overAt) ? { overAt: entry.overAt } : {}),
      };
    }
  }
  return seats;
}

/**
 * Keeps this device's seat in a game (and lets the seats no longer worth
 * keeping go); `correspondence` for a game played over days.
 */
export function rememberSeat(
  id: string,
  seat: string,
  color: Side,
  kind: GameKind = 'chess',
  now = Date.now(),
  correspondence = false,
): void {
  if (!ID_PATTERN.test(id) || !SEAT_PATTERN.test(seat)) return;
  const seats = readSeats(now);
  // The same seat told again (a rematch offered in every snapshot) keeps when it was first given.
  const known = seats[id];
  if (known?.seat === seat && known.color === color && known.kind === kind) return;
  seats[id] = { seat, color, kind, at: now, ...(correspondence ? { corr: true as const } : {}) };
  safeLocalStorage.setItem(seatsKey(), JSON.stringify(seats));
}

/** The correspondence games this device holds a seat in, the finished ones of the last week too. */
export function correspondenceSeats(now = Date.now()): (SeatEntry & { id: string })[] {
  return Object.entries(readSeats(now))
    .filter(([, seat]) => seat.corr)
    .map(([id, seat]) => ({ ...seat, id }));
}

/** This device's seat in a game, or null when it holds none (or forgot it). */
export function seatOf(id: string, now = Date.now()): SeatEntry | null {
  return readSeats(now)[id] ?? null;
}

/* ------------------------------------------------------------------ */
/* Games to check on after a restart                                  */
/* ------------------------------------------------------------------ */

const lichessKey = () => storageKeyFor(LICHESS_GAMES_STORAGE_KEY);

function readLichessGames(now: number): Record<string, { at: number; over?: true }> {
  const raw = safeLocalStorage.getItem(lichessKey());
  if (typeof raw !== 'string') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const games: Record<string, { at: number; over?: true }> = {};
  for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (!LICHESS_GAME_ID.test(id) || typeof entry !== 'object' || entry === null) continue;
    const { at, over } = entry as Record<string, unknown>;
    if (recent(at, now)) games[id] = { at, ...(over === true ? { over: true as const } : {}) };
  }
  return games;
}

/** Notes a Lichess game played here (once: the first time keeps when it began). */
export function rememberLichessGame(id: string, now = Date.now()): void {
  if (!LICHESS_GAME_ID.test(id)) return;
  const games = readLichessGames(now);
  if (games[id]) return;
  games[id] = { at: now };
  safeLocalStorage.setItem(lichessKey(), JSON.stringify(games));
}

/** Notes that a game is over: a restart has nothing to go back to there. */
export function markGameOver(source: LiveSource, id: string, now = Date.now()): void {
  if (source === 'relay') {
    const seats = readSeats(now);
    const seat = seats[id];
    if (!seat || seat.over) return;
    seats[id] = { ...seat, over: true, overAt: now };
    safeLocalStorage.setItem(seatsKey(), JSON.stringify(seats));
    return;
  }
  const games = readLichessGames(now);
  const game = games[id];
  if (!game || game.over) return;
  games[id] = { ...game, over: true };
  safeLocalStorage.setItem(lichessKey(), JSON.stringify(games));
}

/**
 * The games this device may still be playing: not known to be over, and
 * younger than a game room can be. After a restart the app connects to each to
 * find out, so the bar can lead back to one that is still on. Correspondence
 * games are not among them: their list (correspondence.ts) checks on those.
 */
export function gamesToCheck(
  now = Date.now(),
): { source: LiveSource; id: string; kind: GameKind }[] {
  const young = (at: number) => now - at < LIMITS.roomAgeMs;
  return [
    ...Object.entries(readSeats(now))
      .filter(([, seat]) => !seat.over && !seat.corr && young(seat.at))
      .map(([id, seat]) => ({ source: 'relay' as const, id, kind: seat.kind })),
    ...Object.entries(readLichessGames(now))
      .filter(([, game]) => !game.over && young(game.at))
      .map(([id]) => ({ source: 'lichess' as const, id, kind: 'chess' as const })),
  ];
}

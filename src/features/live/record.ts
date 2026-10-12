import { Chess } from 'chess.js';
import { Chess960Game, chess960Headers, chess960Number } from '@/chess/chess960';
import { type ImportedGame, speedFromTimeControl } from '@/lib/gameImport';
import { siteConfig } from '@/site.config';
import { useGames } from '@/store/games';
import { playUci } from '../../../relay/src/live/rules.mjs';
import { parseTimeControl } from '../../../relay/src/live/shared.mjs';
import { describeTimeControl } from './liveView';
import { seatOf } from './seats';
import type { LiveEndReason, LiveGameView } from './types';

/**
 * Finished live games go to My games, like imported ones, ready for the
 * engine review: as `online` games when played through the relay, as Lichess
 * games (with their link) when played there. Each carries the learner's side,
 * since the names in it are generated ones that match nothing the learner
 * imports under. A game on the relay played against the clock carries the
 * clock after each move (`{ [%clk 0:04:59] }`, as Lichess writes it), so the
 * review can show how the time was spent; correspondence carries none. A
 * Chess960 game carries the tags that make it one (`[Variant "Chess960"]`,
 * `[SetUp "1"]`, `[FEN …]`), which Analyze and My games read.
 */

/** Games recorded since the app started (the games store's own check catches the rest). */
const recorded = new Set<string>();

const pad = (n: number) => String(n).padStart(2, '0');

/** A PGN date (YYYY.MM.DD), in local time like the app's other games. */
function pgnDate(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** PGN's Termination tag: Lichess's words for the endings it names. */
function termination(reason: LiveEndReason | null): string {
  if (reason === 'time') return 'Time forfeit';
  if (reason === 'abandoned') return 'Abandoned';
  return 'Normal';
}

/**
 * "Casual game · 5+3", "Army Draft · 30 points · 5+3", "Rated game on Lichess · 10+0",
 * "Correspondence game · 3 days a move", "Chess960 · position 274 · 5+3".
 */
function eventOf(view: LiveGameView): string {
  if (view.source === 'lichess') {
    return `${view.rated ? 'Rated' : 'Casual'} game on Lichess · ${view.tc}`;
  }
  const chess960 = view.game === 'chess960';
  if (parseTimeControl(view.tc)?.perMoveMs) {
    const what = chess960 ? 'Chess960 correspondence game' : 'Correspondence game';
    return `${what} · ${describeTimeControl(view.tc)}`;
  }
  if (chess960) {
    const n = view.startFen ? chess960Number(view.startFen) : null;
    return `Chess960${n === null ? '' : ` · position ${n}`} · ${view.tc}`;
  }
  if (view.game === 'army') {
    return `Army Draft${view.draft ? ` · ${view.draft.budget} points` : ''} · ${view.tc}`;
  }
  if (view.game === 'blindfold') return `Blindfold game · ${view.tc}`;
  return `Casual game · ${view.tc}`;
}

/**
 * The SAN of each move (from `startFen`, or the initial position), or null when one is not
 * legal; by Chess960's rules for a Chess960 game.
 */
function sanMoves(
  moves: readonly string[],
  startFen: string | null,
  chess960: boolean,
): string[] | null {
  if (chess960) {
    const game = startFen ? Chess960Game.from(startFen) : null;
    if (!game) return null;
    const sans: string[] = [];
    for (const uci of moves) {
      const move = game.move(uci);
      if (!move) return null;
      sans.push(move.san);
    }
    return sans;
  }
  let chess: Chess;
  try {
    chess = startFen ? new Chess(startFen) : new Chess();
  } catch {
    return null;
  }
  const sans: string[] = [];
  for (const uci of moves) {
    const move = playUci(chess, uci);
    if (!move) return null;
    sans.push(move.san);
  }
  return sans;
}

/** A clock reading as `[%clk]` writes it: hours, minutes and whole seconds ("0:04:59"). */
function clockText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

/**
 * Numbered moves, each with its clock reading when there are `clocks` (Black's
 * move then numbered again after White's comment, "1... e5"), and the result,
 * in lines of 80 characters at most (every game here starts with White to move).
 */
function movetext(
  sans: readonly string[],
  result: string,
  clocks: readonly number[] | null,
): string {
  const tokens: string[] = [];
  sans.forEach((san, index) => {
    if (index % 2 === 0) tokens.push(`${index / 2 + 1}.`);
    else if (clocks) tokens.push(`${(index + 1) / 2}...`);
    tokens.push(san);
    const reading = clocks?.[index];
    if (reading !== undefined) tokens.push(`{ [%clk ${clockText(reading)}] }`);
  });
  tokens.push(result);
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > 80) {
      lines.push(line);
      line = token;
    } else {
      line = line ? `${line} ${token}` : token;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

const quoted = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Keeps a finished game in My games (once per game; an aborted game, or one
 * with fewer than two moves, is not kept).
 */
export function recordLiveGame(view: LiveGameView): void {
  const result = view.result;
  if (view.status !== 'over' || result === null || result === '*') return;
  if (view.moves.length < 2) return;
  const key = `${view.source}:${view.id}`;
  if (recorded.has(key)) return;
  const chess960 = view.game === 'chess960';
  const sans = sanMoves(view.moves, view.startFen, chess960);
  if (!sans) return;
  recorded.add(key);

  const lichess = view.source === 'lichess';
  const url = lichess ? `https://lichess.org/${encodeURIComponent(view.id)}` : null;
  // A relay game is dated from its seat, so recording it again (after a reload) writes the same PGN.
  const startedAt = (lichess ? null : seatOf(view.id)?.at) ?? Date.now();
  const tc = parseTimeControl(view.tc);
  // PGN's TimeControl: "300+3", or "1/259200" (one move in so many seconds) for correspondence.
  const timeControl = !tc
    ? null
    : tc.perMoveMs
      ? `1/${tc.perMoveMs / 1000}`
      : `${tc.initialMs / 1000}+${tc.incrementMs / 1000}`;
  const event = eventOf(view);
  const date = pgnDate(startedAt);
  // The clock after each move, as the room kept it: a relay game against the clock, whole.
  const clocks =
    !lichess && tc && !tc.perMoveMs && view.clocks.length === view.moves.length
      ? view.clocks
      : null;

  const headers: Record<string, string> = {
    Event: event,
    Site: url ?? siteConfig.siteUrl,
    Date: date,
    White: view.white.name,
    Black: view.black.name,
    Result: result,
  };
  // Lichess ratings only: the relay's are puzzle ratings, which PGN readers would take for Elo.
  if (lichess && view.white.rating !== null) headers.WhiteElo = String(view.white.rating);
  if (lichess && view.black.rating !== null) headers.BlackElo = String(view.black.rating);
  if (timeControl) headers.TimeControl = timeControl;
  headers.Termination = termination(view.reason);
  // Chess960 from its start; a drafted position as Lichess tags a game from a position.
  if (chess960 && view.startFen) {
    Object.assign(headers, chess960Headers(view.startFen));
  } else if (view.startFen) {
    headers.Variant = 'From Position';
    headers.SetUp = '1';
    headers.FEN = view.startFen;
  }

  const pgn = `${Object.entries(headers)
    .map(([name, value]) => `[${name} "${quoted(value)}"]`)
    .join('\n')}\n\n${movetext(sans, result, clocks)}`;

  const game: ImportedGame = {
    id: url ?? `online-${view.id}`,
    pgn,
    white: view.white.name,
    black: view.black.name,
    result,
    date,
    event,
    url,
    plies: view.moves.length,
    speed: speedFromTimeControl(timeControl ?? undefined),
    rated: lichess ? view.rated : false,
    timestamp: startedAt,
    headers,
    ...(view.startFen ? { startFen: view.startFen } : {}),
    side: view.you,
  };
  useGames.getState().addGames([game], lichess ? 'lichess' : 'online');
}

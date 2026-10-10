import { Chess } from 'chess.js';
import { type ImportedGame, speedFromTimeControl } from '@/lib/gameImport';
import { siteConfig } from '@/site.config';
import { useGames } from '@/store/games';
import { playUci } from '../../../relay/src/live/rules.mjs';
import { parseTimeControl } from '../../../relay/src/live/shared.mjs';
import { seatOf } from './seats';
import type { LiveEndReason, LiveGameView } from './types';

/**
 * Finished live games go to My games, like imported ones, ready for the
 * engine review: as `online` games when played through the relay, as Lichess
 * games (with their link) when played there. Each carries the learner's side,
 * since the names in it are generated ones that match nothing the learner
 * imports under.
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

/** "Casual game · 5+3", "Rated game on Lichess · 10+0". */
function eventOf(view: LiveGameView): string {
  if (view.source === 'relay') return `Casual game · ${view.tc}`;
  return `${view.rated ? 'Rated' : 'Casual'} game on Lichess · ${view.tc}`;
}

/** The SAN of each move, or null when one of them is not legal. */
function sanMoves(moves: readonly string[]): string[] | null {
  const chess = new Chess();
  const sans: string[] = [];
  for (const uci of moves) {
    const move = playUci(chess, uci);
    if (!move) return null;
    sans.push(move.san);
  }
  return sans;
}

/** Numbered moves and the result, in lines of 80 characters at most. */
function movetext(sans: readonly string[], result: string): string {
  const tokens: string[] = [];
  sans.forEach((san, index) => {
    if (index % 2 === 0) tokens.push(`${index / 2 + 1}.`);
    tokens.push(san);
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
  const sans = sanMoves(view.moves);
  if (!sans) return;
  recorded.add(key);

  const lichess = view.source === 'lichess';
  const url = lichess ? `https://lichess.org/${encodeURIComponent(view.id)}` : null;
  // A relay game is dated from its seat, so recording it again (after a reload) writes the same PGN.
  const startedAt = (lichess ? null : seatOf(view.id)?.at) ?? Date.now();
  const tc = parseTimeControl(view.tc);
  const timeControl = tc ? `${tc.initialMs / 1000}+${tc.incrementMs / 1000}` : null;
  const event = eventOf(view);
  const date = pgnDate(startedAt);

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

  const pgn = `${Object.entries(headers)
    .map(([name, value]) => `[${name} "${quoted(value)}"]`)
    .join('\n')}\n\n${movetext(sans, result)}`;

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
    side: view.you,
  };
  useGames.getState().addGames([game], lichess ? 'lichess' : 'online');
}

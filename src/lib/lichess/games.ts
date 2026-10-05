import { type GameRecord, MAX_GAMES } from '@/store/progress';
import { lichessJson, lichessTextStream } from './api';
import { recordFromPgn } from './records';

/**
 * Games both ways. A game played here goes to Lichess as an imported game
 * (Lichess imports the same text only once, so a retry never doubles it),
 * carrying the app's record of it (see `records.ts`). Another device reads the
 * account's imported games back and restores every game that carries one.
 */

/** Imports one game into the account (Lichess returns the same game for the same text). */
export async function importGame(
  token: string,
  pgn: string,
): Promise<{ id: string; url: string | null }> {
  const answer = await lichessJson<{ id?: unknown; url?: unknown }>('/api/import', {
    token,
    form: { pgn },
  });
  if (!answer || typeof answer.id !== 'string') {
    throw new Error('Lichess did not say where the game went.');
  }
  return { id: answer.id, url: typeof answer.url === 'string' ? answer.url : null };
}

/**
 * Imported games read at most, newest first: Lichess sends 20 a second, so
 * an account with thousands of imports of its own is not read to the end.
 */
export const MAX_IMPORTS_READ = 1000;

/**
 * The app's games among the account's imported games, newest first, as
 * records — at most `max` (the game log keeps no more), so reading stops
 * once that many have come, or after `MAX_IMPORTS_READ` games of any kind.
 * Lichess sends each imported text followed by two empty lines.
 */
export async function readImportedRecords(token: string, max = MAX_GAMES): Promise<GameRecord[]> {
  const records: GameRecord[] = [];
  const ids = new Set<string>();
  let read = 0;
  const take = (text: string) => {
    read++;
    const record = recordFromPgn(text);
    if (record && !ids.has(record.id)) {
      ids.add(record.id);
      records.push(record);
    }
  };
  const enough = () => records.length >= max || read >= MAX_IMPORTS_READ;
  let buffer = '';
  const finished = await lichessTextStream(
    '/api/games/export/imports',
    (piece) => {
      buffer += piece;
      const games = buffer.split(/\n{3,}/);
      buffer = games.pop() ?? '';
      for (const game of games) {
        if (enough()) break;
        take(game);
      }
      return !enough();
    },
    { token, accept: 'application/x-chess-pgn' },
  );
  if (finished && !enough() && buffer.trim()) take(buffer);
  return records;
}

import type { GameRecord, GameRecordSource } from '@/store/progress';

/**
 * A game record inside its own PGN, for the trip through Lichess: the record
 * travels in a `ChessTrainer` tag, which Lichess keeps (it stores an imported
 * PGN exactly as sent). No network code here — the progress store uses this
 * when it queues a finished game.
 */
export const RECORD_TAG = 'ChessTrainer';
const RECORD_VERSION = '1';

const SOURCES: readonly GameRecordSource[] = [
  'play',
  'ladder',
  'book',
  'arcade',
  'simul',
  'drill',
  'humanlike',
];

/** Drill games are short exercises from set positions: they stay on this device. */
export function syncsGame(record: Pick<GameRecord, 'source'>): boolean {
  return record.source !== 'drill';
}

/** The record as the tag's value (form-encoded, so it needs no PGN escaping). */
export function encodeRecord(record: GameRecord): string {
  const params = new URLSearchParams({
    v: RECORD_VERSION,
    id: record.id,
    at: String(record.at),
    level: String(record.level),
    color: record.color,
    result: record.result,
    reason: record.reason,
    plies: String(record.plies),
    source: record.source,
  });
  if (record.opponentRating !== undefined) params.set('rating', String(record.opponentRating));
  if (record.event) params.set('event', record.event);
  if (record.book) params.set('book', JSON.stringify(record.book));
  return params.toString();
}

const finite = (value: string | null): number | null => {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** The record from a tag's value and its game's PGN; null when anything is missing or wrong. */
export function decodeRecord(value: string, pgn: string): GameRecord | null {
  const params = new URLSearchParams(value);
  if (params.get('v') !== RECORD_VERSION) return null;
  const id = params.get('id');
  const at = finite(params.get('at'));
  const level = finite(params.get('level'));
  const plies = finite(params.get('plies'));
  const color = params.get('color');
  const result = params.get('result');
  const reason = params.get('reason');
  const source = params.get('source') as GameRecordSource | null;
  if (
    !id ||
    at === null ||
    level === null ||
    plies === null ||
    (color !== 'white' && color !== 'black') ||
    (result !== '1-0' && result !== '0-1' && result !== '1/2-1/2') ||
    reason === null ||
    !source ||
    !SOURCES.includes(source)
  ) {
    return null;
  }
  const record: GameRecord = { id, at, level, color, result, reason, plies, pgn, source };
  const rating = finite(params.get('rating'));
  if (rating !== null) record.opponentRating = rating;
  const event = params.get('event');
  if (event) record.event = event;
  const book = params.get('book');
  if (book) {
    try {
      const parsed = JSON.parse(book) as GameRecord['book'];
      if (
        parsed &&
        typeof parsed.repertoireId === 'string' &&
        (parsed.status === 'in-book' ||
          parsed.status === 'out-of-book' ||
          parsed.status === 'deviated')
      ) {
        record.book = {
          repertoireId: parsed.repertoireId,
          status: parsed.status,
          endedAtPly: typeof parsed.endedAtPly === 'number' ? parsed.endedAtPly : null,
          deviationPly: typeof parsed.deviationPly === 'number' ? parsed.deviationPly : null,
        };
      }
    } catch {
      // A book that cannot be read is left out; the game itself is fine.
    }
  }
  return record;
}

const TAG_LINE = new RegExp(`^\\[${RECORD_TAG} "([^"]*)"\\]\\s*$`, 'm');

/** The game's PGN with the record's tag after its other tags (any older copy of it replaced). */
export function pgnForLichess(record: GameRecord): string {
  const pgn = stripRecordTag(record.pgn).trim();
  const tag = `[${RECORD_TAG} "${encodeRecord({ ...record, pgn })}"]`;
  const lines = pgn.split('\n');
  let lastHeader = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim().startsWith('[')) lastHeader = i;
    else if ((lines[i] ?? '').trim() !== '') break;
  }
  if (lastHeader < 0) return `${tag}\n\n${pgn}`;
  lines.splice(lastHeader + 1, 0, tag);
  return lines.join('\n');
}

/** The PGN without the record's tag (as the game log keeps it). */
export function stripRecordTag(pgn: string): string {
  return pgn
    .split('\n')
    .filter((line) => !TAG_LINE.test(line))
    .join('\n');
}

/** The record carried by an imported game's PGN, or null for any other game. */
export function recordFromPgn(pgn: string): GameRecord | null {
  const match = TAG_LINE.exec(pgn);
  if (!match) return null;
  return decodeRecord(match[1] ?? '', stripRecordTag(pgn).trim());
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameRecord } from '@/store/progress';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import { importGame, MAX_IMPORTS_READ, readImportedRecords } from './games';
import {
  decodeRecord,
  encodeRecord,
  pgnForLichess,
  RECORD_TAG,
  recordFromPgn,
  stripRecordTag,
  syncsGame,
} from './records';

const PGN = `[Event "Casual game"]
[White "You"]
[Black "Engine level 3"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'g-1',
    at: Date.UTC(2026, 8, 30, 18),
    level: 3,
    color: 'white',
    result: '1-0',
    reason: 'checkmate',
    plies: 7,
    pgn: PGN,
    source: 'play',
    ...overrides,
  };
}

describe('Game records in a PGN tag', () => {
  it('round-trips every field through the tag', () => {
    const full = record({
      source: 'book',
      opponentRating: 1500,
      event: 'Opening practice: “Italian” & more',
      book: { repertoireId: 'italian', status: 'deviated', endedAtPly: null, deviationPly: 9 },
    });
    expect(decodeRecord(encodeRecord(full), PGN)).toEqual(full);
    expect(decodeRecord(encodeRecord(record()), PGN)).toEqual(record());
  });

  it('refuses tags it cannot trust', () => {
    const value = encodeRecord(record());
    expect(decodeRecord(value.replace('v=1', 'v=2'), PGN)).toBeNull();
    expect(decodeRecord(value.replace('source=play', 'source=hack'), PGN)).toBeNull();
    expect(decodeRecord(value.replace('result=1-0', 'result=2-0'), PGN)).toBeNull();
    expect(decodeRecord(value.replace(/&at=\d+/, ''), PGN)).toBeNull();
    // A damaged book is left out; the game itself is fine.
    const withBook = encodeRecord(record()) + '&book=%7Bnope';
    expect(decodeRecord(withBook, PGN)?.book).toBeUndefined();
  });

  it('puts the tag after the other tags, once, and takes it out again', () => {
    const tagged = pgnForLichess(record());
    const lines = tagged.split('\n');
    expect(lines[4]?.startsWith(`[${RECORD_TAG} "`)).toBe(true);
    expect(lines[5]).toBe('');
    expect(pgnForLichess(record({ pgn: tagged }))).toBe(tagged);
    expect(stripRecordTag(tagged)).toBe(PGN);
    expect(recordFromPgn(tagged)).toEqual(record());
    expect(recordFromPgn(PGN)).toBeNull();
    const bare = pgnForLichess(record({ pgn: '1. e4 e5 *' }));
    expect(bare.split('\n')[0]?.startsWith(`[${RECORD_TAG}`)).toBe(true);
    expect(recordFromPgn(bare)?.pgn).toBe('1. e4 e5 *');
  });

  it('keeps drill games on this device', () => {
    expect(syncsGame({ source: 'drill' })).toBe(false);
    expect(syncsGame({ source: 'simul' })).toBe(true);
  });
});

describe('Games on Lichess', () => {
  let lichess: FakeLichessHandle;

  beforeEach(() => {
    lichess = installFakeLichess();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('imports a game once, however often it is sent', async () => {
    const token = lichess.fake.issueToken();
    const first = await importGame(token, pgnForLichess(record()));
    const again = await importGame(token, pgnForLichess(record()));
    const other = await importGame(token, pgnForLichess(record({ id: 'g-2' })));
    expect(again.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    expect(first.url).toBe(`https://lichess.org/${first.id}`);
    expect(lichess.fake.imports).toHaveLength(2);
  });

  it('brings back the app’s games, newest first, and stops at the number wanted', async () => {
    const token = lichess.fake.issueToken();
    await importGame(token, pgnForLichess(record({ id: 'g-1' })));
    await importGame(token, PGN);
    await importGame(token, pgnForLichess(record({ id: 'g-2', at: 2 })));
    await importGame(token, pgnForLichess(record({ id: 'g-3', at: 3 })));
    expect((await readImportedRecords(token)).map((r) => r.id)).toEqual(['g-3', 'g-2', 'g-1']);
    expect((await readImportedRecords(token, 2)).map((r) => r.id)).toEqual(['g-3', 'g-2']);
  });

  it('reads the newest imports only, however many the account has', async () => {
    const token = lichess.fake.issueToken();
    await importGame(token, pgnForLichess(record({ id: 'g-old', at: 1 })));
    for (let i = 0; i < MAX_IMPORTS_READ; i++) {
      lichess.fake.imports.push({
        id: `gm${String(i).padStart(6, '0')}`,
        pgn: `[Event "Elsewhere ${i}"]\n\n1. e4 e5 *`,
        userId: 'learner',
        // Imported after it.
        at: lichess.fake.clock + 1000 + i,
      });
    }
    expect(await readImportedRecords(token)).toEqual([]);
  });

  it('reads no one else’s imports', async () => {
    const token = lichess.fake.issueToken();
    await importGame('', pgnForLichess(record()));
    expect(await readImportedRecords(token)).toEqual([]);
  });
});

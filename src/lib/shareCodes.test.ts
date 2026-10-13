import { describe, expect, it } from 'vitest';
import {
  decodeShare,
  encodeShare,
  MAX_SHARED_NAME_LENGTH,
  MAX_SHARED_WOODPECKER_IDS,
  readShare,
} from './shareCodes';
import { compressText } from './shareLink';

describe('share codes', () => {
  it('round-trips a repertoire and a Woodpecker set through a compressed fragment', async () => {
    const rep = await encodeShare({
      kind: 'repertoire',
      name: 'My Italian',
      color: 'white',
      pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (3... Nf6 4. d3) 4. c3 *',
    });
    expect(rep.startsWith('rep=')).toBe(true);
    expect(await decodeShare(`#${rep}`)).toEqual({
      kind: 'repertoire',
      name: 'My Italian',
      color: 'white',
      pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (3... Nf6 4. d3) 4. c3 *',
    });
    const ids = Array.from({ length: 50 }, (_, i) => `id${i.toString(36)}`);
    const wp = await encodeShare({ kind: 'woodpecker', puzzleIds: ids, rating: 1450 });
    expect(await decodeShare(wp)).toEqual({ kind: 'woodpecker', puzzleIds: ids, rating: 1450 });
    // Compact: fifty ids compress well below their raw size.
    expect(wp.length).toBeLessThan(JSON.stringify(ids).length);
  });

  it('rejects fragments that carry nothing valid', async () => {
    expect(await decodeShare('')).toBeNull();
    expect(await decodeShare('#z=abc')).toBeNull();
    expect(await decodeShare('#rep=not-base64!!')).toBeNull();
  });
});

describe('share code limits', () => {
  it('de-duplicates and caps Woodpecker ids and trims repertoire names', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id${i % 300}`);
    const wp = await decodeShare(
      await encodeShare({ kind: 'woodpecker', puzzleIds: ids, rating: 1500 }),
    );
    expect(wp?.kind).toBe('woodpecker');
    if (wp?.kind === 'woodpecker') {
      expect(wp.puzzleIds).toHaveLength(MAX_SHARED_WOODPECKER_IDS);
      expect(new Set(wp.puzzleIds).size).toBe(MAX_SHARED_WOODPECKER_IDS);
    }
    const rep = await decodeShare(
      await encodeShare({
        kind: 'repertoire',
        name: 'x'.repeat(500),
        color: 'white',
        pgn: '1. e4 *',
      }),
    );
    expect(rep?.kind === 'repertoire' && rep.name.length).toBe(MAX_SHARED_NAME_LENGTH);
    // Ids that are not ids, and empty sets, are refused.
    const junk = await decodeShare(
      await encodeShare({ kind: 'woodpecker', puzzleIds: ['<script>', ''], rating: 1500 }),
    );
    expect(junk).toBeNull();
  });

  it('reports why a fragment cannot be read', async () => {
    expect(await readShare('')).toEqual({ ok: false, kind: 'empty' });
    expect(await readShare('#rep=!!!')).toEqual({ ok: false, kind: 'invalid' });
    const bomb = await compressText(
      JSON.stringify({ name: 'x'.repeat(1_100_000), color: 'white', pgn: '' }),
    );
    expect(await readShare(`#rep=${bomb}`)).toEqual({ ok: false, kind: 'too-large' });
  });
});

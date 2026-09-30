import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from './shareCodes';

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

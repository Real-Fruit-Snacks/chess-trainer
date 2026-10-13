import { describe, expect, it } from 'vitest';
import {
  buildShareFragment,
  compressText,
  decompressText,
  MAX_INFLATED_BYTES,
  MAX_PLAIN_CHARS,
  parseShareFragment,
  readShareFragment,
} from './shareLink';

const PGN =
  '[Event "Candidates final"]\n[White "Karpov"]\n[Black "Korchnoi"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 Nc6 8. Qd2 O-O 9. Bc4 Bd7 10. h4 Rc8 11. Bb3 Ne5 12. O-O-O Nc4 13. Bxc4 Rxc4 14. h5 Nxh5 15. g4 Nf6 16. Nde2 Qa5 17. Bh6 Bxh6 18. Qxh6 Rfc8 19. Rd3 R4c5 20. g5 Rxg5 21. Rd5 Rxd5 22. Nxd5 Re8 23. Nef4 Bc6 24. e5 Bxd5 25. exf6 exf6 26. Qxh7+ Kf8 27. Qh8+ 1-0';

describe('share links', () => {
  it('round-trips a PGN through deflate and base64url', async () => {
    const packed = await compressText(PGN);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(packed.length).toBeLessThan(PGN.length);
    expect(await decompressText(packed)).toBe(PGN);
  });

  it('builds and parses fragments with a ply', async () => {
    const fragment = await buildShareFragment({ pgn: PGN, ply: 7 });
    expect(fragment).toMatch(/^z=[A-Za-z0-9_-]+&ply=7$/);
    expect(await parseShareFragment(`#${fragment}`)).toEqual({ pgn: PGN, ply: 7 });
    const fen = await buildShareFragment({ fen: '8/8/8/8/8/8/8/K6k w - - 0 1' });
    expect(await parseShareFragment(fen)).toEqual({ fen: '8/8/8/8/8/8/8/K6k w - - 0 1' });
    expect(await parseShareFragment('#pgn=1.%20e4%20e5')).toEqual({ pgn: '1. e4 e5' });
  });

  it('keeps the start position and a variation path in the link', async () => {
    // Ply 0 is written out, so the link opens at the start rather than at the end.
    const start = await buildShareFragment({ pgn: PGN, ply: 0 });
    expect(start).toMatch(/&ply=0$/);
    expect(await parseShareFragment(`#${start}`)).toEqual({ pgn: PGN, ply: 0 });
    // Without a ply the reader reports none (older links open at the end).
    expect(await parseShareFragment(`#pgn=1.%20e4`)).toEqual({ pgn: '1. e4' });
    const line = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4'];
    const variation = await buildShareFragment({ pgn: PGN, ply: 5, line });
    expect(variation).toMatch(/&ply=5&line=e2e4\.c7c5\.g1f3\.d7d6\.d2d4$/);
    expect(await parseShareFragment(`#${variation}`)).toEqual({ pgn: PGN, ply: 5, line });
    // A malformed path is ignored rather than trusted.
    expect(await parseShareFragment('#pgn=1.%20e4&line=xx.yy')).toEqual({ pgn: '1. e4' });
    expect(await buildShareFragment({ pgn: PGN, line: ['bogus'] })).not.toContain('line=');
  });

  it('rejects empty or broken fragments', async () => {
    expect(await parseShareFragment('')).toBeNull();
    expect(await parseShareFragment('#other=1')).toBeNull();
    expect(await parseShareFragment('#z=!!!not-base64!!!')).toBeNull();
  });
});

describe('share link limits', () => {
  it('caps inflated payloads and leaves no unhandled rejection on malformed data', async () => {
    const bomb = await compressText('x'.repeat(MAX_INFLATED_BYTES + 10));
    const big = await readShareFragment(`#z=${bomb}`);
    expect(big).toEqual({ ok: false, kind: 'too-large' });
    const fits = await compressText('1. e4 e5 *');
    expect((await readShareFragment(`#z=${fits}`)).ok).toBe(true);
    // Malformed data is reported, not thrown — and vitest fails the run on any
    // unhandled rejection, so the write side's promise must be caught too.
    expect(await readShareFragment('#z=!!!not-base64!!!')).toEqual({ ok: false, kind: 'invalid' });
    expect(await readShareFragment('#z=AAAAAAAAAAAAAAAA')).toEqual({ ok: false, kind: 'invalid' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The plain fallback has the same cap.
    const huge = await readShareFragment(`#pgn=${'e'.repeat(MAX_PLAIN_CHARS + 1)}`);
    expect(huge).toEqual({ ok: false, kind: 'too-large' });
  });

  it('says that compressed links need Compression Streams when the browser lacks them', async () => {
    const original = globalThis.DecompressionStream;
    // @ts-expect-error -- simulating Safari 16.0–16.3
    delete globalThis.DecompressionStream;
    try {
      const result = await readShareFragment(
        '#z=i3YtS80rUVByy6woKS1KVYrl4jLUU0g1UUg1VTDSU_BLM1bwSzZTMNZTcEoyVUg0U9ACAA',
      );
      expect(result).toEqual({ ok: false, kind: 'unsupported' });
      // Plain links still open.
      expect((await readShareFragment('#pgn=1.%20e4%20e5')).ok).toBe(true);
    } finally {
      globalThis.DecompressionStream = original;
    }
  });
});

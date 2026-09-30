import { describe, expect, it } from 'vitest';
import { buildShareFragment, compressText, decompressText, parseShareFragment } from './shareLink';

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

  it('rejects empty or broken fragments', async () => {
    expect(await parseShareFragment('')).toBeNull();
    expect(await parseShareFragment('#other=1')).toBeNull();
    expect(await parseShareFragment('#z=!!!not-base64!!!')).toBeNull();
  });
});

// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The textured boards' pictures in public/boards/ (from the Lichess repository) and their
 * previews in public/boards/thumbs/ (scripts/generate-board-thumbs.mjs, `npm run boards:thumbs`).
 */
const ROOT = process.cwd();
const BOARDS = join(ROOT, 'public', 'boards');
const THUMBS = join(BOARDS, 'thumbs');
const registry = readFileSync(join(ROOT, 'src', 'components', 'board', 'boardThemes.ts'), 'utf8');
const pictures = [...registry.matchAll(/\bimage: '([\w.-]+)'/g)].map((match) => match[1] ?? '');

/** A PNG's or JPEG's width and height, read from its header. */
function size(path: string): [number, number] {
  const data = readFileSync(path);
  if (path.endsWith('.png')) return [data.readUInt32BE(16), data.readUInt32BE(20)];
  // JPEG: walk the segments to the frame header (SOF0–SOF15, bar DHT, JPG and DAC).
  let at = 2;
  while (at + 9 < data.length) {
    const marker = data[at + 1] ?? 0;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [data.readUInt16BE(at + 7), data.readUInt16BE(at + 5)];
    }
    at += 2 + data.readUInt16BE(at + 2);
  }
  throw new Error(`${path}: no frame header`);
}

describe('board pictures', () => {
  it('are there for each textured board, with a preview each, and nothing else', () => {
    expect(pictures).toHaveLength(20);
    const files = readdirSync(BOARDS, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    expect(files.sort()).toEqual([...pictures].sort());
    const previews = pictures.map((file) => file.replace(/\.[a-z]+$/, '.jpg'));
    expect(readdirSync(THUMBS).sort()).toEqual(previews.sort());
  });

  it('are square, so each maps onto the 64 squares exactly; the previews are 128 px', () => {
    for (const file of pictures.filter((name) => !name.endsWith('.svg'))) {
      const [width, height] = size(join(BOARDS, file));
      expect(width, file).toBe(height);
      expect(width, file).toBeGreaterThanOrEqual(512);
    }
    for (const file of readdirSync(THUMBS)) {
      expect(size(join(THUMBS, file)), file).toEqual([128, 128]);
    }
  });

  it('are plain SVGs, where SVG, with nothing to fetch or run', () => {
    const svgs = pictures.filter((name) => name.endsWith('.svg'));
    expect(svgs).toEqual(['newspaper.svg']);
    for (const file of svgs) {
      const svg = readFileSync(join(BOARDS, file), 'utf8');
      expect(svg, file).toMatch(/^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg, file).not.toMatch(/<script|<foreignObject|\son[a-z]+=|javascript:|href="(?!#)/i);
    }
  });

  it('are credited with their licence', () => {
    const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    const row = notices.split('\n').find((line) => line.startsWith('| Board pictures'));
    expect(row).toContain('the lila authors and [pirouetti]');
    expect(row).toContain('`public/boards/`');
    expect(row).toContain('AGPL-3.0-or-later');
    expect(notices).toContain('## Board themes');
  });
});

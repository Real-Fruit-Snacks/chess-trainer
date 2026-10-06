import { describe, expect, it } from 'vitest';
import { BOARD_THEMES } from '@/store/settings';
import { BOARD_PALETTES, boardBackground, boardPreview, boardThumbnail } from './boardThemes';

/** The SVG inside the last layer, a `url("data:image/svg+xml;utf8,…")`. */
function flatSvg(background: string): string {
  const match = /url\("data:image\/svg\+xml;utf8,([^"]+)"\)$/.exec(background);
  if (!match?.[1]) throw new Error(`no flat board in ${background}`);
  return decodeURIComponent(match[1]);
}

describe('board themes', () => {
  it('cover every theme the settings accept, in the order the pickers show them', () => {
    expect(Object.keys(BOARD_PALETTES)).toEqual([...BOARD_THEMES]);
    // Lichess's 25 boards (20 of them pictures) and the app's own three.
    expect(BOARD_THEMES).toHaveLength(28);
    expect(Object.values(BOARD_PALETTES).filter((palette) => palette.image)).toHaveLength(20);
  });

  it('draw a flat board as a checkerboard of its two colours, a light square in the corner', () => {
    const svg = flatSvg(boardBackground('brown'));
    expect(svg).toContain("<rect width='8' height='8' fill='#f0d9b5'/>");
    expect(svg).toContain("fill='#b58863'");
    // 32 dark squares, the first of them b8 (a8 is light).
    expect(svg.match(/h1v1h-1z/g)).toHaveLength(32);
    expect(svg).toContain("d='M1 0h1v1h-1z");
    expect(boardThumbnail('brown')).toBeNull();
    expect(boardPreview('brown')).toBe(boardBackground('brown'));
  });

  it('layer a textured board over its flat colours, which show while it loads', () => {
    expect(boardBackground('wood')).toMatch(/^url\("\/boards\/wood\.jpg"\), url\("data:/);
    expect(flatSvg(boardBackground('wood'))).toContain("fill='#d7a257'");
    expect(boardThumbnail('wood')).toBe('url("/boards/thumbs/wood.jpg")');
    // The pickers use the small preview, a JPEG whatever the picture's own format.
    expect(boardPreview('newspaper')).toMatch(/^url\("\/boards\/thumbs\/newspaper\.jpg"\), url\(/);
    expect(boardPreview('pink')).toMatch(/^url\("\/boards\/thumbs\/pink\.jpg"\), url\(/);
  });

  it('give every board its own label, and distinct light and dark colours', () => {
    const labels = new Set<string>();
    for (const [theme, palette] of Object.entries(BOARD_PALETTES)) {
      expect(palette.label, theme).not.toBe('');
      labels.add(palette.label);
      expect(palette.light, theme).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette.dark, theme).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette.light, theme).not.toBe(palette.dark);
    }
    expect(labels.size).toBe(BOARD_THEMES.length);
  });
});

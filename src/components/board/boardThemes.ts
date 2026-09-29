import type { BoardTheme } from '@/store/settings';

export interface BoardPalette {
  light: string;
  dark: string;
  label: string;
}

export const BOARD_PALETTES: Record<BoardTheme, BoardPalette> = {
  brown: { light: '#f0d9b5', dark: '#b58863', label: 'Brown' },
  green: { light: '#eeeed2', dark: '#769656', label: 'Green' },
  blue: { light: '#dee3e6', dark: '#8ca2ad', label: 'Blue' },
  grey: { light: '#e9e9e9', dark: '#8b8b8b', label: 'Grey' },
};

/**
 * Builds an 8×8 checkerboard as an SVG data URI. a8 (top-left when viewed from
 * White's side) is a light square, matching a real board.
 */
export function boardBackground(theme: BoardTheme): string {
  const { light, dark } = BOARD_PALETTES[theme];
  let path = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 1) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'>` +
    `<rect width='8' height='8' fill='${light}'/><path d='${path}' fill='${dark}'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

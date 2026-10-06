import type { BoardTheme } from '@/store/settings';

export interface BoardPalette {
  /**
   * The light and dark squares: the board itself for a flat board; for a textured one the
   * texture's average, which the piece picker's strips and the drills' boards use, and which
   * stands in while the picture loads or if it cannot.
   */
  light: string;
  dark: string;
  label: string;
  /** Short explanation shown next to the swatch, if any. */
  hint?: string;
  /**
   * A textured board's picture in public/boards/, copied from the Lichess repository (AGPL-3.0,
   * see THIRD_PARTY_NOTICES.md). It is fetched when the board is first shown and kept for
   * offline use; a small preview in public/boards/thumbs/ serves the pickers.
   */
  image?: string;
}

/**
 * Every board, in the order the pickers show them: Lichess's boards (the flat ones drawn from
 * their colours, the textured ones from their pictures), then Ice, Walnut and High contrast.
 */
export const BOARD_PALETTES: Record<BoardTheme, BoardPalette> = {
  brown: { light: '#f0d9b5', dark: '#b58863', label: 'Brown' },
  wood: { light: '#d7a257', dark: '#975221', label: 'Wood', image: 'wood.jpg' },
  wood2: { light: '#9d8355', dark: '#7e6435', label: 'Wood 2', image: 'wood2.jpg' },
  wood3: { light: '#beb5ac', dark: '#8e6e47', label: 'Wood 3', image: 'wood3.jpg' },
  wood4: { light: '#c4a470', dark: '#7e5533', label: 'Wood 4', image: 'wood4.jpg' },
  maple: { light: '#dfbe92', dark: '#b97642', label: 'Maple', image: 'maple.jpg' },
  maple2: { light: '#e0c69e', dark: '#ac775c', label: 'Maple 2', image: 'maple2.jpg' },
  horsey: { light: '#f7e9d5', dark: '#8f6648', label: 'Horsey', image: 'horsey.jpg' },
  leather: { light: '#cecec6', dark: '#c08b12', label: 'Leather', image: 'leather.jpg' },
  blue: { light: '#dee3e6', dark: '#8ca2ad', label: 'Blue' },
  blue2: { light: '#88a1b6', dark: '#657e91', label: 'Blue 2', image: 'blue2.jpg' },
  blue3: { light: '#cbd4dd', dark: '#578ab6', label: 'Blue 3', image: 'blue3.jpg' },
  canvas: { light: '#ccd0e1', dark: '#71819b', label: 'Canvas', image: 'canvas.jpg' },
  'blue-marble': {
    light: '#e5e1d7',
    dark: '#959daa',
    label: 'Blue marble',
    image: 'blue-marble.jpg',
  },
  ic: { light: '#ececec', dark: '#c1c18e', label: 'IC' },
  green: { light: '#ffffdd', dark: '#86a666', label: 'Green' },
  marble: { light: '#839984', dark: '#647b64', label: 'Marble', image: 'marble.jpg' },
  'green-plastic': {
    light: '#f1f6b2',
    dark: '#59935d',
    label: 'Green plastic',
    image: 'green-plastic.png',
  },
  olive: { light: '#ada694', dark: '#837b69', label: 'Olive', image: 'olive.jpg' },
  grey: { light: '#a9a9a9', dark: '#878787', label: 'Grey', image: 'grey.jpg' },
  metal: { light: '#c7c7c7', dark: '#919191', label: 'Metal', image: 'metal.jpg' },
  newspaper: { light: '#dcdcdc', dark: '#bebebe', label: 'Newspaper', image: 'newspaper.svg' },
  purple: { light: '#9f90b0', dark: '#7d4a8d', label: 'Purple' },
  'purple-diag': {
    light: '#e3d8ee',
    dark: '#977cb3',
    label: 'Purple diagonal',
    image: 'purple-diag.png',
  },
  pink: { light: '#edeebf', dark: '#f27575', label: 'Pink', image: 'pink.png' },
  ice: { light: '#e8eef5', dark: '#7f9fbf', label: 'Ice' },
  walnut: { light: '#ecd8bf', dark: '#9c6a44', label: 'Walnut' },
  contrast: {
    light: '#f4f4f4',
    dark: '#5f6b7a',
    label: 'High contrast',
    hint: 'Strong square contrast and colour-blind-safe highlights (blue, orange and vermilion).',
  },
};

/**
 * An 8×8 checkerboard as an SVG data URI. a8 (top-left when viewed from White's side) is a
 * light square, matching a real board.
 */
function checkerboard(light: string, dark: string): string {
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

/** Where a textured board's picture, or its preview, is served from. */
function boardFile(file: string, thumb = false): string {
  const name = thumb ? `thumbs/${file.replace(/\.[a-z]+$/, '.jpg')}` : file;
  return `${import.meta.env.BASE_URL}boards/${name}`;
}

/**
 * The board's CSS background-image: the picture of a textured board over its flat colours
 * (which show while the picture loads, or if it cannot), or the flat board alone.
 */
export function boardBackground(theme: BoardTheme): string {
  const { light, dark, image } = BOARD_PALETTES[theme];
  const flat = checkerboard(light, dark);
  return image ? `url("${boardFile(image)}"), ${flat}` : flat;
}

/** A textured board's small preview, `url(…)` for CSS, or null for a flat board. */
export function boardThumbnail(theme: BoardTheme): string | null {
  const { image } = BOARD_PALETTES[theme];
  return image ? `url("${boardFile(image, true)}")` : null;
}

/** The board for a picker: the small preview over the flat colours, so showing every board
 * downloads little. */
export function boardPreview(theme: BoardTheme): string {
  const { light, dark } = BOARD_PALETTES[theme];
  const thumb = boardThumbnail(theme);
  const flat = checkerboard(light, dark);
  return thumb ? `${thumb}, ${flat}` : flat;
}

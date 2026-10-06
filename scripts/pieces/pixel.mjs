/**
 * "Pixel": 8-bit figurines on a 16×16 grid with crisp edges at any size. Each piece is drawn
 * as a filled mask ('#'); its outer pixels become the outline, so every piece gets the same
 * one-pixel line, and 'x' marks a detail pixel inside (the bishop's slit, an eye, a band).
 */

export const MASKS = {
  king: [
    '.......##.......',
    '.....######.....',
    '.......##.......',
    '....########....',
    '...##########...',
    '...#xxxxxxxx#...',
    '....########....',
    '.....######.....',
    '.....######.....',
    '....#xxxxxx#....',
    '.....######.....',
    '.....######.....',
    '....########....',
    '...##########...',
    '...##########...',
    '................',
  ],
  queen: [
    '................',
    '.#...#.##.#...#.',
    '.##..#.##.#..##.',
    '..##.######.##..',
    '..############..',
    '...##########...',
    '....#xxxxxx#....',
    '.....######.....',
    '......####......',
    '.....#xxxx#.....',
    '......####......',
    '.....######.....',
    '....########....',
    '...##########...',
    '...##########...',
    '................',
  ],
  rook: [
    '................',
    '................',
    '................',
    '................',
    '..####.##.####..',
    '..####.##.####..',
    '..############..',
    '...#xxxxxxxx#...',
    '....########....',
    '....########....',
    '....########....',
    '...##########...',
    '..############..',
    '..############..',
    '..############..',
    '................',
  ],
  bishop: [
    '................',
    '................',
    '.......##.......',
    '......####......',
    '.......##.......',
    '......####......',
    '.....######.....',
    '.....###x##.....',
    '.....##x###.....',
    '......####......',
    '.....#xxxx#.....',
    '......####......',
    '.....######.....',
    '....########....',
    '....########....',
    '................',
  ],
  knight: [
    '................',
    '................',
    '................',
    '.....##.........',
    '.....#####......',
    '....#######.....',
    '...##########...',
    '..####x#######..',
    '.#############..',
    '.#####..#######.',
    '..##...########.',
    '......#########.',
    '....##########..',
    '..############..',
    '..############..',
    '................',
  ],
  pawn: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......####......',
    '.....######.....',
    '....########....',
    '....########....',
    '.....######.....',
    '.....#xxxx#.....',
    '......####......',
    '.....######.....',
    '....########....',
    '....########....',
    '................',
  ],
};

export const inks = {
  white: { fill: '#f7f6f2', outline: '#1a1a1a', detail: '#1a1a1a' },
  black: { fill: '#3a3a3a', outline: '#0f0f0f', detail: '#e6e6e6' },
};

/** Horizontal runs of cells that pass `test`, as one SVG path. */
function runs(rows, test) {
  let d = '';
  for (let y = 0; y < rows.length; y++) {
    let x = 0;
    while (x < rows[y].length) {
      if (!test(x, y)) {
        x++;
        continue;
      }
      let end = x;
      while (end < rows[y].length && test(end, y)) end++;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  }
  return d;
}

export function draw(role, color) {
  const rows = MASKS[role];
  const ink = inks[color];
  const solid = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < 16 && rows[y][x] !== '.';
  // A cell of the piece that touches the outside (sideways, up or down) is outline.
  const edge = (x, y) =>
    solid(x, y) && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1));
  const detail = (x, y) => rows[y][x] === 'x' && !edge(x, y);
  const fill = (x, y) => solid(x, y) && !edge(x, y) && !detail(x, y);
  const d = runs(rows, detail);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
    `<path fill="${ink.fill}" d="${runs(rows, fill)}"/>` +
    `<path fill="${ink.outline}" d="${runs(rows, edge)}"/>` +
    (d ? `<path fill="${ink.detail}" d="${d}"/>` : '') +
    `</svg>`
  );
}

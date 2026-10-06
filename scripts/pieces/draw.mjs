/**
 * Drawing helpers shared by the piece sets. Every set is drawn on a 100×100 box with the
 * pieces standing on a common baseline; symmetric pieces are drawn as half a profile and
 * mirrored, so the two sides always match.
 */

/** A number for path data: at most two decimals, no trailing zeros. */
export function n(v) {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

const mirror = (x) => 100 - x;

function segment(s) {
  const [cmd, ...pts] = s;
  return cmd + pts.map(n).join(' ');
}

/**
 * A symmetric outline from its right half. The half starts on the axis at y = `bottom`, runs up
 * the right side and ends on the axis at the top; segments are ['L', x, y],
 * ['Q', cx, cy, x, y] or ['C', c1x, c1y, c2x, c2y, x, y] in absolute coordinates.
 */
export function lathe(bottom, segs) {
  let d = `M50 ${n(bottom)}`;
  const starts = [];
  let current = [50, bottom];
  for (const s of segs) {
    starts.push(current);
    d += segment(s);
    current = s.slice(-2);
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const [sx, sy] = starts[i];
    if (s[0] === 'L') d += segment(['L', mirror(sx), sy]);
    else if (s[0] === 'Q') d += segment(['Q', mirror(s[1]), s[2], mirror(sx), sy]);
    else d += segment(['C', mirror(s[3]), s[4], mirror(s[1]), s[2], mirror(sx), sy]);
  }
  return `${d}Z`;
}

/** A path through the given segments: the first is the start point. */
export function path(start, segs, close = true) {
  return `M${n(start[0])} ${n(start[1])}${segs.map(segment).join('')}${close ? 'Z' : ''}`;
}

export function poly(points, close = true) {
  return `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}${close ? 'Z' : ''}`;
}

export function rrect(x1, y1, x2, y2, r) {
  const w = x2 - x1 - 2 * r;
  const h = y2 - y1 - 2 * r;
  return (
    `M${n(x1 + r)} ${n(y1)}h${n(w)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(h)}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(-w)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}` +
    `v${n(-h)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}z`
  );
}

/** A rectangle with fully rounded ends. */
export const pill = (x1, y1, x2, y2) => rrect(x1, y1, x2, y2, Math.min(x2 - x1, y2 - y1) / 2);

export function circle(cx, cy, r) {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0z`;
}

export function line(...points) {
  return poly(points, false);
}

/**
 * Turns a piece's layers into an SVG for one colour.
 *
 * Layers are drawn in order:
 *   { kind: 'part', d }   filled with the body colour and outlined
 *   { kind: 'line', d }   a detail stroke: dark on white pieces, light on black ones
 *   { kind: 'dot', d }    a filled detail (an eye) in the detail colour
 *   { kind: 'cut', d }    filled with the outline colour (a slit, a notch)
 * Any layer may carry `only: 'white' | 'black'`. With `ink.halo`, every part is first drawn
 * as a wider stroke in the halo colour, a rim that lifts the piece off a square of its colour.
 */
export function svg(layers, ink, style) {
  const visible = layers.filter((l) => !l.only || l.only === ink.name);
  const out = [];
  if (ink.halo) {
    const parts = visible.filter((l) => l.kind === 'part').map((l) => l.d);
    out.push(
      `<path fill="${ink.halo}" stroke="${ink.halo}" stroke-width="${n(style.stroke + 2 * style.halo)}" stroke-linejoin="round" d="${parts.join('')}"/>`,
    );
  }
  let i = 0;
  while (i < visible.length) {
    const kind = visible[i].kind;
    const width = visible[i].width;
    let d = '';
    while (i < visible.length && visible[i].kind === kind && visible[i].width === width) {
      // Parts are kept as separate paths: one outline must not cancel another's fill.
      if (kind === 'part' && d) break;
      d += visible[i].d;
      i++;
    }
    if (kind === 'part') {
      out.push(
        `<path fill="${ink.body}" stroke="${ink.outline}" stroke-width="${n(style.stroke)}" stroke-linejoin="round" d="${d}"/>`,
      );
    } else if (kind === 'line') {
      out.push(
        `<path fill="none" stroke="${ink.detail}" stroke-width="${n(width ?? style.detail)}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`,
      );
    } else if (kind === 'dot') {
      out.push(`<path fill="${ink.detail}" d="${d}"/>`);
    } else if (kind === 'cut') {
      out.push(`<path fill="${ink.outline}" d="${d}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${out.join('')}</svg>`;
}

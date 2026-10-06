/**
 * "Modern": plain geometry — a straight tapered body under each piece's own head, drawn from
 * circles, arcs and straight lines with one line weight: the king's block and cross, the
 * queen's three-pointed crown, the bishop's mitre, the knight's square-cut head, the rook's
 * battlements and the pawn's ball.
 */
import { circle, lathe, line, n, pill, poly, svg } from './draw.mjs';

export const style = { stroke: 3.8, detail: 2.8 };

export const inks = {
  white: { name: 'white', body: '#ffffff', outline: '#1e2326', detail: '#1e2326' },
  black: { name: 'black', body: '#2a2f33', outline: '#000000', detail: '#e6eaec' },
};

const BOTTOM = 89;

/** A straight tapered body: `bw` half its width at the bottom, `tw` at `top`. */
function body(bw, tw, top) {
  return {
    kind: 'part',
    d: lathe(BOTTOM, [
      ['L', 50 + bw - 3, BOTTOM],
      ['Q', 50 + bw, BOTTOM, 50 + bw - 0.6, BOTTOM - 3],
      ['L', 50 + tw, top],
      ['L', 50, top],
    ]),
  };
}

/** The band between body and head. */
function band(hw, top, h = 5.5) {
  return [
    { kind: 'part', d: pill(50 - hw, top, 50 + hw, top + h) },
    {
      kind: 'line',
      only: 'black',
      d: line([50 - hw + 3, top + h / 2], [50 + hw - 3, top + h / 2]),
    },
  ];
}

export const pieces = {
  pawn: [body(19.5, 8, 60), { kind: 'part', d: circle(50, 44.5, 15.5) }, ...band(14, 57.5)],
  rook: [
    body(23.5, 17, 45),
    {
      kind: 'part',
      d: poly([
        [28.5, 43],
        [28.5, 24],
        [38.5, 24],
        [38.5, 31],
        [45, 31],
        [45, 24],
        [55, 24],
        [55, 31],
        [61.5, 31],
        [61.5, 24],
        [71.5, 24],
        [71.5, 43],
      ]),
    },
    { kind: 'line', only: 'black', d: line([32, 37], [68, 37]) },
    ...band(19.5, 41.5),
  ],
  bishop: [
    body(22.5, 7.5, 57),
    {
      kind: 'part',
      d: lathe(55, [
        ['L', 57.5, 55],
        ['C', 64.5, 48, 63.5, 33, 50, 22],
      ]),
    },
    { kind: 'part', d: circle(50, 18, 4.2) },
    { kind: 'line', d: line([58, 31.5], [50, 39.5]) },
    ...band(13, 53),
  ],
  knight: [
    {
      kind: 'part',
      d:
        `M33 ${n(BOTTOM)}Q30 ${n(BOTTOM)} 30.6 ${n(BOTTOM - 3)}L36.5 63Q37.6 57.5 32 57.5L24 57.5` +
        `Q16 57.5 16 49.5L16 45.5Q16 39.5 21.5 37L39 27.5L42.5 17L50 26` +
        `Q72 25.5 72 48L72 ${n(BOTTOM - 3)}Q72 ${n(BOTTOM)} 69 ${n(BOTTOM)}Z`,
    },
    { kind: 'dot', d: circle(33, 42, 2.8) },
    { kind: 'line', d: line([16.5, 50], [23, 50]) },
    { kind: 'line', only: 'black', d: 'M53 31Q65.5 33 66.5 46' },
  ],
  queen: [
    body(20, 9.5, 48.5),
    {
      kind: 'part',
      d: poly([
        [39, 45],
        [25.5, 25],
        [38.5, 32.5],
        [50, 19],
        [61.5, 32.5],
        [74.5, 25],
        [61, 45],
      ]),
    },
    { kind: 'part', d: circle(25.5, 21.5, 4.3) },
    { kind: 'part', d: circle(50, 15, 4.3) },
    { kind: 'part', d: circle(74.5, 21.5, 4.3) },
    ...band(15, 43),
  ],
  king: [
    body(24, 11, 49),
    {
      kind: 'part',
      d: poly([
        [46, 30],
        [46, 21.5],
        [39, 21.5],
        [39, 14],
        [46, 14],
        [46, 7],
        [54, 7],
        [54, 14],
        [61, 14],
        [61, 21.5],
        [54, 21.5],
        [54, 30],
      ]),
    },
    {
      kind: 'part',
      d: 'M38 46L32.5 31Q31.5 27.5 35 27.5L65 27.5Q68.5 27.5 67.5 31L62 46Z',
    },
    ...band(16.5, 44),
  ],
};

export const draw = (role, color) => svg(pieces[role], inks[color], style);

/**
 * "Bold": big, simple shapes with a heavy outline and one telling feature each — the cross,
 * the crown of balls, the slit mitre, the horse's head, the battlements, the round head —
 * for small boards and for anyone who wants the pieces to read at a glance. Black pieces
 * carry a light rim so they stand off dark squares.
 */
import { circle, lathe, line, path, pill, poly, rrect, svg } from './draw.mjs';

export const style = { stroke: 5.5, detail: 4.5, halo: 2.4 };

export const inks = {
  white: { name: 'white', body: '#ffffff', outline: '#171717', detail: '#171717' },
  black: {
    name: 'black',
    body: '#2a2a2a',
    outline: '#171717',
    detail: '#f2f2f2',
    halo: '#f2f2f2',
  },
};

const FOOT_TOP = 79;
const FOOT_BOTTOM = 88.5;

function foot(hw) {
  return [
    { kind: 'part', d: rrect(50 - hw, FOOT_TOP, 50 + hw, FOOT_BOTTOM, 4) },
    {
      kind: 'line',
      only: 'black',
      d: line([50 - hw + 6, FOOT_TOP + 4.7], [50 + hw - 6, FOOT_TOP + 4.7]),
    },
  ];
}

/** A tapering body from the foot up to `top`. */
function body(bw, tw, top) {
  return {
    kind: 'part',
    d: lathe(FOOT_TOP + 2, [
      ['L', 50 + bw, FOOT_TOP + 2],
      ['C', 50 + bw - 2, FOOT_TOP - 8, 50 + tw, top + 8, 50 + tw, top],
      ['L', 50, top],
    ]),
  };
}

export const pieces = {
  pawn: [
    {
      kind: 'part',
      d: lathe(FOOT_BOTTOM, [
        ['L', 70, FOOT_BOTTOM],
        ['Q', 73.5, FOOT_BOTTOM, 72.5, 84.5],
        ['C', 70, 73, 62, 65.5, 57.5, 60],
        ['L', 50, 60],
      ]),
    },
    { kind: 'part', d: circle(50, 44, 14.5) },
    { kind: 'part', d: pill(36.5, 56, 63.5, 63.5) },
    { kind: 'line', only: 'black', d: line([40.5, 59.75], [59.5, 59.75]) },
  ],
  rook: [
    body(19, 17, 44),
    {
      kind: 'part',
      d: poly([
        [30, 47],
        [27, 37],
        [27, 23],
        [38.5, 23],
        [38.5, 31],
        [45, 31],
        [45, 23],
        [55, 23],
        [55, 31],
        [61.5, 31],
        [61.5, 23],
        [73, 23],
        [73, 37],
        [70, 47],
      ]),
    },
    { kind: 'line', only: 'black', d: line([32.5, 38.5], [67.5, 38.5]) },
    ...foot(28),
  ],
  bishop: [
    body(14, 7, 62),
    {
      kind: 'part',
      d: lathe(60, [
        ['L', 56, 60],
        ['C', 64.5, 52, 63.5, 33.5, 50, 21],
      ]),
    },
    { kind: 'part', d: circle(50, 16.5, 5) },
    { kind: 'line', d: line([58, 32.5], [50, 40.5]) },
    { kind: 'part', d: pill(36, 58, 64, 65.5) },
    { kind: 'line', only: 'black', d: line([40, 61.75], [60, 61.75]) },
    ...foot(25),
  ],
  knight: [
    {
      kind: 'part',
      d: path(
        [31, 81],
        [
          ['C', 30, 70, 36, 62, 45, 56],
          ['C', 40, 60, 32, 61, 26, 59],
          ['C', 23, 58, 21, 56.5, 20, 54.5],
          ['L', 15.5, 55],
          ['C', 11.5, 53, 11, 48, 13.5, 44.5],
          ['C', 20, 36, 29, 30, 35, 26],
          ['C', 36, 22.5, 38, 18.5, 42, 15.5],
          ['C', 45.5, 18.5, 48, 21.5, 49.5, 24.5],
          ['C', 63, 25, 75, 37, 76, 54],
          ['C', 77, 64, 75.5, 73, 72, 81],
        ],
      ),
    },
    { kind: 'dot', d: circle(31.5, 37, 3.2) },
    { kind: 'line', only: 'black', d: 'M53.5 30.5C63 33 69.5 42 70.5 55' },
    ...foot(28),
  ],
  queen: [
    body(18, 10, 48),
    {
      kind: 'part',
      d: path(
        [37, 50],
        [
          ['C', 33, 43, 25, 36, 20, 24.5],
          ['L', 31, 32.5],
          ['L', 35, 19],
          ['L', 43.5, 32],
          ['L', 50, 16],
          ['L', 56.5, 32],
          ['L', 65, 19],
          ['L', 69, 32.5],
          ['L', 80, 24.5],
          ['C', 75, 36, 67, 43, 63, 50],
        ],
      ),
    },
    { kind: 'part', d: circle(19.5, 21, 3.9) },
    { kind: 'part', d: circle(35, 15.5, 3.9) },
    { kind: 'part', d: circle(50, 12.5, 3.9) },
    { kind: 'part', d: circle(65, 15.5, 3.9) },
    { kind: 'part', d: circle(80.5, 21, 3.9) },
    { kind: 'part', d: pill(34, 48, 66, 55.5) },
    { kind: 'line', only: 'black', d: line([38, 51.75], [62, 51.75]) },
    ...foot(30),
  ],
  king: [
    body(19, 11, 47),
    {
      kind: 'part',
      d: poly([
        [45.5, 24],
        [45.5, 19.5],
        [39, 19.5],
        [39, 11.5],
        [45.5, 11.5],
        [45.5, 5.5],
        [54.5, 5.5],
        [54.5, 11.5],
        [61, 11.5],
        [61, 19.5],
        [54.5, 19.5],
        [54.5, 24],
      ]),
    },
    {
      kind: 'part',
      d: lathe(50, [
        ['L', 61.5, 50],
        ['C', 66.5, 43, 69, 35.5, 69, 29.5],
        ['C', 66, 24, 58.5, 22.5, 50, 22.5],
      ]),
    },
    { kind: 'part', d: pill(33, 46, 67, 53.5) },
    { kind: 'line', only: 'black', d: line([37, 49.75], [63, 49.75]) },
    ...foot(31),
  ],
};

export const draw = (role, color) => svg(pieces[role], inks[color], style);

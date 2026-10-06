/**
 * "Staunton": tournament shapes — a turned base and stem under each piece's own head — drawn
 * with a heavier line than most figurine sets so the pieces stay crisp on a phone.
 */
import { circle, lathe, line, path, pill, poly, rrect, svg } from './draw.mjs';

export const style = { stroke: 3.6, detail: 2.6 };

export const inks = {
  white: { name: 'white', body: '#fbfaf6', outline: '#1d1c1a', detail: '#1d1c1a' },
  black: { name: 'black', body: '#252422', outline: '#000000', detail: '#ebe7de' },
};

const FOOT_TOP = 82.5;
const FOOT_BOTTOM = 89;
const RING_TOP = 77.5;

/** The foot and the ring above it, `hw` half the foot's width. */
function base(hw) {
  return [
    { kind: 'part', d: pill(50 - hw + 3.5, RING_TOP, 50 + hw - 3.5, FOOT_TOP + 0.5) },
    { kind: 'part', d: rrect(50 - hw, FOOT_TOP, 50 + hw, FOOT_BOTTOM, 2.6) },
    { kind: 'line', only: 'black', d: line([50 - hw + 4, FOOT_TOP], [50 + hw - 4, FOOT_TOP]) },
  ];
}

/** A stem from the ring up to a collar: `bw` half its width at the bottom, `tw` at the top. */
function stem(bw, tw, top) {
  return {
    kind: 'part',
    d: lathe(RING_TOP + 1, [
      ['L', 50 + bw, RING_TOP + 1],
      ['C', 50 + bw - 3, RING_TOP - 7, 50 + tw, top + 9, 50 + tw, top],
      ['L', 50, top],
    ]),
  };
}

function collar(hw, top, h = 5.5) {
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
  pawn: [
    stem(17.5, 7.5, 58),
    { kind: 'part', d: circle(50, 43, 13.5) },
    ...collar(13, 55),
    ...base(21.5),
  ],
  rook: [
    stem(20.5, 17, 46),
    {
      kind: 'part',
      d: poly([
        [31.5, 43],
        [27, 33],
        [27, 23.5],
        [38.5, 23.5],
        [38.5, 30.5],
        [44.75, 30.5],
        [44.75, 23.5],
        [55.25, 23.5],
        [55.25, 30.5],
        [61.5, 30.5],
        [61.5, 23.5],
        [73, 23.5],
        [73, 33],
        [68.5, 43],
      ]),
    },
    { kind: 'line', only: 'black', d: line([31, 34.5], [69, 34.5]) },
    ...collar(19, 42),
    ...base(29.5),
  ],
  bishop: [
    stem(14.5, 8, 52),
    {
      kind: 'part',
      d: lathe(49, [
        ['L', 58, 49],
        ['C', 71, 42.5, 69.5, 30, 50, 21.5],
      ]),
    },
    { kind: 'part', d: circle(50, 18.5, 4) },
    { kind: 'line', d: line([60, 29.5], [49.5, 40]) },
    ...collar(14, 48),
    ...base(27.5),
  ],
  knight: [
    {
      kind: 'part',
      d: path(
        [32, 78],
        [
          ['C', 31, 68, 37, 61, 44, 55],
          ['C', 40, 59, 33, 60, 27, 58.5],
          ['C', 24.5, 58, 22, 56.5, 21, 54],
          ['L', 16.5, 54.5],
          ['C', 13, 53, 12.5, 49, 15, 46],
          ['C', 21, 38, 30, 31.5, 36, 27.5],
          ['C', 37, 23.5, 39, 20.5, 42, 17.5],
          ['C', 45, 20.5, 47.5, 23, 48.5, 25.5],
          ['C', 61, 25, 73, 36, 74.5, 52],
          ['C', 75.5, 62, 74.5, 70, 71, 78],
        ],
      ),
    },
    { kind: 'dot', d: circle(33, 37, 2.4) },
    { kind: 'dot', d: circle(18.5, 48.5, 1.5) },
    { kind: 'line', d: 'M43.5 54C41 48 35 46.5 30 48.5' },
    { kind: 'line', d: 'M52 30C62 32 68.5 41 69.5 55' },
    ...base(29),
  ],
  queen: [
    stem(22, 11.5, 50),
    {
      kind: 'part',
      d: path(
        [38, 46],
        [
          ['C', 34, 41, 27, 35, 21.5, 24.5],
          ['L', 31.5, 31.5],
          ['L', 35, 19],
          ['L', 43, 30.5],
          ['L', 50, 16],
          ['L', 57, 30.5],
          ['L', 65, 19],
          ['L', 68.5, 31.5],
          ['L', 78.5, 24.5],
          ['C', 73, 36, 66, 41, 62, 46],
        ],
      ),
    },
    { kind: 'part', d: circle(21, 22, 3.4) },
    { kind: 'part', d: circle(35, 16, 3.4) },
    { kind: 'part', d: circle(50, 13, 3.4) },
    { kind: 'part', d: circle(65, 16, 3.4) },
    { kind: 'part', d: circle(79, 22, 3.4) },
    ...collar(14.5, 45),
    ...base(32),
  ],
  king: [
    stem(22.5, 12, 49),
    {
      kind: 'part',
      d: poly([
        [46.5, 23],
        [46.5, 18.5],
        [40.5, 18.5],
        [40.5, 12],
        [46.5, 12],
        [46.5, 7],
        [53.5, 7],
        [53.5, 12],
        [59.5, 12],
        [59.5, 18.5],
        [53.5, 18.5],
        [53.5, 23],
      ]),
    },
    {
      kind: 'part',
      d: lathe(45, [
        ['L', 61, 45],
        ['C', 64.5, 40, 66.5, 34, 66.5, 29],
        ['C', 64, 24, 57.5, 22.5, 50, 22.5],
      ]),
    },
    { kind: 'line', d: 'M35.5 33Q50 36.5 64.5 33' },
    ...collar(15, 44),
    ...base(34),
  ],
};

export const draw = (role, color) => svg(pieces[role], inks[color], style);

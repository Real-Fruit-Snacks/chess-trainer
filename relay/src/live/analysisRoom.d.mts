/** Types for analysisRoom.mjs, for the relay's tests. */
import type { GroupKindModule } from './group.mjs';

/** An arrow from `orig` to `dest`, or a circle on `orig`. */
export interface AnalysisShape {
  orig: string;
  dest?: string;
  brush: string;
}

export interface AnalysisNode {
  id: number;
  /** -1 for the root (node 0). */
  parent: number;
  /** The move from the parent, in UCI ('' for the root). */
  uci: string;
  /** The moves played from here, the main line first. */
  children: number[];
  shapes?: AnalysisShape[];
}

export interface AnalysisState {
  variant: 'standard' | 'chess960';
  fen: string;
  white: string | null;
  black: string | null;
  result: string;
  nodes: AnalysisNode[];
  next: number;
  /** The shared position. */
  at: number;
}

export const analysisRoom: GroupKindModule<AnalysisState>;

export interface NodeEngineScore {
  type: 'cp' | 'mate';
  value: number;
}

export interface NodeEngineLine {
  depth: number;
  score: NodeEngineScore;
  pv: string[];
}

export interface NodeEngineResult {
  bestmove: string;
  lines: Map<number, NodeEngineLine>;
}

export function engineInstalled(): boolean;

export class NodeEngine {
  constructor();
  send(command: string): void;
  collect(until: (line: string) => boolean): Promise<string[]>;
  init(options?: { hashMb?: number }): Promise<void>;
  analyse(fen: string, options?: { depth?: number; multipv?: number }): Promise<NodeEngineResult>;
  quit(): void;
}

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

export function engineInstalled(engineDir?: string): boolean;

/** Copies the engine into this process's private temp directory; returns the runnable script. */
export function prepareRunnable(engineDir?: string): string;

export class NodeEngine {
  constructor(options?: { script?: string });
  /** Set once the engine process is gone; every later request rejects with it. */
  exitError: Error | null;
  send(command: string): void;
  collect(until: (line: string) => boolean): Promise<string[]>;
  init(options?: { hashMb?: number }): Promise<void>;
  analyse(
    fen: string,
    options?: { depth?: number; multipv?: number; maxMs?: number; searchmoves?: string[] },
  ): Promise<NodeEngineResult>;
  quit(): void;
}

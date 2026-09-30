import { chooseEngineBuild, describeEngine, type ThreadEnvironment } from '@/engine/build';
import type { EngineClient } from '@/engine/EngineClient';
import { START_FEN } from '@/chess/helpers';

export interface DiagnosticRow {
  label: string;
  value: string;
  /** 'good' | 'warn' | 'neutral' controls the badge tone. */
  tone: 'good' | 'warn' | 'neutral';
}

export interface DiagnosticsInput {
  env: ThreadEnvironment;
  wantThreads: boolean;
  workers: boolean;
  wasm: boolean;
  serviceWorkerControlled: boolean;
  isolationFlag: boolean | null;
}

/** The environment rows of the diagnostics panel. Pure, so it can be unit-tested. */
export function diagnosticRows(input: DiagnosticsInput): DiagnosticRow[] {
  const choice = chooseEngineBuild(input.wantThreads, input.env);
  const rows: DiagnosticRow[] = [
    {
      label: 'Engine build in use',
      value: describeEngine(choice.build, choice.threads),
      tone: choice.build === 'multi' ? 'good' : 'neutral',
    },
    {
      label: 'WebAssembly',
      value: input.wasm ? 'Available' : 'Missing — the engine cannot run',
      tone: input.wasm ? 'good' : 'warn',
    },
    {
      label: 'Web Workers',
      value: input.workers ? 'Available' : 'Missing — the engine cannot run',
      tone: input.workers ? 'good' : 'warn',
    },
    {
      label: 'CPU cores reported',
      value: input.env.cores ? String(input.env.cores) : 'Hidden by the browser',
      tone: 'neutral',
    },
    {
      label: 'Cross-origin isolated',
      value: input.env.isolated ? 'Yes' : 'No',
      tone: input.env.isolated ? 'good' : input.wantThreads ? 'warn' : 'neutral',
    },
    {
      label: 'Shared memory (SharedArrayBuffer)',
      value: input.env.sharedMemory ? 'Yes' : 'No',
      tone: input.env.sharedMemory ? 'good' : input.wantThreads ? 'warn' : 'neutral',
    },
    {
      label: 'Offline service worker',
      value: input.serviceWorkerControlled ? 'Controlling this page' : 'Not controlling this page',
      tone: input.serviceWorkerControlled ? 'good' : 'neutral',
    },
    {
      label: 'Isolation flag saved',
      value: input.isolationFlag === null ? 'Unknown' : input.isolationFlag ? 'On' : 'Off',
      tone: 'neutral',
    },
  ];
  if (input.wantThreads && choice.reason) {
    const why: Record<NonNullable<typeof choice.reason>, string> = {
      off: 'Threads are switched off.',
      'not-isolated':
        'The page is not cross-origin isolated yet — reload after switching threads on.',
      'no-shared-memory': 'This browser does not expose shared memory.',
      'one-core': 'Only one core is available, so threads would not help.',
    };
    rows.push({ label: 'Why single-threaded', value: why[choice.reason], tone: 'warn' });
  }
  return rows;
}

export interface Benchmark {
  name: string;
  depth: number;
  nodes: number | null;
  nps: number | null;
  ms: number;
  fellBack: boolean;
}

const BENCH_DEPTH = 14;

/** Runs a fixed-depth search from the initial position and reports the speed. */
export async function benchmarkEngine(engine: EngineClient): Promise<Benchmark> {
  await engine.init();
  const startedAt = performance.now();
  const { lines } = await engine.search({ fen: START_FEN, depth: BENCH_DEPTH }).result;
  const ms = Math.round(performance.now() - startedAt);
  const info = lines.get(1);
  return {
    name: engine.name,
    depth: info?.depth ?? 0,
    nodes: info?.nodes ?? null,
    nps: info?.nps ?? null,
    ms,
    fellBack: engine.fellBack,
  };
}

export function describeBenchmark(b: Benchmark): string {
  const speed = b.nps ? `${Math.round(b.nps / 1000).toLocaleString()} k nodes/s` : 'speed unknown';
  const nodes = b.nodes ? `${b.nodes.toLocaleString()} nodes` : '';
  return `${b.name}: depth ${b.depth} in ${(b.ms / 1000).toFixed(1)} s (${[speed, nodes].filter(Boolean).join(', ')})${
    b.fellBack ? ' — fell back to the single-threaded build' : ''
  }.`;
}

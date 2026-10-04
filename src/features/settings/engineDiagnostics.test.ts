import { describe, expect, it } from 'vitest';
import { describeBenchmark, diagnosticRows } from './engineDiagnostics';

const base = {
  env: { isolated: false, sharedMemory: false, cores: 8 },
  wantThreads: false,
  workers: true,
  wasm: true,
  serviceWorkerControlled: true,
  isolationFlag: false,
};

describe('engine diagnostics', () => {
  it('describes a healthy single-threaded environment', () => {
    const rows = diagnosticRows(base);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel['Build selected']?.value).toBe('Stockfish 19 lite');
    expect(byLabel.WebAssembly?.tone).toBe('good');
    expect(byLabel['Cross-origin isolated']?.tone).toBe('neutral');
    expect(rows.some((r) => r.label === 'Why single-threaded')).toBe(false);
  });

  it('explains why threads are not active', () => {
    const rows = diagnosticRows({ ...base, wantThreads: true, isolationFlag: true });
    const why = rows.find((r) => r.label === 'Why single-threaded');
    expect(why?.value).toMatch(/not cross-origin isolated/);
    expect(rows.find((r) => r.label === 'Cross-origin isolated')?.tone).toBe('warn');
    const active = diagnosticRows({
      ...base,
      wantThreads: true,
      env: { isolated: true, sharedMemory: true, cores: 8 },
    });
    expect(active.find((r) => r.label === 'Build selected')?.value).toBe(
      'Stockfish 19 · 7 threads',
    );
  });

  it('flags missing WebAssembly', () => {
    const rows = diagnosticRows({ ...base, wasm: false });
    expect(rows.find((r) => r.label === 'WebAssembly')?.tone).toBe('warn');
  });

  it('formats a benchmark', () => {
    expect(
      describeBenchmark({
        name: 'Stockfish 19 lite',
        depth: 14,
        nodes: 250_000,
        nps: 400_000,
        ms: 625,
        fellBack: false,
      }),
    ).toBe('Stockfish 19 lite: depth 14 in 0.6 s (400 k nodes/s, 250,000 nodes).');
    expect(
      describeBenchmark({ name: 'x', depth: 10, nodes: null, nps: null, ms: 2000, fellBack: true }),
    ).toContain('fell back');
  });
});

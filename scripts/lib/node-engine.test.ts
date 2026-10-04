// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NodeEngine, prepareRunnable } from './node-engine.mjs';

const work = mkdtempSync(join(tmpdir(), 'node-engine-test-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let fakes = 0;
/**
 * A stand-in engine that speaks just enough UCI: it answers the handshake and
 * runs `onGo` (a snippet of JavaScript with the `go` command in `line`).
 */
function fakeEngine(onGo: string): string {
  const file = join(work, `fake-${(fakes += 1)}.cjs`);
  writeFileSync(
    file,
    `const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (line === 'uci') console.log('id name Fake\\nuciok');
  else if (line === 'isready') console.log('readyok');
  else if (line === 'quit') process.exit(0);
  else if (line.startsWith('go')) { ${onGo} }
});
`,
  );
  return file;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('NodeEngine', () => {
  it('rejects a pending search when the engine process dies, and every request after it', async () => {
    const engine = new NodeEngine({ script: fakeEngine('process.exit(3);') });
    await engine.init();
    await expect(engine.analyse(START, { depth: 2 })).rejects.toThrow(/exited \(code 3\)/);
    await expect(engine.analyse(START, { depth: 2 })).rejects.toThrow(/exited \(code 3\)/);
    expect(engine.exitError).toBeInstanceOf(Error);
  });

  it('still delivers what the engine said before it exited', async () => {
    const engine = new NodeEngine({
      script: fakeEngine(
        "console.log('info depth 1 score cp 25 pv e2e4'); console.log('bestmove e2e4'); process.exit(0);",
      ),
    });
    await engine.init();
    const result = await engine.analyse(START, { depth: 1 });
    expect(result.bestmove).toBe('e2e4');
    expect(result.lines.get(1)?.score).toEqual({ type: 'cp', value: 25 });
    await expect(engine.collect(() => true)).rejects.toThrow(/exited/);
  });

  it('puts searchmoves last in the go command, where Stockfish expects it', async () => {
    // The fake answers with the last token of the go command as its move.
    const engine = new NodeEngine({
      script: fakeEngine(
        "const last = line.split(' ').at(-1); console.log('info depth 1 score cp 0 pv ' + last); console.log('bestmove ' + last);",
      ),
    });
    await engine.init();
    const result = await engine.analyse(START, { depth: 3, searchmoves: ['g1f3'] });
    expect(result.bestmove).toBe('g1f3');
    engine.quit();
  });
});

describe('prepareRunnable', () => {
  it('copies the engine into a private temp directory of this process, once', () => {
    const source = join(work, 'engine');
    mkdirSync(source);
    writeFileSync(join(source, 'stockfish-19-lite-single.js'), '// glue');
    writeFileSync(join(source, 'stockfish-19-lite-single.wasm'), 'wasm');
    const script = prepareRunnable(source);
    expect(basename(script)).toBe('stockfish-19-lite-single.cjs');
    // Not the old shared directory every run wrote into.
    expect(dirname(script)).not.toBe(join(tmpdir(), 'chess-trainer-engine'));
    expect(basename(dirname(script))).toMatch(/^chess-trainer-engine-.+/);
    expect(existsSync(join(dirname(script), 'stockfish-19-lite-single.wasm'))).toBe(true);
    expect(prepareRunnable(source)).toBe(script);
    // A test worker may be stopped without its exit hooks running: clean up here.
    rmSync(dirname(script), { recursive: true, force: true });
  });
});

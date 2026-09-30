/**
 * Runs the bundled Stockfish WASM build as a child process for Node-side tooling
 * (puzzle verification, content checks).
 *
 * The engine's JS glue is CommonJS but this repository is `"type": "module"`,
 * so Node would refuse to run the `.js` file directly. We copy it (and the
 * WASM next to it) into a temp directory with a `.cjs` extension, where the
 * glue's CLI mode works unchanged.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENGINE_DIR = join(ROOT, 'public', 'engine');
const NAME = 'stockfish-19-lite-single';

export function engineInstalled() {
  return existsSync(join(ENGINE_DIR, `${NAME}.js`)) && existsSync(join(ENGINE_DIR, `${NAME}.wasm`));
}

function prepareRunnable() {
  const dir = join(tmpdir(), 'chess-trainer-engine');
  mkdirSync(dir, { recursive: true });
  const js = join(dir, `${NAME}.cjs`);
  const wasm = join(dir, `${NAME}.wasm`);
  copyFileSync(join(ENGINE_DIR, `${NAME}.js`), js);
  copyFileSync(join(ENGINE_DIR, `${NAME}.wasm`), wasm);
  return js;
}

export class NodeEngine {
  constructor() {
    if (!engineInstalled()) {
      throw new Error('Engine not installed — run `npm run engine:setup` first.');
    }
    this.proc = spawn(process.execPath, [prepareRunnable()], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.buffer = '';
    this.waiters = [];
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let idx;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        for (const waiter of [...this.waiters]) waiter(line);
      }
    });
  }

  send(command) {
    this.proc.stdin.write(command + '\n');
  }

  /** Resolves with every line received up to and including the first that satisfies `until`. */
  collect(until) {
    return new Promise((resolve) => {
      const lines = [];
      const waiter = (line) => {
        lines.push(line);
        if (until(line)) {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          resolve(lines);
        }
      };
      this.waiters.push(waiter);
    });
  }

  async init({ hashMb = 32 } = {}) {
    this.send('uci');
    await this.collect((l) => l === 'uciok');
    this.send(`setoption name Hash value ${hashMb}`);
    this.send('isready');
    await this.collect((l) => l === 'readyok');
  }

  /**
   * Analyses a position to a fixed depth. `maxMs` caps the search time (a few
   * positions — long forced mates, say — take minutes to reach a deep fixed
   * depth, and a search that is cut off by a test timeout leaves the engine's
   * output out of step with every later request).
   * Returns { bestmove, lines: Map<multipv, { depth, score: {type, value}, pv: string[] }> }.
   */
  async analyse(fen, { depth = 16, multipv = 1, maxMs = 90_000 } = {}) {
    this.send('ucinewgame');
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth} movetime ${maxMs}`);
    const output = await this.collect((l) => l.startsWith('bestmove'));
    const lines = new Map();
    for (const line of output) {
      if (!line.startsWith('info depth') || !line.includes(' pv ')) continue;
      const d = Number(/depth (\d+)/.exec(line)[1]);
      const mp = Number((/multipv (\d+)/.exec(line) ?? [0, 1])[1]);
      const sc = /score (cp|mate) (-?\d+)/.exec(line);
      const pv = line.split(' pv ')[1].split(' ');
      lines.set(mp, { depth: d, score: { type: sc[1], value: Number(sc[2]) }, pv });
    }
    const bestmove = output.at(-1).split(' ')[1];
    return { bestmove, lines };
  }

  quit() {
    this.send('quit');
    setTimeout(() => this.proc.kill(), 500).unref();
  }
}

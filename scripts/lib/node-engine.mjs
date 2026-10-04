/**
 * Runs the bundled Stockfish WASM build as a child process for Node-side tooling
 * (puzzle verification, content checks).
 *
 * The engine's JS glue is CommonJS but this repository is `"type": "module"`,
 * so Node would refuse to run the `.js` file directly. We copy it (and the
 * WASM next to it) into a temp directory with a `.cjs` extension, where the
 * glue's CLI mode works unchanged. The directory is private to this process
 * (`mkdtemp`) and removed when it exits, so verification runs started side by
 * side never overwrite each other's files.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENGINE_DIR = join(ROOT, 'public', 'engine');
const NAME = 'stockfish-19-lite-single';

export function engineInstalled(engineDir = ENGINE_DIR) {
  return existsSync(join(engineDir, `${NAME}.js`)) && existsSync(join(engineDir, `${NAME}.wasm`));
}

/** This process's copies of the engine, by source directory. */
const runnables = new Map();

/**
 * Copies the engine into a fresh temp directory of this process (once per
 * source directory) and returns the path of the runnable `.cjs` script.
 */
export function prepareRunnable(engineDir = ENGINE_DIR) {
  const known = runnables.get(engineDir);
  if (known) return known;
  const dir = mkdtempSync(join(tmpdir(), 'chess-trainer-engine-'));
  const script = join(dir, `${NAME}.cjs`);
  copyFileSync(join(engineDir, `${NAME}.js`), script);
  copyFileSync(join(engineDir, `${NAME}.wasm`), join(dir, `${NAME}.wasm`));
  process.once('exit', () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Still in use (Windows keeps files of a running process locked): the OS cleans tmp.
    }
  });
  runnables.set(engineDir, script);
  return script;
}

export class NodeEngine {
  /**
   * @param {{ script?: string }} [options] `script` runs another engine script
   *   instead of the bundled Stockfish (the tests use a fake one).
   */
  constructor({ script } = {}) {
    if (!script && !engineInstalled()) {
      throw new Error('Engine not installed — run `npm run engine:setup` first.');
    }
    this.proc = spawn(process.execPath, [script ?? prepareRunnable()], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.buffer = '';
    /** @type {{ onLine: (line: string) => void, reject: (error: Error) => void }[]} */
    this.waiters = [];
    /** Set once the process is gone: every later request fails with it at once. */
    this.exitError = null;
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let idx;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        for (const waiter of [...this.waiters]) waiter.onLine(line);
      }
    });
    this.proc.stdin.on('error', () => {
      // Writing to an engine that has died fails with EPIPE; the exit handler below reports it.
    });
    this.proc.on('error', (err) => this.#fail(new Error(`Engine failed to start: ${err.message}`)));
    this.proc.on('exit', (code, signal) => {
      const reason = new Error(
        `Engine exited (${signal ? `signal ${signal}` : `code ${code}`}) before answering`,
      );
      // Lines the engine wrote before exiting still reach their waiters first.
      const stdout = this.proc.stdout;
      if (stdout.readableEnded || stdout.destroyed) this.#fail(reason);
      else stdout.once('close', () => this.#fail(reason));
    });
  }

  /** Rejects every pending request, and every later one, with `error`. */
  #fail(error) {
    if (this.exitError) return;
    this.exitError = error;
    const pending = this.waiters;
    this.waiters = [];
    for (const waiter of pending) waiter.reject(error);
  }

  send(command) {
    if (this.exitError) return;
    this.proc.stdin.write(command + '\n');
  }

  /**
   * Resolves with every line received up to and including the first that
   * satisfies `until`; rejects if the engine process exits first.
   */
  collect(until) {
    if (this.exitError) return Promise.reject(this.exitError);
    return new Promise((resolve, reject) => {
      const lines = [];
      const waiter = {
        onLine: (line) => {
          lines.push(line);
          if (until(line)) {
            this.waiters = this.waiters.filter((w) => w !== waiter);
            resolve(lines);
          }
        },
        reject,
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
   * output out of step with every later request). `searchmoves` (UCI moves)
   * restricts the search to those moves, to score one move at the same depth.
   * Returns { bestmove, lines: Map<multipv, { depth, score: {type, value}, pv: string[] }> }.
   */
  async analyse(fen, { depth = 16, multipv = 1, maxMs = 90_000, searchmoves = [] } = {}) {
    this.send('ucinewgame');
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    // `searchmoves` must come last: Stockfish reads every token after it as a move.
    const restrict = searchmoves.length ? ` searchmoves ${searchmoves.join(' ')}` : '';
    this.send(`go depth ${depth} movetime ${maxMs}${restrict}`);
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

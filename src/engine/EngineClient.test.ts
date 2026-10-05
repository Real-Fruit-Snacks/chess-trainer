import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_BUILD_URLS, ENGINE_WASM_URLS } from './build';
import { EngineClient, EngineCrashedError } from './EngineClient';

/**
 * A stand-in for the Stockfish worker: answers the UCI handshake and records
 * every command. Workers created for `failingUrl` report a load error instead.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static failingUrl: string | null = null;
  /** Further URLs whose workers report a load error. */
  static failingUrls = new Set<string>();
  /** URLs whose workers never answer the handshake (a slow compile). */
  static hangingUrls = new Set<string>();
  /** When set, `go` commands are recorded but never answered (until `stop`). */
  static silentSearches = false;
  readonly url: string;
  readonly sent: string[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWorker.instances.push(this);
    if (this.url === FakeWorker.failingUrl || FakeWorker.failingUrls.has(this.url)) {
      queueMicrotask(() => this.onerror?.({ message: 'SharedArrayBuffer is not defined' }));
    }
  }

  postMessage(command: string) {
    this.sent.push(command);
    if (FakeWorker.hangingUrls.has(this.url)) return;
    const reply = (line: string) =>
      queueMicrotask(() => this.onmessage?.({ data: line } as MessageEvent<string>));
    if (command === 'uci') reply('uciok');
    if (command === 'isready') reply('readyok');
    if (command.startsWith('go ')) {
      if (FakeWorker.silentSearches) return;
      reply('info depth 1 multipv 1 score cp 10 pv e2e4');
      reply('bestmove e2e4');
    }
    if (command === 'stop' && FakeWorker.silentSearches) reply('bestmove e2e4');
  }

  /** The worker dies after the handshake. */
  crash(message = 'RuntimeError: memory access out of bounds') {
    this.onerror?.({ message });
  }

  terminate() {
    this.terminated = true;
  }
}

/** The page is served by the service worker, which hands the engine worker the stored files. */
function controlled() {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller: {} },
  });
}

/** A Cache API holding the given URLs (the files downloaded to the device). */
function fakeCaches(stored: string[]) {
  const urls = new Set(stored);
  return {
    match: (url: string) => Promise.resolve(urls.has(url) ? new Response('stored') : undefined),
  };
}

describe('EngineClient builds', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    FakeWorker.failingUrl = null;
    FakeWorker.failingUrls.clear();
    FakeWorker.hangingUrls.clear();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('WebAssembly', {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('starts the single-threaded build by default without touching Threads', async () => {
    const client = new EngineClient();
    await client.init();
    expect(client.status).toBe('ready');
    expect(client.build).toBe('single');
    expect(client.threads).toBe(1);
    expect(client.name).toBe('Stockfish 19 lite');
    const worker = FakeWorker.instances[0];
    expect(worker?.url).toBe(ENGINE_BUILD_URLS.single);
    expect(worker?.sent.some((c) => c.startsWith('setoption name Threads'))).toBe(false);
    client.terminate();
  });

  it('starts the threaded build and sets the thread count', async () => {
    const client = new EngineClient({ build: 'multi', threads: 4 });
    await client.init();
    expect(client.build).toBe('multi');
    expect(client.threads).toBe(4);
    expect(client.fellBack).toBe(false);
    expect(client.fallbackReason).toBeNull();
    expect(client.name).toBe('Stockfish 19 lite · 4 threads');
    const worker = FakeWorker.instances[0];
    expect(worker?.url).toBe(ENGINE_BUILD_URLS.multi);
    // Threads must be configured before the engine is asked whether it is ready.
    const commands = worker?.sent ?? [];
    expect(commands.indexOf('setoption name Threads value 4')).toBeLessThan(
      commands.indexOf('isready'),
    );
    client.terminate();
  });

  it('falls back to the single-threaded build when the threaded worker fails', async () => {
    FakeWorker.failingUrl = ENGINE_BUILD_URLS.multi;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = new EngineClient({ build: 'multi', threads: 4, initTimeoutMs: 2000 });
    await client.init();
    expect(client.status).toBe('ready');
    expect(client.build).toBe('single');
    expect(client.threads).toBe(1);
    expect(client.fellBack).toBe(true);
    expect(client.fallbackReason).toBe('failed');
    expect(FakeWorker.instances.map((w) => w.url)).toEqual([
      ENGINE_BUILD_URLS.multi,
      ENGINE_BUILD_URLS.single,
    ]);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    client.terminate();
  });

  it('reports an error when even the single-threaded build fails', async () => {
    FakeWorker.failingUrl = ENGINE_BUILD_URLS.single;
    const client = new EngineClient({ initTimeoutMs: 2000 });
    await expect(client.init()).rejects.toThrow(/failed to load/);
    expect(client.status).toBe('error');
  });

  it('starts the downloaded full engine with its threads', async () => {
    controlled();
    vi.stubGlobal(
      'caches',
      fakeCaches([ENGINE_BUILD_URLS['full-multi'], ENGINE_WASM_URLS['full-multi']]),
    );
    const client = new EngineClient({ build: 'full-multi', threads: 4 });
    await client.init();
    expect(client.build).toBe('full-multi');
    expect(client.threads).toBe(4);
    expect(client.fellBack).toBe(false);
    expect(client.name).toBe('Stockfish 19 · 4 threads');
    const worker = FakeWorker.instances[0];
    expect(worker?.url).toBe(ENGINE_BUILD_URLS['full-multi']);
    expect(worker?.sent).toContain('setoption name Threads value 4');
    client.terminate();
  });

  it('runs the lite engine, quietly, while the full one is not downloaded', async () => {
    controlled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Only the script made it: a half-finished download counts as none.
    vi.stubGlobal('caches', fakeCaches([ENGINE_BUILD_URLS['full-multi']]));
    const threaded = new EngineClient({ build: 'full-multi', threads: 4 });
    await threaded.init();
    expect(threaded.build).toBe('multi');
    expect(threaded.threads).toBe(4);
    expect(threaded.fellBack).toBe(true);
    expect(threaded.fallbackReason).toBe('not-downloaded');
    // No worker was started for the missing build.
    expect(FakeWorker.instances.map((w) => w.url)).toEqual([ENGINE_BUILD_URLS.multi]);
    threaded.terminate();

    // A browser without the Cache API can never have it.
    vi.stubGlobal('caches', undefined);
    const single = new EngineClient({ build: 'full-single' });
    await single.init();
    expect(single.build).toBe('single');
    expect(single.fallbackReason).toBe('not-downloaded');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    single.terminate();
  });

  it('falls back to lite when the full engine fails to start, then to one thread', async () => {
    controlled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'caches',
      fakeCaches([ENGINE_BUILD_URLS['full-multi'], ENGINE_WASM_URLS['full-multi']]),
    );
    FakeWorker.failingUrls = new Set([ENGINE_BUILD_URLS['full-multi'], ENGINE_BUILD_URLS.multi]);
    const client = new EngineClient({ build: 'full-multi', threads: 4, initTimeoutMs: 2000 });
    await client.init();
    expect(client.build).toBe('single');
    expect(client.threads).toBe(1);
    expect(client.fallbackReason).toBe('failed');
    expect(FakeWorker.instances.map((w) => w.url)).toEqual([
      ENGINE_BUILD_URLS['full-multi'],
      ENGINE_BUILD_URLS.multi,
      ENGINE_BUILD_URLS.single,
    ]);
    expect(FakeWorker.instances.slice(0, 2).every((w) => w.terminated)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
    client.terminate();
  });

  it('leaves a stored full engine alone on a page the service worker does not serve', async () => {
    // A hard reload passes the worker by: the engine worker would fetch 99 MB from the network.
    vi.stubGlobal(
      'caches',
      fakeCaches([ENGINE_BUILD_URLS['full-multi'], ENGINE_WASM_URLS['full-multi']]),
    );
    const client = new EngineClient({ build: 'full-multi', threads: 4 });
    await client.init();
    expect(client.build).toBe('multi');
    expect(client.fallbackReason).toBe('not-downloaded');
    client.terminate();
  });

  it('says a build failed even when the full engine was also missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('caches', fakeCaches([]));
    FakeWorker.failingUrls = new Set([ENGINE_BUILD_URLS.multi]);
    const client = new EngineClient({ build: 'full-multi', threads: 4, initTimeoutMs: 2000 });
    await client.init();
    expect(client.build).toBe('single');
    expect(client.fallbackReason).toBe('failed');
    warn.mockRestore();
    client.terminate();
  });

  it('gives the full engine four times as long to compile', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      controlled();
      vi.stubGlobal(
        'caches',
        fakeCaches([ENGINE_BUILD_URLS['full-single'], ENGINE_WASM_URLS['full-single']]),
      );
      FakeWorker.hangingUrls = new Set([ENGINE_BUILD_URLS['full-single']]);
      const client = new EngineClient({ build: 'full-single', initTimeoutMs: 1000 });
      const ready = client.init();
      await vi.advanceTimersByTimeAsync(3900);
      // Past the lite engine's limit, still waiting for the full one.
      expect(FakeWorker.instances).toHaveLength(1);
      expect(client.status).toBe('loading');
      await vi.advanceTimersByTimeAsync(200);
      await ready;
      expect(client.build).toBe('single');
      expect(client.fallbackReason).toBe('failed');
      expect(FakeWorker.instances.map((w) => w.url)).toEqual([
        ENGINE_BUILD_URLS['full-single'],
        ENGINE_BUILD_URLS.single,
      ]);
      client.terminate();
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});

/** Lets queued microtasks and the fake worker's replies run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('EngineClient searches', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    FakeWorker.failingUrl = null;
    FakeWorker.failingUrls.clear();
    FakeWorker.hangingUrls.clear();
    FakeWorker.silentSearches = false;
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('WebAssembly', {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs newGame after the running search and before a later one', async () => {
    FakeWorker.silentSearches = true;
    const client = new EngineClient();
    await client.init();
    const first = client.search({ fen: 'first' });
    const fresh = client.newGame();
    // `ucinewgame` must wait for the search to finish.
    await tick();
    const sent = () => FakeWorker.instances[0]?.sent ?? [];
    expect(sent()).toContain('position fen first');
    expect(sent()).not.toContain('ucinewgame');
    first.stop();
    await first.result;
    await fresh;
    const second = client.search({ fen: 'second' });
    await tick();
    second.stop();
    await second.result;
    const commands = sent();
    expect(commands.indexOf('ucinewgame')).toBeGreaterThan(commands.indexOf('position fen first'));
    expect(commands.indexOf('ucinewgame')).toBeLessThan(commands.indexOf('position fen second'));
    client.terminate();
  });

  it('newGame stops a search that is already running, which belongs to the old game', async () => {
    FakeWorker.silentSearches = true;
    const client = new EngineClient();
    await client.init();
    const old = client.search({ fen: 'old', infinite: true });
    await tick();
    const fresh = client.newGame();
    const result = await old.result;
    expect(result.stopped).toBe(true);
    await fresh;
    const commands = FakeWorker.instances[0]?.sent ?? [];
    expect(commands.indexOf('stop')).toBeGreaterThan(commands.indexOf('go infinite'));
    expect(commands.indexOf('ucinewgame')).toBeGreaterThan(commands.indexOf('stop'));
    client.terminate();
  });

  it('runs queued searches in order, skipping one whose handle was stopped before it started', async () => {
    FakeWorker.silentSearches = true;
    const client = new EngineClient();
    await client.init();
    const running = client.search({ fen: 'running' });
    await tick();
    const queued = client.search({ fen: 'queued' });
    const newest = client.search({ fen: 'newest' });
    queued.stop();
    const skipped = await queued.result;
    expect(skipped.stopped).toBe(true);
    expect(skipped.bestmove.move).toBeNull();
    // The running search was asked to stop when the next one was requested.
    const first = await running.result;
    expect(first.stopped).toBe(true);
    await tick();
    newest.stop();
    await newest.result;
    const positions = (FakeWorker.instances[0]?.sent ?? []).filter((c) => c.startsWith('position'));
    expect(positions).toEqual(['position fen running', 'position fen newest']);
    client.terminate();
  });

  it('rejects the running search and reports an error when the worker dies after booting', async () => {
    FakeWorker.silentSearches = true;
    const client = new EngineClient();
    await client.init();
    const errors: Error[] = [];
    client.onError((err) => errors.push(err));
    const handle = client.search({ fen: 'x' });
    await tick();
    FakeWorker.instances[0]?.crash();
    await expect(handle.result).rejects.toBeInstanceOf(EngineCrashedError);
    expect(client.status).toBe('error');
    expect(client.error?.message).toMatch(/crashed/);
    expect(errors).toHaveLength(1);
    // Further work is refused rather than left pending.
    await expect(client.search({ fen: 'y' }).result).rejects.toBeInstanceOf(EngineCrashedError);
    await expect(client.newGame()).rejects.toBeInstanceOf(EngineCrashedError);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it('terminate() rejects the pending search and newGame', async () => {
    FakeWorker.silentSearches = true;
    const client = new EngineClient();
    await client.init();
    const handle = client.search({ fen: 'x' });
    const fresh = client.newGame();
    await tick();
    client.terminate();
    await expect(handle.result).rejects.toBeInstanceOf(EngineCrashedError);
    await expect(fresh).rejects.toBeInstanceOf(EngineCrashedError);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it('puts searchmoves after the limits, since the engine reads every later token as a move', async () => {
    const client = new EngineClient();
    const result = await client.search({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      depth: 12,
      searchmoves: ['g1f3', 'b1c3'],
    }).result;
    expect(result.bestmove.move).toBe('e2e4');
    const go = FakeWorker.instances[0]?.sent.find((c) => c.startsWith('go '));
    expect(go).toBe('go depth 12 searchmoves g1f3 b1c3');
  });

  it('defaults to depth 12 and passes the moves played since the position', async () => {
    const client = new EngineClient();
    await client.search({ fen: 'startpos-fen', moves: ['e2e4', 'e7e5'] }).result;
    const sent = FakeWorker.instances[0]?.sent ?? [];
    expect(sent).toContain('position fen startpos-fen moves e2e4 e7e5');
    expect(sent).toContain('go depth 12');
  });
});

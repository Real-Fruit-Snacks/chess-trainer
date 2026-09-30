import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_BUILD_URLS } from './build';
import { EngineClient } from './EngineClient';

/**
 * A stand-in for the Stockfish worker: answers the UCI handshake and records
 * every command. Workers created for `failingUrl` report a load error instead.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static failingUrl: string | null = null;
  readonly url: string;
  readonly sent: string[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWorker.instances.push(this);
    if (this.url === FakeWorker.failingUrl) {
      queueMicrotask(() => this.onerror?.({ message: 'SharedArrayBuffer is not defined' }));
    }
  }

  postMessage(command: string) {
    this.sent.push(command);
    const reply = (line: string) =>
      queueMicrotask(() => this.onmessage?.({ data: line } as MessageEvent<string>));
    if (command === 'uci') reply('uciok');
    if (command === 'isready') reply('readyok');
  }

  terminate() {
    this.terminated = true;
  }
}

describe('EngineClient builds', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    FakeWorker.failingUrl = null;
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('WebAssembly', {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(client.name).toBe('Stockfish 19 · 4 threads');
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
});

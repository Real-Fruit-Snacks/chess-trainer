import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { MAIA_VOCABULARY_SIZE, maiaMoveIndex } from './encoding';
import { MaiaClient, type MaiaWorkerPort, maiaUrls } from './maiaClient';
import type { MaiaRequest, MaiaResponse } from './protocol';

const URLS = {
  modelUrl: 'https://app.test/maia/model.onnx',
  runtimeUrl: 'https://app.test/maia/ort.wasm',
};

/** A worker stand-in: records what it is sent, and answers when the test says so. */
class FakeWorker implements MaiaWorkerPort {
  sent: MaiaRequest[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<MaiaResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(message: MaiaRequest): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: MaiaResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<MaiaResponse>);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new MaiaClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  }, URLS);
  return { client, workers };
}

/** Scores that make 1.d4 the favourite, then 1.e4. */
function scores(): { logits: ArrayBuffer; value: ArrayBuffer } {
  const logits = new Float32Array(MAIA_VOCABULARY_SIZE).fill(-10);
  logits[maiaMoveIndex('d2d4', false)] = 5;
  logits[maiaMoveIndex('e2e4', false)] = 4;
  return { logits: logits.buffer, value: Float32Array.from([0, 0, 0]).buffer };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('MaiaClient', () => {
  it('starts its worker once, and loads the model with the file locations', async () => {
    const { client, workers } = setup();
    const statuses: string[] = [];
    client.subscribe(() => statuses.push(client.status));
    const first = client.load();
    const second = client.load();
    expect(workers).toHaveLength(1);
    expect(workers[0]?.sent).toEqual([{ type: 'load', ...URLS }]);
    workers[0]?.reply({ type: 'loaded' });
    await Promise.all([first, second]);
    expect(client.status).toBe('ready');
    expect(statuses).toEqual(['loading', 'ready']);
    await client.load();
    expect(workers).toHaveLength(1);
  });

  it('turns the worker’s scores for a position into its legal moves', async () => {
    const { client, workers } = setup();
    const loading = client.load();
    workers[0]?.reply({ type: 'loaded' });
    await loading;
    const prediction = client.predict(START_FEN, 1700);
    await flush();
    const request = workers[0]?.sent[1];
    expect(request).toMatchObject({ type: 'predict', rating: 1700, opponentRating: 1700 });
    if (request?.type !== 'predict') throw new Error('no prediction asked for');
    expect(new Float32Array(request.tokens)).toHaveLength(768);
    workers[0]?.reply({ type: 'prediction', id: request.id, ...scores() });
    const { moves, value } = await prediction;
    expect(moves.slice(0, 2).map((m) => m.san)).toEqual(['d4', 'e4']);
    expect(value.draw).toBeCloseTo(1 / 3);
  });

  it('reports a failed load, and starts afresh on the next attempt', async () => {
    const { client, workers } = setup();
    const loading = client.load();
    workers[0]?.reply({ type: 'load-failed', message: 'maia3-5m.fp16.onnx: HTTP 404' });
    await expect(loading).rejects.toThrow('HTTP 404');
    expect(client.status).toBe('failed');
    expect(client.error).toBe('maia3-5m.fp16.onnx: HTTP 404');
    expect(workers[0]?.terminated).toBe(true);
    const retry = client.load();
    expect(workers).toHaveLength(2);
    workers[1]?.reply({ type: 'loaded' });
    await retry;
    expect(client.status).toBe('ready');
    expect(client.error).toBeNull();
  });

  it('fails what was waiting when the worker crashes or is stopped', async () => {
    const { client, workers } = setup();
    const loading = client.load();
    workers[0]?.reply({ type: 'loaded' });
    await loading;
    const prediction = client.predict(START_FEN, 1200);
    await flush();
    workers[0]?.onerror?.({ message: 'out of memory' } as ErrorEvent);
    await expect(prediction).rejects.toThrow('out of memory');
    expect(client.status).toBe('failed');

    const again = client.load();
    workers[1]?.reply({ type: 'loaded' });
    await again;
    const stopped = client.predict(START_FEN, 1200);
    await flush();
    client.dispose();
    await expect(stopped).rejects.toThrow('stopped');
    expect(client.status).toBe('idle');
    expect(workers[1]?.terminated).toBe(true);
  });

  it('passes a prediction’s own failure on without failing the model', async () => {
    const { client, workers } = setup();
    const loading = client.load();
    workers[0]?.reply({ type: 'loaded' });
    await loading;
    const prediction = client.predict(START_FEN, 1200);
    await flush();
    const request = workers[0]?.sent[1];
    if (request?.type !== 'predict') throw new Error('no prediction asked for');
    workers[0]?.reply({ type: 'prediction-failed', id: request.id, message: 'bad input' });
    await expect(prediction).rejects.toThrow('bad input');
    expect(client.status).toBe('ready');
  });

  it('finds the files under the app’s base path', () => {
    const urls = maiaUrls('/chess-trainer/');
    expect(new URL(urls.modelUrl).pathname).toBe('/chess-trainer/maia/maia3-5m.fp16.onnx');
    expect(new URL(urls.runtimeUrl).pathname).toMatch(
      /^\/chess-trainer\/maia\/ort-[\d.]+-simd-threaded\.wasm$/,
    );
  });
});

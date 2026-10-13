import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LichessError } from '@/lib/lichess/api';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import { backoff, lichessTiming, postToLichess, readLichessStream } from './lichessStream';

const defaults = { ...lichessTiming };

afterEach(() => {
  Object.assign(lichessTiming, defaults);
  vi.unstubAllGlobals();
});

/** A body that arrives in the given pieces, then stays open (or ends, when `end`). */
function pieces(parts: string[], end: boolean): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      if (end) controller.close();
    },
  });
}

describe('reading a Lichess stream', () => {
  it('hands over each line, whole, however it arrives, and skips the keep-alive lines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(pieces(['{"a":', '1}\n\n{"b"', ':2}\n', '\n{"c":3}'], true), {
            status: 200,
          }),
        ),
      ),
    );
    const lines: unknown[] = [];
    let opened = false;
    await readLichessStream('/api/stream/event', {
      token: 'lip_x',
      signal: new AbortController().signal,
      onOpen: () => {
        opened = true;
      },
      onLine: (line) => lines.push(line),
    });
    expect(opened).toBe(true);
    expect(lines).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('gives up a stream that goes quiet, and says it went quiet', async () => {
    lichessTiming.idleMs = 50;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('\n'));
            // Then nothing more, until the reader gives up the connection.
            init.signal?.addEventListener('abort', () =>
              controller.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      }),
    );
    const error = await readLichessStream('/api/stream/event', {
      token: 'lip_x',
      signal: new AbortController().signal,
      onLine: () => undefined,
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(LichessError);
    expect(error).toMatchObject({
      kind: 'network',
      message: 'The connection to Lichess went quiet.',
    });
  });

  it('fails with a LichessError for an answer that cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(pieces(['{nope}\n'], true), { status: 200 }))),
    );
    await expect(
      readLichessStream('/api/stream/event', {
        token: 'lip_x',
        signal: new AbortController().signal,
        onLine: () => undefined,
      }),
    ).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('Board API requests', () => {
  let lichess: FakeLichessHandle;
  beforeEach(() => {
    lichess = installFakeLichess();
  });

  it('go straight to Lichess, and say what went wrong', async () => {
    const token = lichess.fake.issueToken();
    const game = lichess.fake.board.startGame({ announce: false });
    await postToLichess(`/api/board/game/${game.id}/move/e2e4`, token);
    expect(game.moves).toEqual(['e2e4']);
    await expect(postToLichess('/api/board/game/nosuchgm/abort', token)).rejects.toMatchObject({
      kind: 'not-found',
    });
    await expect(
      postToLichess(`/api/board/game/${game.id}/abort`, 'lip_nope'),
    ).rejects.toMatchObject({ kind: 'auth' });
    lichess.offline = true;
    await expect(postToLichess(`/api/board/game/${game.id}/abort`, token)).rejects.toMatchObject({
      kind: 'network',
      message: 'Lichess could not be reached.',
    });
  });

  it('wait longer after each failure, up to a limit', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => backoff(n, 1000, 10_000))).toEqual([
      1000, 2000, 4000, 8000, 10_000, 10_000,
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLichess } from '@/store/lichess';
import {
  describeExplorerError,
  EXPLORER_TIMEOUT_MS,
  ExplorerError,
  type ExplorerResult,
  explorerUrl,
  formatPercent,
  lookupExplorer,
  lookupExplorerBatch,
  normalizeExplorer,
  peekExplorer,
} from './explorer';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

const masters = {
  white: 300,
  draws: 500,
  black: 200,
  opening: null,
  moves: [
    { uci: 'e2e4', san: 'e4', white: 200, draws: 300, black: 100, averageRating: 2450 },
    { uci: 'd2d4', san: 'd4', white: 100, draws: 200, black: 100, averageRating: 2460 },
  ],
  topGames: [
    {
      id: 'abc',
      winner: 'white' as const,
      white: { name: 'Kasparov', rating: 2800 },
      black: { name: 'Karpov', rating: 2750 },
      year: 1990,
    },
  ],
};

describe('opening explorer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalises moves with shares and scores for the side to move', () => {
    const result = normalizeExplorer(masters, 'masters');
    expect(result.total).toBe(1000);
    expect(result.moves[0]).toMatchObject({ san: 'e4', total: 600, share: 0.6 });
    expect(result.moves[0]?.score).toBeCloseTo((200 + 150) / 600);
    expect(result.topGames[0]).toMatchObject({ id: 'abc', winner: 'white', year: 1990 });
  });

  it('builds the request URLs for both databases', () => {
    const masters = new URL(explorerUrl(START, 'masters'));
    expect(masters.origin + masters.pathname).toBe('https://explorer.lichess.org/masters');
    expect(masters.searchParams.get('fen')).toBe(START);
    expect(masters.searchParams.get('moves')).toBe('12');
    const lichess = new URL(explorerUrl(START, 'lichess'));
    expect(lichess.pathname).toBe('/lichess');
    expect(lichess.searchParams.get('speeds')).toBe('blitz,rapid,classical');
    expect(lichess.searchParams.get('ratings')).toBe('1600,1800,2000,2200');
  });

  it('fetches once per position and scores moves for Black when Black is to move', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(masters), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const a = await lookupExplorer(AFTER_E4, 'masters');
    const b = await lookupExplorer(AFTER_E4, 'masters');
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Black to move: the e4 row's score is Black's wins plus half the draws.
    expect(a.moves[0]?.score).toBeCloseTo((100 + 150) / 600);
  });

  it('reports rate limiting and failures clearly, with the wait the server asks for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 429 }))),
    );
    await expect(lookupExplorer(START, 'lichess')).rejects.toThrow(/rate-limiting.*a minute/);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '30' } })),
      ),
    );
    const limited = await lookupExplorer(START, 'masters').catch((e: unknown) => e);
    expect(limited).toBeInstanceOf(ExplorerError);
    expect((limited as Error).message).toBe(
      'The explorer is rate-limiting requests — try again in 30 seconds.',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '300' } })),
      ),
    );
    await expect(lookupExplorer(START, 'masters')).rejects.toThrow(/try again in 5 minutes/);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );
    await expect(lookupExplorer('8/8/8/8/8/8/8/K6k w - - 0 1', 'lichess')).rejects.toThrow(
      /HTTP 500/,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>', { status: 200 }))),
    );
    await expect(lookupExplorer('8/8/8/8/8/8/8/K5k1 w - - 0 1', 'lichess')).rejects.toThrow(
      /could not be read/,
    );
    expect(formatPercent(0.615)).toBe('62 %');
  });

  it('gives up after a deadline instead of hanging, and still honours the caller’s abort', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(lookupExplorer('8/8/8/8/8/8/8/K4k2 w - - 0 1', 'masters')).rejects.toThrow(
      'The explorer took too long to answer — try again in a moment.',
    );
    // The request carries a signal that combines the deadline with the caller's own.
    const controller = new AbortController();
    await lookupExplorer('8/8/8/8/8/8/8/K3k3 w - - 0 1', 'masters', controller.signal).catch(
      () => undefined,
    );
    const signal = fetchMock.mock.calls[1]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal).not.toBe(controller.signal);
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    expect(EXPLORER_TIMEOUT_MS).toBe(15_000);
  });

  it('describes failures for the card: offline first, then unreachable, then the error itself', () => {
    expect(describeExplorerError(new TypeError('Failed to fetch'), false)).toMatch(/offline/);
    expect(describeExplorerError(new TypeError('Failed to fetch'), true)).toMatch(
      /could not be reached/,
    );
    const failed = new ExplorerError('The explorer answered HTTP 500 — try again later.');
    expect(describeExplorerError(failed, true)).toBe(
      'The explorer answered HTTP 500 — try again later.',
    );
    expect(describeExplorerError('odd', true)).toMatch(/unavailable/);
  });
});

describe('opening explorer: sign-in, errors and the cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useLichess.setState({ account: null, needsReconnect: false });
  });

  const ok = () => Promise.resolve(new Response(JSON.stringify(masters), { status: 200 }));

  it('sends the connected Lichess account’s token, which the explorer asks for', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => ok());
    vi.stubGlobal('fetch', fetchMock);
    await lookupExplorer('8/8/8/8/8/8/8/K2k4 w - - 0 1', 'masters');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Accept: 'application/json' });

    useLichess.setState({
      account: { id: 'me', username: 'Me', token: 'lip_token', connectedAt: 0, expiresAt: null },
    });
    await lookupExplorer('8/8/8/8/8/8/8/K3k3 b - - 0 1', 'lichess');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer lip_token',
    });
  });

  it('says to connect a Lichess account when the explorer refuses the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 401 }))),
    );
    const anonymous = await lookupExplorer('8/8/8/8/8/8/1K6/7k w - - 0 1', 'masters').catch(
      (e: unknown) => e,
    );
    expect(anonymous).toMatchObject({ kind: 'auth' });
    expect((anonymous as Error).message).toMatch(/needs a Lichess account/);

    useLichess.setState({
      account: { id: 'me', username: 'Me', token: 'revoked', connectedAt: 0, expiresAt: null },
    });
    await expect(lookupExplorer('8/8/8/8/8/8/2K5/7k w - - 0 1', 'masters')).rejects.toThrow(
      /did not accept this device’s sign-in/,
    );
  });

  it('marks a 429 with the wait the server asks for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '30' } })),
      ),
    );
    const limited = await lookupExplorer('8/8/8/8/8/8/3K4/7k w - - 0 1', 'lichess').catch(
      (e: unknown) => e,
    );
    expect(limited).toMatchObject({ kind: 'rate-limited', retryAfter: 30 });
  });

  it('peeks at the session’s answers without a request', async () => {
    const fen = '8/8/8/8/8/8/4K3/7k w - - 0 1';
    const fetchMock = vi.fn(() => ok());
    vi.stubGlobal('fetch', fetchMock);
    expect(peekExplorer(fen, 'masters')).toBeNull();
    const result = await lookupExplorer(fen, 'masters');
    // The same position with other move counters, from the same database.
    expect(peekExplorer('8/8/8/8/8/8/4K3/7k w - - 12 40', 'masters')).toBe(result);
    expect(peekExplorer(fen, 'lichess')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('opening explorer batches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const someAnswer = normalizeExplorer(masters, 'masters');

  it('ask one position at a time, pause between requests and wait out a 429', async () => {
    vi.useFakeTimers();
    const fens = [
      '8/8/8/8/8/8/5K2/7k w - - 0 1',
      '8/8/8/8/8/8/6K1/k7 w - - 0 1',
      '8/8/8/8/8/8/K7/2k5 w - - 0 1',
    ];
    let calls = 0;
    const fetchMock = vi.fn(() => {
      calls += 1;
      return Promise.resolve(
        calls === 2
          ? new Response('', { status: 429, headers: { 'Retry-After': '2' } })
          : new Response(JSON.stringify(masters), { status: 200 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const waits: (number | null)[] = [];
    const answered: number[] = [];
    const done = lookupExplorerBatch(fens, 'masters', {
      onWait: (seconds) => waits.push(seconds),
      onResult: (_result, index) => answered.push(index),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    // The second position: a 429 asking for two seconds.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([2]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    // The same position again, at once: the wait was the pause.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([2, null]);
    await vi.advanceTimersByTimeAsync(500);
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(answered).toEqual([0, 1, 2]);

    // Asked again, every position comes from the session's cache: no request, no pause.
    const again: number[] = [];
    await lookupExplorerBatch(fens, 'masters', { onResult: (_r, index) => again.push(index) });
    expect(again).toEqual([0, 1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('never sends a request while another lookup of the app is in flight', async () => {
    let release: (res: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const card = lookupExplorer('8/8/8/8/8/8/7K/1k6 w - - 0 1', 'masters');
    const lookup = vi.fn((): Promise<ExplorerResult> => Promise.resolve(someAnswer));
    const batch = lookupExplorerBatch(['8/8/8/8/8/8/7K/2k5 w - - 0 1'], 'masters', {
      lookup,
      cached: () => null,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lookup).not.toHaveBeenCalled();
    release(new Response(JSON.stringify(masters), { status: 200 }));
    await card;
    await batch;
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('stop at once when aborted, even in the middle of a wait', async () => {
    const controller = new AbortController();
    const lookup = vi.fn((): Promise<ExplorerResult> =>
      Promise.reject(new ExplorerError('Busy.', 'rate-limited', 60)),
    );
    const batch = lookupExplorerBatch(['8/8/8/8/8/8/7K/3k4 w - - 0 1'], 'masters', {
      lookup,
      cached: () => null,
      signal: controller.signal,
      onWait: (seconds) => {
        if (seconds !== null) queueMicrotask(() => controller.abort());
      },
    });
    await expect(batch).rejects.toMatchObject({ name: 'AbortError' });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('give up on any other failure, keeping the answers that came before', async () => {
    const answered: number[] = [];
    const lookup = vi.fn((fen: string): Promise<ExplorerResult> =>
      fen.startsWith('7k')
        ? Promise.reject(new ExplorerError('The explorer answered HTTP 500 — try again later.'))
        : Promise.resolve(someAnswer),
    );
    await expect(
      lookupExplorerBatch(
        ['8/8/8/8/8/8/7K/4k3 w - - 0 1', '7k/8/8/8/8/8/7K/8 w - - 0 1'],
        'masters',
        {
          lookup,
          cached: () => null,
          sleep: () => Promise.resolve(),
          onResult: (_r, index) => answered.push(index),
        },
      ),
    ).rejects.toThrow(/HTTP 500/);
    expect(answered).toEqual([0]);
  });
});

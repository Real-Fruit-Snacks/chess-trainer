import { describe, expect, it } from 'vitest';
import { cacheable } from './cacheable';

async function keep(plugin: ReturnType<typeof cacheable>, response: Response) {
  const request = new Request('https://example.test/puzzles/b1400-03.json');
  return plugin.cacheWillUpdate?.({ request, response, event: new Event('fetch') as never });
}

describe('cacheable', () => {
  it('keeps only complete responses of the right type', async () => {
    const json = cacheable('application/json', 'text/json');
    const good = new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
    expect(await keep(json, good)).toBe(good);
    const portal = new Response('<html>Sign in</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    expect(await keep(json, portal)).toBeNull();
    const partial = new Response('[', {
      status: 206,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(await keep(json, partial)).toBeNull();
    const missing = new Response('{}', { status: 200 });
    expect(await keep(json, missing)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { FRAME_ANCESTORS_POLICY, isNavigation, withFramePolicy } from './framing';

describe('frame policy for served pages', () => {
  it('adds frame-ancestors to a page and keeps everything else', async () => {
    const page = new Response('<html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html', 'X-Test': 'yes' },
    });
    const framed = withFramePolicy(page);
    expect(framed.headers.get('Content-Security-Policy')).toBe(FRAME_ANCESTORS_POLICY);
    expect(framed.headers.get('Content-Type')).toBe('text/html');
    expect(framed.headers.get('X-Test')).toBe('yes');
    expect(framed.status).toBe(200);
    expect(await framed.text()).toBe('<html></html>');
  });

  it('keeps a policy the host sent, adding its own beside it', () => {
    const page = new Response('', {
      headers: { 'Content-Security-Policy': "default-src 'self'" },
    });
    expect(withFramePolicy(page).headers.get('Content-Security-Policy')).toBe(
      `default-src 'self', ${FRAME_ANCESTORS_POLICY}`,
    );
  });

  it('leaves responses it cannot rebuild alone', () => {
    const failed = Response.error();
    expect(withFramePolicy(failed)).toBe(failed);
  });

  it('recognises a navigation by the fetch event, as a precache handler rewrites the request', () => {
    const handlerRequest = new Request('https://example.test/index.html');
    expect(isNavigation(handlerRequest)).toBe(false);
    const navigation = { request: { mode: 'navigate' } as Request };
    Object.setPrototypeOf(navigation.request, Request.prototype);
    expect(isNavigation(handlerRequest, navigation as unknown as Event)).toBe(true);
    const subresource = { request: new Request('https://example.test/app.js') };
    expect(isNavigation(handlerRequest, subresource as unknown as Event)).toBe(false);
  });
});

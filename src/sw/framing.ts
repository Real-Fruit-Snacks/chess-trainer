/**
 * Clickjacking protection for the pages the service worker serves.
 *
 * `index.html` carries a Content-Security-Policy meta tag (vite.config.ts), but
 * `frame-ancestors` is one of the directives a meta tag cannot set, and GitHub
 * Pages sends no headers of its own. So the worker adds the header to every
 * navigation it answers — every visit after the first — and another site can
 * no longer show the app in a frame and steer clicks onto "Reset everything".
 *
 * Shared by the worker and its tests, so no React or DOM here.
 */

export const FRAME_ANCESTORS_POLICY = "frame-ancestors 'none'";

/** Whether the request being answered is a page load (a navigation), not a subresource. */
export function isNavigation(request: Request, event?: Event): boolean {
  // A precache handler bound to a URL answers with a request of its own making, so
  // the original request on the fetch event is the one that says "navigate".
  const original: unknown = event && 'request' in event ? event.request : undefined;
  if (original instanceof Request) return original.mode === 'navigate';
  return request.mode === 'navigate';
}

/**
 * A copy of `response` that refuses to be framed. A policy the host already
 * sent is kept (a second policy only adds restrictions). Opaque and error
 * responses cannot be rebuilt, so they are returned unchanged.
 */
export function withFramePolicy(response: Response): Response {
  if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.append('Content-Security-Policy', FRAME_ANCESTORS_POLICY);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

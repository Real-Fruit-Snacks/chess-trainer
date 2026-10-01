import { describe, expect, it } from 'vitest';
import { crashIssueUrl, describeCrash, reportContext } from './diagnostics';

const context = {
  version: '0.9.0',
  builtAt: '2026-10-01T00:00:00.000Z',
  route: '/arcade/fortress?level=3',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15',
  standalone: true,
  viewport: '390×844',
  language: 'en-GB',
};

describe('diagnostics', () => {
  it('describes a crash with the build, the route, the browser and the stack', () => {
    const error = new Error('Cannot read properties of undefined');
    const text = describeCrash(error, context);
    expect(text).toContain('0.9.0 (built 2026-10-01T00:00:00.000Z)');
    expect(text).toContain('Route: /arcade/fortress?level=3');
    expect(text).toContain('(installed app)');
    expect(text).toContain('Viewport: 390×844 · Language: en-GB');
    expect(text).toContain('Error: Cannot read properties of undefined');
    expect(text.split('\n').length).toBeLessThanOrEqual(16);
  });

  it('prefills the issue form fields', () => {
    const url = new URL(crashIssueUrl(new Error('boom'), context));
    expect(url.pathname).toMatch(/\/issues\/new$/);
    const params = url.searchParams;
    expect(params.get('template')).toBe('bug_report.yml');
    expect(params.get('title')).toBe('Crash: boom');
    expect(params.get('browser')).toContain('iPhone');
    expect(params.get('browser')).toContain('0.9.0');
    expect(params.get('steps')).toContain('/arcade/fortress?level=3');
    expect(params.get('console')).toContain('Error: boom');
  });

  it('reads the live context from the page', () => {
    const live = reportContext();
    expect(live.version).toBe(__APP_VERSION__);
    expect(live.route).toBe('/');
    expect(live.userAgent.length).toBeGreaterThan(0);
    expect(live.viewport).toMatch(/^\d+×\d+$/);
  });
});

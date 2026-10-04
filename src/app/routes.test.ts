import { describe, expect, it } from 'vitest';
import { routes } from './routes';
import { APP_ROUTE_PREFIXES, appNavigationPattern } from '@/sw/appRoutes';

describe('app navigation allowlist', () => {
  it('covers every top-level route the router has, and nothing else', () => {
    const children = routes[0]?.children ?? [];
    const firstSegments = new Set(
      children
        .map((r) => r.path)
        .filter((p): p is string => typeof p === 'string' && p !== '*')
        .map((p) => p.split('/')[0] ?? ''),
    );
    expect([...firstSegments].sort()).toEqual([...APP_ROUTE_PREFIXES].sort());
  });

  it('matches the app’s pages under the base and leaves sibling sites alone', () => {
    const root = appNavigationPattern('/');
    expect(root.test('/')).toBe(true);
    expect(root.test('/puzzles')).toBe(true);
    expect(root.test('/learn/forks')).toBe(true);
    expect(root.test('/settings/lab')).toBe(true);
    expect(root.test('/puzzlesx')).toBe(false);
    expect(root.test('/other-project/')).toBe(false);
    expect(root.test('/blog/post')).toBe(false);

    const project = appNavigationPattern('/chess-trainer/');
    expect(project.test('/chess-trainer/')).toBe(true);
    expect(project.test('/chess-trainer/arcade/simul')).toBe(true);
    expect(project.test('/chess-trainer/nothing')).toBe(false);
    expect(project.test('/')).toBe(false);
    expect(project.test('/other/puzzles')).toBe(false);
  });
});

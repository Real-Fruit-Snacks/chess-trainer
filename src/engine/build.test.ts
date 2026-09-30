import { describe, expect, it } from 'vitest';
import {
  chooseEngineBuild,
  defaultThreadCount,
  describeEngine,
  ENGINE_BUILD_URLS,
  MAX_ENGINE_THREADS,
} from './build';

describe('defaultThreadCount', () => {
  it('leaves one core for the UI and caps the total', () => {
    expect(defaultThreadCount(undefined)).toBe(1);
    expect(defaultThreadCount(1)).toBe(1);
    expect(defaultThreadCount(2)).toBe(1);
    expect(defaultThreadCount(4)).toBe(3);
    expect(defaultThreadCount(8)).toBe(7);
    expect(defaultThreadCount(64)).toBe(MAX_ENGINE_THREADS);
    expect(defaultThreadCount(Number.NaN)).toBe(1);
  });
});

describe('chooseEngineBuild', () => {
  const ok = { isolated: true, sharedMemory: true, cores: 8 };

  it('uses the single build unless threads are wanted and possible', () => {
    expect(chooseEngineBuild(false, ok)).toEqual({ build: 'single', threads: 1, reason: 'off' });
    expect(chooseEngineBuild(true, { ...ok, isolated: false }).reason).toBe('not-isolated');
    expect(chooseEngineBuild(true, { ...ok, sharedMemory: false }).reason).toBe('no-shared-memory');
    expect(chooseEngineBuild(true, { ...ok, cores: 2 }).reason).toBe('one-core');
    expect(chooseEngineBuild(true, { ...ok, cores: undefined }).build).toBe('single');
  });

  it('picks the threaded build with all but one core', () => {
    expect(chooseEngineBuild(true, ok)).toEqual({ build: 'multi', threads: 7, reason: null });
    expect(chooseEngineBuild(true, { ...ok, cores: 3 })).toEqual({
      build: 'multi',
      threads: 2,
      reason: null,
    });
  });

  it('has a distinct script per build', () => {
    expect(ENGINE_BUILD_URLS.single).not.toBe(ENGINE_BUILD_URLS.multi);
    expect(ENGINE_BUILD_URLS.multi).toMatch(/stockfish-19-lite\.js$/);
    expect(ENGINE_BUILD_URLS.single).toMatch(/stockfish-19-lite-single\.js$/);
  });

  it('describes the running engine', () => {
    expect(describeEngine('single', 1)).toBe('Stockfish 19 lite');
    expect(describeEngine('multi', 4)).toBe('Stockfish 19 · 4 threads');
    expect(describeEngine('multi', 1)).toBe('Stockfish 19 · 1 thread');
  });
});

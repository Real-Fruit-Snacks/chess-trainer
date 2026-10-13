import { describe, expect, it } from 'vitest';
import {
  chooseEngineBuild,
  defaultThreadCount,
  describeEngine,
  ENGINE_BUILD_URLS,
  ENGINE_WASM_URLS,
  type EngineBuild,
  fallbackBuilds,
  FULL_ENGINE_MB,
  isFullBuild,
  isThreadedBuild,
  MAX_ENGINE_THREADS,
} from './build';

const BUILDS: EngineBuild[] = ['single', 'multi', 'full-single', 'full-multi'];

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

  it('caps phones and tablets at four threads', () => {
    expect(defaultThreadCount(8, true)).toBe(4);
    expect(defaultThreadCount(4, true)).toBe(3);
    expect(
      chooseEngineBuild(true, { isolated: true, sharedMemory: true, cores: 8, mobile: true }),
    ).toEqual({ build: 'multi', threads: 4, reason: null });
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

  it('picks the full builds the same way when the full engine is wanted', () => {
    expect(chooseEngineBuild(true, ok, true)).toEqual({
      build: 'full-multi',
      threads: 7,
      reason: null,
    });
    expect(chooseEngineBuild(false, ok, true)).toEqual({
      build: 'full-single',
      threads: 1,
      reason: 'off',
    });
    expect(chooseEngineBuild(true, { ...ok, isolated: false }, true)).toEqual({
      build: 'full-single',
      threads: 1,
      reason: 'not-isolated',
    });
    expect(chooseEngineBuild(true, { ...ok, cores: 2 }, true).build).toBe('full-single');
  });

  it('has a distinct script and binary per build, side by side', () => {
    expect(new Set(BUILDS.map((b) => ENGINE_BUILD_URLS[b])).size).toBe(4);
    expect(ENGINE_BUILD_URLS.multi).toMatch(/\/engine\/stockfish-19-lite\.js$/);
    expect(ENGINE_BUILD_URLS.single).toMatch(/\/engine\/stockfish-19-lite-single\.js$/);
    expect(ENGINE_BUILD_URLS['full-multi']).toMatch(/\/engine\/stockfish-19\.js$/);
    expect(ENGINE_BUILD_URLS['full-single']).toMatch(/\/engine\/stockfish-19-single\.js$/);
    // The Emscripten glue loads the binary named after itself, from the same folder.
    for (const build of BUILDS) {
      expect(ENGINE_WASM_URLS[build]).toBe(ENGINE_BUILD_URLS[build].replace(/\.js$/, '.wasm'));
    }
  });

  it('knows which builds are threaded and which are full', () => {
    expect(BUILDS.filter(isThreadedBuild)).toEqual(['multi', 'full-multi']);
    expect(BUILDS.filter(isFullBuild)).toEqual(['full-single', 'full-multi']);
    expect(FULL_ENGINE_MB).toBe(99);
  });

  it('falls back from the full engine to lite, and from threads to one', () => {
    expect(fallbackBuilds('full-multi')).toEqual(['multi', 'single']);
    expect(fallbackBuilds('full-single')).toEqual(['single']);
    expect(fallbackBuilds('multi')).toEqual(['single']);
    expect(fallbackBuilds('single')).toEqual([]);
  });

  it('describes the running engine', () => {
    expect(describeEngine('single', 1)).toBe('Stockfish 19 lite');
    expect(describeEngine('multi', 4)).toBe('Stockfish 19 lite · 4 threads');
    expect(describeEngine('multi', 1)).toBe('Stockfish 19 lite · 1 thread');
    expect(describeEngine('full-single', 1)).toBe('Stockfish 19');
    expect(describeEngine('full-multi', 7)).toBe('Stockfish 19 · 7 threads');
  });
});

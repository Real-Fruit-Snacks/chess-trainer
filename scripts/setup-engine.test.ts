// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ENGINE_FILES } from '../src/sw/engineFiles';
import { ENGINE, LITE_BUILDS, versionRecord, writeVersionFile } from './setup-engine.mjs';

const dir = mkdtempSync(join(tmpdir(), 'setup-engine-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('engine version record', () => {
  it('is written when missing — the offline path, where the binaries were put in place by hand', async () => {
    expect(await writeVersionFile(dir)).toBe(true);
    const record = JSON.parse(readFileSync(join(dir, 'version.json'), 'utf8')) as {
      version: string;
      files: { name: string; sha256: string }[];
    };
    expect(record.version).toBe(ENGINE.version);
    expect(record.files.map((f) => f.sha256)).toEqual(ENGINE.files.map((f) => f.sha256));
  });

  it('is left alone when it already says the same, and rewritten when it does not', async () => {
    const path = join(dir, 'version.json');
    const before = statSync(path).mtimeMs;
    expect(await writeVersionFile(dir)).toBe(false);
    expect(statSync(path).mtimeMs).toBe(before);
    writeFileSync(path, '{"version":"18.0.0"}\n');
    expect(await writeVersionFile(dir)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe(versionRecord());
  });
});

describe('the files the app expects', () => {
  it('are the files the setup script installs, build by build', () => {
    const installed = ENGINE.files.map((f) => `${f.build}:${f.name}`).sort();
    const expected = Object.entries(ENGINE_FILES)
      .flatMap(([build, f]) => [`${build}:${f.script}`, `${build}:${f.wasm}`])
      .sort();
    expect(installed).toEqual(expected);
    expect([...LITE_BUILDS].sort()).toEqual(['multi', 'single']);
  });

  it('have the sizes the download progress counts on (when installed)', () => {
    for (const files of Object.values(ENGINE_FILES)) {
      const path = join(process.cwd(), 'public', 'engine', files.wasm);
      if (existsSync(path)) expect(statSync(path).size).toBe(files.wasmBytes);
    }
  });
});

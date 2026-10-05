// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isCurrentMaiaFile,
  isMaiaFilePath,
  MAIA_FILES,
  MAIA_TOTAL_BYTES,
  ORT_VERSION,
} from '../src/sw/maiaFiles';
import { installedRuntimeVersion, MAIA, staleMaiaFiles, versionRecord } from './setup-maia.mjs';

describe('the human-like opponent’s pinned files', () => {
  it('are the files the app expects, checksums included', () => {
    expect(MAIA.model.name).toBe(MAIA_FILES.model.name);
    expect(MAIA.model.sha256).toBe(MAIA_FILES.model.sha256);
    expect(MAIA.runtime.name).toBe(MAIA_FILES.runtime.name);
    expect(MAIA.runtime.sha256).toBe(MAIA_FILES.runtime.sha256);
    expect(MAIA.runtime.version).toBe(ORT_VERSION);
    expect(MAIA_TOTAL_BYTES).toBe(MAIA_FILES.model.bytes + MAIA_FILES.runtime.bytes);
  });

  it('come from a fixed revision of the model, and the runtime version package.json pins', async () => {
    // A commit, not a branch: the file behind the address can never change.
    expect(MAIA.model.url).toMatch(/\/resolve\/[0-9a-f]{40}\/maia3-5m\.fp16\.onnx$/);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['onnxruntime-web']).toBe(ORT_VERSION);
    expect(await installedRuntimeVersion()).toBe(ORT_VERSION);
  });

  it('have the sizes the download counts on (when installed)', () => {
    for (const file of Object.values(MAIA_FILES)) {
      const path = join(process.cwd(), 'public', 'maia', file.name);
      if (existsSync(path)) expect(statSync(path).size).toBe(file.bytes);
    }
    const runtime = join('node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.wasm');
    expect(statSync(runtime).size).toBe(MAIA_FILES.runtime.bytes);
  });

  it('leave nothing else in their folder: an earlier pin’s files, or a half-written download', () => {
    expect(
      staleMaiaFiles([
        'README.md',
        'version.json',
        MAIA.model.name,
        MAIA.runtime.name,
        'ort-1.29.0-simd-threaded.wasm',
        `${MAIA.model.name}.download`,
      ]),
    ).toEqual(['ort-1.29.0-simd-threaded.wasm', `${MAIA.model.name}.download`]);
  });

  it('are recorded with their licences and sources', () => {
    const record = JSON.parse(versionRecord()) as typeof MAIA;
    expect(record.model.license).toBe('AGPL-3.0');
    expect(record.runtime.license).toBe('MIT');
  });
});

describe('the service worker’s view of the files', () => {
  it('knows them by path, and tells this version’s from an older one’s', () => {
    expect(isMaiaFilePath('/chess-trainer/maia/maia3-5m.fp16.onnx')).toBe(true);
    expect(isMaiaFilePath('/maia/ort-1.29.0-simd-threaded.wasm')).toBe(true);
    expect(isMaiaFilePath('/engine/stockfish-19.wasm')).toBe(false);
    expect(isMaiaFilePath('/maia/version.json')).toBe(false);
    expect(isCurrentMaiaFile(`/maia/${MAIA_FILES.runtime.name}`)).toBe(true);
    expect(isCurrentMaiaFile('/maia/ort-1.29.0-simd-threaded.wasm')).toBe(false);
  });
});

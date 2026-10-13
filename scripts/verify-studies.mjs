#!/usr/bin/env node
/**
 * Runs the engine verification of every endgame study line and the duals check (slow:
 * about 5–10 minutes).
 * Wraps `vitest` so the environment flag works the same on every platform.
 *
 * Usage:  node scripts/verify-studies.mjs [--depth 18]
 */
import { spawn } from 'node:child_process';
import { engineInstalled } from './lib/node-engine.mjs';

if (!engineInstalled()) {
  console.error('Engine not installed — run `npm run engine:setup` first.');
  process.exit(1);
}

const args = process.argv.slice(2);
const depth = args.includes('--depth') ? args[args.indexOf('--depth') + 1] : '22';

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'src/features/studies/studies.engine.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, VERIFY_ENGINE: '1', VERIFY_DEPTH: String(depth) },
    shell: process.platform === 'win32',
  },
);
child.on('exit', (code) => process.exit(code ?? 1));

#!/usr/bin/env node
/**
 * Runs the engine verification of every lesson task — every move of every line —
 * with its scripted replies, its refutations and the board's own answers to the
 * other moves (slow: about three hours on one core; `--shard 1/6` checks every
 * sixth lesson, so six shards can run side by side).
 * Wraps `vitest` so the environment flags work the same on every platform.
 *
 * Usage:  node scripts/verify-lessons.mjs [--depth 18] [--shard 1/6]
 */
import { spawn } from 'node:child_process';
import { engineInstalled } from './lib/node-engine.mjs';

if (!engineInstalled()) {
  console.error('Engine not installed — run `npm run engine:setup` first.');
  process.exit(1);
}

const args = process.argv.slice(2);
const depth = args.includes('--depth') ? args[args.indexOf('--depth') + 1] : '18';
const shard = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '1/1';
if (!/^\d+\/\d+$/.test(shard)) {
  console.error('--shard takes the form k/n, e.g. 1/4');
  process.exit(1);
}

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'src/features/learn/lessons/lessons.engine.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, VERIFY_ENGINE: '1', VERIFY_DEPTH: String(depth), VERIFY_SHARD: shard },
    shell: process.platform === 'win32',
  },
);
child.on('exit', (code) => process.exit(code ?? 1));

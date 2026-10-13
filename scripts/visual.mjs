#!/usr/bin/env node
/**
 * `npm run e2e:visual`: the pixel snapshots (e2e/visual.spec.ts), which only run
 * with VISUAL=1. A script rather than `VISUAL=1 playwright …` in package.json, so
 * it works in every shell, Windows' included. Arguments are passed on:
 *
 *   npm run e2e:visual -- --update-snapshots
 */
import { spawn } from 'node:child_process';

const windows = process.platform === 'win32';
const child = spawn(
  windows ? 'npx.cmd' : 'npx',
  ['playwright', 'test', 'visual', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, VISUAL: '1' }, shell: windows },
);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

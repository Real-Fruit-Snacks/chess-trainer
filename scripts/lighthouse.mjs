#!/usr/bin/env node
/**
 * Runs Lighthouse against the production build and fails on regressions.
 *
 * Start a server on the production build first (`npm run preview`), then:
 *
 *   node scripts/lighthouse.mjs                  # audits the pages below
 *   node scripts/lighthouse.mjs --json out.json  # also keeps the raw reports
 *
 * Accessibility, best practices and SEO must stay at or above their floors.
 * The performance score depends heavily on the machine running the audit, so
 * it is reported, and only a serious drop (below PERF_FLOOR) fails the run;
 * the layout-shift and label audits are gated individually because they do
 * not vary with CPU speed.
 */
import { writeFileSync } from 'node:fs';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const BASE = process.env.LIGHTHOUSE_BASE ?? 'http://127.0.0.1:4173';
const PAGES = ['/', '/puzzles', '/play', '/learn', '/settings'];
const FLOORS = { accessibility: 0.95, 'best-practices': 0.9, seo: 0.9 };
const PERF_FLOOR = 0.5;
const CLS_LIMIT = 0.1;
const BINARY_AUDITS = ['label-content-name-mismatch', 'color-contrast', 'errors-in-console'];

const jsonIndex = process.argv.indexOf('--json');
const jsonPath = jsonIndex > -1 ? process.argv[jsonIndex + 1] : null;

const chrome = await launch({
  chromePath: process.env.CHROME_PATH,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});
const failures = [];
const reports = {};
try {
  for (const path of PAGES) {
    const url = `${BASE}${path}`;
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    const lhr = result.lhr;
    reports[path] = lhr;
    const score = (c) => Math.round((lhr.categories[c]?.score ?? 0) * 100);
    const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? 0;
    console.log(
      `${path.padEnd(10)} perf ${String(score('performance')).padStart(3)}  a11y ${score('accessibility')}  best ${score('best-practices')}  seo ${score('seo')}  CLS ${cls.toFixed(3)}  LCP ${lhr.audits['largest-contentful-paint']?.displayValue ?? '?'}`,
    );
    for (const [category, floor] of Object.entries(FLOORS)) {
      const s = lhr.categories[category]?.score ?? 0;
      if (s < floor) failures.push(`${path}: ${category} ${Math.round(s * 100)} < ${floor * 100}`);
    }
    const perf = lhr.categories.performance?.score ?? 0;
    if (perf < PERF_FLOOR)
      failures.push(`${path}: performance ${Math.round(perf * 100)} < ${PERF_FLOOR * 100}`);
    if (cls > CLS_LIMIT)
      failures.push(`${path}: cumulative layout shift ${cls.toFixed(3)} > ${CLS_LIMIT}`);
    for (const id of BINARY_AUDITS) {
      const audit = lhr.audits[id];
      if (audit && audit.score !== null && audit.score < 1) {
        failures.push(`${path}: audit "${id}" failed (${audit.title})`);
      }
    }
  }
} finally {
  await chrome.kill();
}

if (jsonPath) writeFileSync(jsonPath, JSON.stringify(reports));

if (failures.length) {
  console.error(`\nLighthouse regressions:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('\nLighthouse within limits.');

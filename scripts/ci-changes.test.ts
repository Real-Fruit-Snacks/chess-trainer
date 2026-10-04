// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentationOnly } from './ci-changes.mjs';

describe('CI path filter', () => {
  it('lets documentation-only changes skip the heavy jobs', () => {
    expect(documentationOnly(['README.md'])).toBe(true);
    expect(
      documentationOnly(['docs/FEATURES.md', 'docs/screenshots/hero.png', 'CHANGELOG.md']),
    ).toBe(true);
    expect(documentationOnly(['.github/ISSUE_TEMPLATE/bug_report.yml'])).toBe(true);
    expect(documentationOnly(['.github/PULL_REQUEST_TEMPLATE.md', 'public/engine/README.md'])).toBe(
      true,
    );
  });

  it('runs everything for code, config, content and what ships with the site', () => {
    expect(documentationOnly(['README.md', 'src/app/Shell.tsx'])).toBe(false);
    expect(documentationOnly(['package.json'])).toBe(false);
    expect(documentationOnly(['.github/workflows/ci.yml'])).toBe(false);
    expect(documentationOnly(['src/features/learn/lessons/beginner.ts'])).toBe(false);
    // Shipped in dist/ as licence.txt and notices.txt.
    expect(documentationOnly(['LICENSE'])).toBe(false);
    expect(documentationOnly(['THIRD_PARTY_NOTICES.md'])).toBe(false);
  });

  it('treats an empty diff as code, to be safe', () => {
    expect(documentationOnly([])).toBe(false);
  });
});

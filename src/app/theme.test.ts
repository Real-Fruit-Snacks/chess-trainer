import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPieceSet } from '@/components/board/pieceSets';
import { siteConfig } from '@/site.config';
import { applyColorScheme } from './theme';

describe('colour scheme', () => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.append(meta);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('puts the scheme on <html> and tints the browser chrome to match', () => {
    applyColorScheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta.content).toBe(siteConfig.themeColor);
    applyColorScheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta.content).toBe(siteConfig.backgroundColor);
    applyColorScheme('black');
    expect(document.documentElement.dataset.theme).toBe('black');
    expect(meta.content).toBe('#000000');
    applyColorScheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(meta.content).toBe(siteConfig.themeColor);
  });

  it('always names the piece set on <html>, the classic one included', () => {
    const root = document.createElement('html');
    applyPieceSet('pixel', root);
    expect(root.dataset.pieces).toBe('pixel');
    applyPieceSet('classic', root);
    expect(root.dataset.pieces).toBe('classic');
  });
});

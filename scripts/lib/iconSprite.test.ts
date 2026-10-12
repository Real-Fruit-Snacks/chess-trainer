// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, ICONS } from '../../src/components/ui/iconData';
import { ICON_SYMBOL_PREFIX, iconSprite, withIconSprite } from './iconSprite';

describe('the icon sprite', () => {
  const sprite = iconSprite(ICONS);
  const doc = new DOMParser().parseFromString(sprite, 'image/svg+xml');

  it('holds a symbol for every icon, with its path', () => {
    const symbols = [...doc.querySelectorAll('symbol')];
    expect(symbols.map((s) => s.id)).toEqual(ICON_NAMES.map((n) => `${ICON_SYMBOL_PREFIX}${n}`));
    for (const name of ICON_NAMES) {
      const path = doc.getElementById(`${ICON_SYMBOL_PREFIX}${name}`)?.querySelector('path');
      expect(path?.getAttribute('d')).toBe(ICONS[name].d);
      expect(path?.closest('symbol')?.getAttribute('viewBox')).toBe('0 0 24 24');
    }
  });

  it('fills only the filled icons; the rest take the stroke of the svg that uses them', () => {
    for (const name of ICON_NAMES) {
      const path = doc.getElementById(`${ICON_SYMBOL_PREFIX}${name}`)?.querySelector('path');
      if (ICONS[name].fill) {
        expect(path?.getAttribute('fill')).toBe('currentColor');
        expect(path?.getAttribute('stroke')).toBe('none');
      } else {
        expect(path?.hasAttribute('fill')).toBe(false);
        expect(path?.hasAttribute('stroke')).toBe(false);
      }
    }
  });

  it('is hidden from assistive technology and takes no room', () => {
    const svg = doc.documentElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('style')).toContain('position:absolute');
    expect(svg.getAttribute('style')).toContain('width:0');
  });

  it('goes at the start of the body, before the app', () => {
    const html = '<html><head></head><body class="x">\n<div id="root"></div></body></html>';
    const out = withIconSprite(html, '<svg id="sprite"></svg>');
    expect(out.indexOf('<svg id="sprite">')).toBeGreaterThan(out.indexOf('<body class="x">'));
    expect(out.indexOf('<svg id="sprite">')).toBeLessThan(out.indexOf('<div id="root">'));
    expect(() => withIconSprite('<html></html>', '<svg></svg>')).toThrow(/no <body>/);
  });
});

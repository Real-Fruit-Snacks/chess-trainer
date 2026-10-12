import type { IconShape } from '../../src/components/ui/iconData.ts';

/**
 * The app's icons as one inline SVG sprite, for index.html. `<Icon name="x">`
 * draws `<use href="#icon-x">` (src/components/ui/Icon.tsx), so the paths
 * never travel in the start-up JavaScript: the page carries them once, as
 * markup the browser reads before any script runs.
 *
 * A stroked icon takes its stroke from the `<svg>` that uses it (the current
 * text colour, 1.8 wide, round ends); a filled one sets its own fill here.
 */

/** The prefix of every symbol's id, as `<Icon>` writes it. */
export const ICON_SYMBOL_PREFIX = 'icon-';

/** Attribute values never contain markup, but escape them anyway. */
const attribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The sprite: one hidden `<svg>` holding a `<symbol>` per icon. */
export function iconSprite(icons: Readonly<Record<string, IconShape>>): string {
  const symbols = Object.entries(icons).map(([name, icon]) => {
    const paint = icon.fill ? ' fill="currentColor" stroke="none"' : '';
    return `<symbol id="${ICON_SYMBOL_PREFIX}${attribute(name)}" viewBox="0 0 24 24"><path d="${attribute(icon.d)}"${paint}/></symbol>`;
  });
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ' +
    'style="position:absolute;width:0;height:0;overflow:hidden">' +
    symbols.join('') +
    '</svg>'
  );
}

/** Puts the sprite at the start of `<body>`, before the app's root. */
export function withIconSprite(html: string, sprite: string): string {
  const body = /<body[^>]*>/i.exec(html);
  if (!body) throw new Error('index.html: no <body> to put the icon sprite in');
  const at = body.index + body[0].length;
  return `${html.slice(0, at)}\n    ${sprite}${html.slice(at)}`;
}

import type { SVGProps } from 'react';
import type { IconName } from './iconData';

export type { IconName } from './iconData';

/**
 * One of the app's icons (src/components/ui/iconData.ts): simple 24×24 line
 * icons drawn with the current text colour, so they follow the theme and scale
 * with the font. The paths live in the SVG sprite the build puts into
 * index.html (scripts/lib/iconSprite.ts), so none of them weighs on the
 * start-up code; each icon is a `<use>` of its symbol. Every icon is
 * decorative by default (aria-hidden); pass `title` to make one meaningful.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Width and height in pixels (default 20). */
  size?: number;
  /** Accessible name; without it the icon is decorative. */
  title?: string;
}

export function Icon({ name, size = 20, title, className, ...rest }: IconProps) {
  // Stroked by default: a filled icon's symbol sets its own fill and stroke.
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={['icon', `icon--${name}`, className].filter(Boolean).join(' ')}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {/* The symbol's id is the name with this prefix (scripts/lib/iconSprite.ts). */}
      <use href={`#icon-${name}`} />
    </svg>
  );
}

/** Difficulty as one to three stars, with an accessible label. */
export function Stars({ count, max = 3, label }: { count: number; max?: number; label?: string }) {
  return (
    <span
      className="stars"
      role="img"
      aria-label={label ?? `Difficulty ${count} of ${max}`}
      title={label ?? `Difficulty ${count} of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <Icon key={i} name={i < count ? 'star-filled' : 'star'} size={12} />
      ))}
    </span>
  );
}

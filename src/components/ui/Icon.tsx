import type { SVGProps } from 'react';

/**
 * The app's icon set: simple 24×24 line icons drawn with the current text
 * colour, so they follow the theme and scale with the font. Every icon is
 * decorative by default (aria-hidden); pass `title` to make one meaningful.
 */
export type IconName =
  | 'home'
  | 'learn'
  | 'puzzles'
  | 'drills'
  | 'openings'
  | 'play'
  | 'analyze'
  | 'progress'
  | 'games'
  | 'studies'
  | 'classics'
  | 'patterns'
  | 'reference'
  | 'sun'
  | 'moon'
  | 'auto'
  | 'more'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'skip-back'
  | 'skip-forward'
  | 'check'
  | 'circle'
  | 'close'
  | 'plus'
  | 'bookmark'
  | 'bookmark-filled'
  | 'trophy'
  | 'award'
  | 'star'
  | 'star-filled'
  | 'knight'
  | 'arrow-right'
  | 'arrow-left'
  | 'download';

/** Path data per icon; `fill` marks icons drawn as filled shapes. */
const ICONS: Record<IconName, { d: string; fill?: boolean }> = {
  home: { d: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  learn: {
    d: 'M2 5a2 2 0 0 1 2-2h5a3 3 0 0 1 3 3 3 3 0 0 1 3-3h5a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 2 3 3 0 0 0-3-2H3a1 1 0 0 1-1-1zM12 6v14',
  },
  puzzles: {
    d: 'M10 3.5a2 2 0 0 1 4 0V5h3a1 1 0 0 1 1 1v3h1.5a2 2 0 0 1 0 4H18v3a1 1 0 0 1-1 1h-3v1.5a2 2 0 0 1-4 0V17H7a1 1 0 0 1-1-1v-3H4.5a2 2 0 0 1 0-4H6V6a1 1 0 0 1 1-1h3z',
  },
  drills: {
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  },
  openings: { d: 'M4 4h3v16H4zM9 4h3v16H9zM14.5 4.6l2.9-.8 4.1 15.3-2.9.8z' },
  // A pawn: head, collar, bell and plinth.
  play: {
    d: 'M12 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM9.2 9.7h5.6M10.2 9.7c.3 3.5-.8 6.3-2.6 8.3h8.8c-1.8-2-2.9-4.8-2.6-8.3M7.6 18l-1.4 2.6h11.6L16.4 18',
  },
  analyze: { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5' },
  progress: { d: 'M4 4v16h16M8 15l4-5 3 3 5-6' },
  games: {
    d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  },
  studies: {
    d: 'M12 3v4M10 5h4M8 21h8M9 21c-1-2-3-5-3-8a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 3-2 6-3 8',
  },
  classics: { d: 'M3 21h18M5 21v-9M9 21v-9M15 21v-9M19 21v-9M3 11l9-6 9 6z' },
  patterns: { d: 'M3 19h18M4 16l1-9 5 4.5 2-6 2 6 5-4.5 1 9z' },
  reference: {
    d: 'M6 3h13a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM6 17h14M9 3v7l2-1.5 2 1.5V3',
  },
  sun: {
    d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  moon: { d: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z' },
  auto: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3v12a6 6 0 0 0 0-12z' },
  more: {
    d: 'M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    fill: true,
  },
  'chevron-down': { d: 'M6 9l6 6 6-6' },
  'chevron-left': { d: 'M15 6l-6 6 6 6' },
  'chevron-right': { d: 'M9 6l6 6-6 6' },
  'skip-back': { d: 'M18 6l-9 6 9 6zM6 6v12' },
  'skip-forward': { d: 'M6 6l9 6-9 6zM18 6v12' },
  check: { d: 'M5 12.5l4.5 4.5L19 7' },
  circle: { d: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z' },
  close: { d: 'M6 6l12 12M18 6L6 18' },
  plus: { d: 'M12 5v14M5 12h14' },
  bookmark: { d: 'M6 3h12v18l-6-4-6 4z' },
  'bookmark-filled': { d: 'M6 3h12v18l-6-4-6 4z', fill: true },
  trophy: {
    d: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 21h6M10 17h4v4h-4z',
  },
  award: { d: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v5' },
  star: { d: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z' },
  'star-filled': {
    d: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    fill: true,
  },
  // A knight in profile: forehead, ear, muzzle, eye, neck and plinth.
  knight: {
    d: 'M7.6 18c.6-2.2 1.6-3.8 2.4-5.4-1.4 0-2.8-.3-3.8-1-1.3-.8-1.2-2-.2-2.8 1.8-1.6 3.8-2.8 5.8-3.8L13.6 3.2c.8 1.6 1.2 3.2 1.6 4.8 1.2 2.8 1.6 6.4 1.2 10M7.6 18h8.8l1.4 2.6H6.2L7.6 18M11 8.8h.01',
  },
  'arrow-right': { d: 'M4 12h16M13 5l7 7-7 7' },
  'arrow-left': { d: 'M20 12H4M11 5l-7 7 7 7' },
  download: { d: 'M12 4v11M7 10l5 5 5-5M4 19h16' },
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Width and height in pixels (default 20). */
  size?: number;
  /** Accessible name; without it the icon is decorative. */
  title?: string;
}

export function Icon({ name, size = 20, title, className, ...rest }: IconProps) {
  const icon = ICONS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={['icon', `icon--${name}`, className].filter(Boolean).join(' ')}
      fill={icon.fill ? 'currentColor' : 'none'}
      stroke={icon.fill ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={icon.d} />
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

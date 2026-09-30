import type { LongColor } from '@/chess/types';
import { compressText, decompressText } from './shareLink';

/**
 * Compressed share links for things other than games: a repertoire
 * (`/openings#rep=…`) or a Woodpecker set (`/puzzles/woodpecker#wp=…`). The
 * payload is deflated JSON in the URL fragment, so nothing is sent anywhere.
 */
export interface SharedRepertoire {
  kind: 'repertoire';
  name: string;
  color: LongColor;
  pgn: string;
}

export interface SharedWoodpeckerSet {
  kind: 'woodpecker';
  puzzleIds: string[];
  rating: number;
}

export type SharedPayload = SharedRepertoire | SharedWoodpeckerSet;

const KEYS: Record<SharedPayload['kind'], string> = { repertoire: 'rep', woodpecker: 'wp' };

export async function encodeShare(payload: SharedPayload): Promise<string> {
  const { kind, ...rest } = payload;
  return `${KEYS[kind]}=${await compressText(JSON.stringify(rest))}`;
}

function isRepertoire(value: unknown): value is Omit<SharedRepertoire, 'kind'> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    (v.color === 'white' || v.color === 'black') &&
    typeof v.pgn === 'string'
  );
}

function isWoodpecker(value: unknown): value is Omit<SharedWoodpeckerSet, 'kind'> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.puzzleIds) &&
    v.puzzleIds.every((id) => typeof id === 'string') &&
    typeof v.rating === 'number'
  );
}

/** Reads a share fragment (with or without the leading `#`); null when it carries none. */
export async function decodeShare(fragment: string): Promise<SharedPayload | null> {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  try {
    const rep = params.get(KEYS.repertoire);
    if (rep) {
      const value: unknown = JSON.parse(await decompressText(rep));
      return isRepertoire(value)
        ? { kind: 'repertoire', name: value.name, color: value.color, pgn: value.pgn }
        : null;
    }
    const wp = params.get(KEYS.woodpecker);
    if (wp) {
      const value: unknown = JSON.parse(await decompressText(wp));
      return isWoodpecker(value)
        ? { kind: 'woodpecker', puzzleIds: value.puzzleIds, rating: value.rating }
        : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** A full link to `path` (app-relative, e.g. `/openings`) carrying the payload. */
export async function shareUrl(path: string, payload: SharedPayload): Promise<string> {
  const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
  return `${base}${path}#${await encodeShare(payload)}`;
}

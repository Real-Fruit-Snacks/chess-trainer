import type { LongColor } from '@/chess/types';
import { compressText, decompressText, type ShareLinkFailure, ShareLinkError } from './shareLink';

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

/** A shared Woodpecker set carries at most this many puzzles (the app builds sets of 40–200). */
export const MAX_SHARED_WOODPECKER_IDS = 200;
/** A shared repertoire's name is cut here. */
export const MAX_SHARED_NAME_LENGTH = 80;
/** A puzzle id is a short alphanumeric token. */
const PUZZLE_ID = /^[A-Za-z0-9_-]{1,32}$/;

const KEYS: Record<SharedPayload['kind'], string> = { repertoire: 'rep', woodpecker: 'wp' };

export async function encodeShare(payload: SharedPayload): Promise<string> {
  const { kind, ...rest } = payload;
  return `${KEYS[kind]}=${await compressText(JSON.stringify(rest))}`;
}

function readRepertoire(value: unknown): Omit<SharedRepertoire, 'kind'> | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.name !== 'string' ||
    (v.color !== 'white' && v.color !== 'black') ||
    typeof v.pgn !== 'string'
  ) {
    return null;
  }
  return { name: v.name.trim().slice(0, MAX_SHARED_NAME_LENGTH), color: v.color, pgn: v.pgn };
}

function readWoodpecker(value: unknown): Omit<SharedWoodpeckerSet, 'kind'> | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.puzzleIds) || typeof v.rating !== 'number' || !Number.isFinite(v.rating)) {
    return null;
  }
  // Ids are de-duplicated and capped; anything that is not an id is dropped.
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of v.puzzleIds) {
    if (typeof id !== 'string' || !PUZZLE_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_SHARED_WOODPECKER_IDS) break;
  }
  if (ids.length === 0) return null;
  return { puzzleIds: ids, rating: v.rating };
}

export type ShareDecodeResult =
  { ok: true; payload: SharedPayload } | { ok: false; kind: ShareLinkFailure };

/** Reads a share fragment (with or without the leading `#`), saying why when it cannot. */
export async function readShare(fragment: string): Promise<ShareDecodeResult> {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!raw) return { ok: false, kind: 'empty' };
  const params = new URLSearchParams(raw);
  const rep = params.get(KEYS.repertoire);
  const wp = params.get(KEYS.woodpecker);
  if (!rep && !wp) return { ok: false, kind: 'empty' };
  try {
    const value: unknown = JSON.parse(await decompressText(rep ?? wp ?? ''));
    if (rep) {
      const payload = readRepertoire(value);
      return payload
        ? { ok: true, payload: { kind: 'repertoire', ...payload } }
        : { ok: false, kind: 'invalid' };
    }
    const payload = readWoodpecker(value);
    return payload
      ? { ok: true, payload: { kind: 'woodpecker', ...payload } }
      : { ok: false, kind: 'invalid' };
  } catch (error) {
    return { ok: false, kind: error instanceof ShareLinkError ? error.kind : 'invalid' };
  }
}

/** Reads a share fragment (with or without the leading `#`); null when it carries none. */
export async function decodeShare(fragment: string): Promise<SharedPayload | null> {
  const result = await readShare(fragment);
  return result.ok ? result.payload : null;
}

/** A full link to `path` (app-relative, e.g. `/openings`) carrying the payload. */
export async function shareUrl(path: string, payload: SharedPayload): Promise<string> {
  const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
  return `${base}${path}#${await encodeShare(payload)}`;
}

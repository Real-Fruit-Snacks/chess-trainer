/**
 * The kinds of group room, each run by its own module (what a module gives
 * is `GroupKindModule` in group.mjs). A new kind is a module here, its name in
 * shared.mjs's GROUP_KINDS and its options in `groupOptions` there.
 */
import { analysisRoom } from './analysisRoom.mjs';
import { raceRoom } from './raceRoom.mjs';

/** @type {Record<string, import('./group.mjs').GroupKindModule<any>>} */
const KINDS = { race: raceRoom, analysis: analysisRoom };

/**
 * The module that runs a kind of group room; null for anything else.
 * @param {unknown} kind
 * @returns {import('./group.mjs').GroupKindModule<any> | null}
 */
export function groupKind(kind) {
  return typeof kind === 'string' && Object.hasOwn(KINDS, kind) ? (KINDS[kind] ?? null) : null;
}

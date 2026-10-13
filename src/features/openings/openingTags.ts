import { GameTree } from '@/chess/tree';
import { findOpening, loadOpenings } from '@/lib/openings';

/**
 * Converts an opening name from the ECO table into the Lichess puzzle tag
 * ("King's Indian Defense: Classical Variation" → "Kings_Indian_Defense"),
 * so custom repertoires can find the tactics of their openings too.
 */
export function openingNameToTag(name: string): string {
  const family = name.split(':')[0] ?? name;
  return family
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/** The opening tag of a repertoire's main line (null when it never enters a known opening). */
export async function repertoireOpeningTags(pgn: string): Promise<string[]> {
  try {
    const table = await loadOpenings();
    const tree = GameTree.fromPgn(pgn);
    const fens = tree.mainLine().map((n) => n.fen);
    const opening = findOpening(table, fens);
    return opening ? [openingNameToTag(opening.name)] : [];
  } catch {
    return [];
  }
}

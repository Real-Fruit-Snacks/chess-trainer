import type { PieceSet } from '@/store/settings';

export type { PieceSet };

export interface PieceSetInfo {
  label: string;
  /** One line on what the set looks like. */
  hint: string;
  /** The set's author and licence, credited in the picker and the footer. */
  author: string;
  licence: string;
  licenceUrl: string;
}

const CC_BY_NC_SA = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';

/**
 * Every piece set, in the order the pickers show them. All but Classic come from the Lichess
 * repository, unchanged (src/components/board/pieces/README.md has the sources). California,
 * Maestro, Staunty and Cardinal are CC BY-NC-SA 4.0: non-commercial use only.
 */
export const PIECE_SETS: Readonly<Record<PieceSet, PieceSetInfo>> = {
  classic: {
    label: 'Classic',
    hint: 'The figurines most online players know.',
    author: 'Colin M.L. Burnett',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
  merida: {
    label: 'Merida',
    hint: 'Crisp classic figurines from the Merida chess font.',
    author: 'Armando Hernandez Marroquin',
    licence: 'GPL-2.0+',
    licenceUrl: 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html',
  },
  chessnut: {
    label: 'Chessnut',
    hint: 'Clean, modern tournament shapes with firm outlines.',
    author: 'Alexis Luengas',
    licence: 'Apache-2.0',
    licenceUrl: `${import.meta.env.BASE_URL}licence-apache.txt`,
  },
  mpchess: {
    label: 'MPChess',
    hint: 'Bold, solid shapes that stand out on any square.',
    author: 'Maxime Chupin',
    licence: 'GPL-3.0+',
    licenceUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
  },
  celtic: {
    label: 'Celtic',
    hint: 'Refined classic shapes with slate-blue black pieces.',
    author: 'Maurizio Monge',
    licence: 'MIT',
    licenceUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
  },
  california: {
    label: 'California',
    hint: 'A firm outline on every piece, very easy to read.',
    author: 'Jerry S.',
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: CC_BY_NC_SA,
  },
  maestro: {
    label: 'Maestro',
    hint: 'Elegant shaded tournament pieces.',
    author: 'sadsnake1',
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: CC_BY_NC_SA,
  },
  staunty: {
    label: 'Staunty',
    hint: 'Shaded tournament pieces with a soft shadow.',
    author: 'sadsnake1',
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: CC_BY_NC_SA,
  },
  cardinal: {
    label: 'Cardinal',
    hint: 'Crisp shaded figurines with a slight bevel.',
    author: 'sadsnake1',
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: CC_BY_NC_SA,
  },
};

/** Every set, in the order the pickers show them. */
export const PIECE_SET_IDS = Object.keys(PIECE_SETS) as PieceSet[];

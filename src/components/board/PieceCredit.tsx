import { useSettings } from '@/store/settings';
import { PIECE_SETS } from './pieceSets';

/**
 * The credit for the piece set on screen, for the footer: its name, author and licence. Its own
 * chunk, so the start-up code does not carry every set's credit.
 */
export default function PieceCredit() {
  const set = useSettings((s) => s.pieceSet);
  const info = PIECE_SETS[set] ?? PIECE_SETS.classic;
  return (
    <>
      Pieces ({info.label}): {info.author},{' '}
      <a href={info.licenceUrl} target="_blank" rel="noreferrer">
        {info.licence}
      </a>
    </>
  );
}

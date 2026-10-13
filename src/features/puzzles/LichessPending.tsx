import { useOnline } from '@/lib/useOnline';
import { useLichess } from '@/store/lichess';

/**
 * Offline with a Lichess account connected: how many puzzle results wait
 * here, to go to Lichess once the device is back online.
 */
export function LichessPending() {
  const syncing = useLichess((s) => s.account !== null && s.options.puzzles);
  const waiting = useLichess((s) => s.outbox.puzzles.length);
  const online = useOnline();
  if (!syncing || waiting === 0 || online) return null;
  return (
    <p
      className="small muted"
      role="status"
      style={{ margin: '0 0 8px' }}
      data-testid="lichess-pending"
    >
      Offline: {waiting === 1 ? 'one puzzle result waits' : `${waiting} puzzle results wait`} here
      and {waiting === 1 ? 'goes' : 'go'} to Lichess when this device is back online.
    </p>
  );
}

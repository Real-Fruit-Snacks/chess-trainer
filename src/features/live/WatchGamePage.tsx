import { Navigate, useParams } from 'react-router';
import { liveGamePath, seatOf } from './seats';
import { WatchGame } from './WatchGame';

/**
 * /play/watch/:gameId: a game on the relay, watched. A device with a seat in
 * the game goes to its own board instead.
 */
export default function WatchGamePage() {
  const { gameId = '' } = useParams();
  const seat = seatOf(gameId);
  if (seat) return <Navigate to={liveGamePath('relay', gameId, seat.kind)} replace />;
  // A rematch is another game on the same route: its page starts afresh.
  return <WatchGame key={gameId} id={gameId} />;
}

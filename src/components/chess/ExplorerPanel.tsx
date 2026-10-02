import { Button, Card, Segmented } from '@/components/ui';
import type { Fen, Uci } from '@/chess/types';
import { type ExplorerDatabase, formatPercent } from '@/lib/explorer';
import { useExplorer } from '@/lib/useExplorer';
import { useSettings } from '@/store/settings';
import './explorer.css';
import { San } from '@/chess/San';

/**
 * Opening explorer card: what people play in the position and how it goes.
 * Off until the learner opts in (network), with a switch right on the card.
 */
export function ExplorerPanel({
  fen,
  onPlay,
  title = 'Opening explorer',
}: {
  fen: Fen | null;
  /** Called with the move's UCI when a row is clicked; omit for a read-only panel. */
  onPlay?: (uci: Uci) => void;
  title?: string;
}) {
  const enabled = useSettings((s) => s.explorer);
  const database = useSettings((s) => s.explorerDatabase);
  const update = useSettings((s) => s.update);
  const state = useExplorer(fen, enabled, database);

  return (
    <Card data-testid="explorer">
      <div className="row row--between">
        <strong>{title}</strong>
        {enabled ? (
          <Segmented<ExplorerDatabase>
            ariaLabel="Explorer database"
            value={database}
            onChange={(v) => update({ explorerDatabase: v })}
            options={[
              { value: 'masters', label: 'Masters' },
              { value: 'lichess', label: 'Lichess' },
            ]}
          />
        ) : null}
      </div>
      {!enabled ? (
        <div className="row row--between" style={{ marginTop: 8 }}>
          <span className="small muted">
            See what people play here and how it goes for them (Lichess data, uses the network).
          </span>
          <Button size="sm" onClick={() => update({ explorer: true })}>
            Turn on
          </Button>
        </div>
      ) : state.status === 'loading' ? (
        <p className="small muted" style={{ margin: '6px 0 0' }} role="status">
          Looking up…
        </p>
      ) : state.status === 'error' ? (
        <p className="small muted" style={{ margin: '6px 0 0' }} role="status">
          Unavailable: {state.message}
        </p>
      ) : state.status === 'ready' ? (
        state.result.total === 0 ? (
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            No games reach this position in the {database === 'masters' ? 'masters' : 'Lichess'}{' '}
            database.
          </p>
        ) : (
          <>
            <p className="small muted" style={{ margin: '4px 0 8px' }}>
              {state.result.opening
                ? `${state.result.opening.eco} ${state.result.opening.name} · `
                : ''}
              {state.result.total.toLocaleString()} games
            </p>
            <table className="explorer__table">
              <thead>
                <tr>
                  <th scope="col">Move</th>
                  <th scope="col">Games</th>
                  <th scope="col">
                    <span className="sr-only">Result: white wins, draws, black wins</span>
                    <span aria-hidden="true">W / D / B</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.result.moves.map((m) => (
                  <tr key={m.uci}>
                    <td>
                      {onPlay ? (
                        <button
                          type="button"
                          className="explorer__move"
                          onClick={() => onPlay(m.uci)}
                          title={`${m.san}: ${formatPercent(m.score)} for the side to move`}
                        >
                          <San san={m.san} />
                        </button>
                      ) : (
                        <San san={m.san} className="mono" />
                      )}
                    </td>
                    <td className="explorer__games">
                      {m.total.toLocaleString()}
                      <span className="small faint"> · {formatPercent(m.share)}</span>
                    </td>
                    <td>
                      <div
                        className="explorer__bar"
                        role="img"
                        aria-label={`White ${Math.round((m.white / m.total) * 100)} %, draws ${Math.round((m.draws / m.total) * 100)} %, black ${Math.round((m.black / m.total) * 100)} %`}
                      >
                        <span
                          className="explorer__bar-white"
                          style={{ width: `${(m.white / m.total) * 100}%` }}
                        />
                        <span
                          className="explorer__bar-draw"
                          style={{ width: `${(m.draws / m.total) * 100}%` }}
                        />
                        <span
                          className="explorer__bar-black"
                          style={{ width: `${(m.black / m.total) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state.result.topGames.length > 0 ? (
              <ul className="explorer__games-list">
                {state.result.topGames.map((g) => (
                  <li key={g.id} className="small">
                    <a href={`https://lichess.org/${g.id}`} target="_blank" rel="noreferrer">
                      {g.white.name}
                      {g.white.rating ? ` (${g.white.rating})` : ''} – {g.black.name}
                      {g.black.rating ? ` (${g.black.rating})` : ''}
                    </a>
                    <span className="faint">
                      {' '}
                      {g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½'}
                      {g.year ? ` · ${g.year}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )
      ) : null}
    </Card>
  );
}

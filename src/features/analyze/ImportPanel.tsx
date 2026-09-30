import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Alert, Button, Field, Input, Segmented } from '@/components/ui';
import { isValidFen } from '@/chess/helpers';
import type { Fen } from '@/chess/types';
import {
  fetchChessComGames,
  fetchLichessGames,
  ImportError,
  type ImportedGame,
  parsePgnGames,
} from '@/lib/gameImport';
import { useSettings } from '@/store/settings';

type Source = 'paste' | 'lichess' | 'chesscom';

export interface ImportPanelProps {
  onLoadFen: (fen: Fen) => boolean;
  onLoadPgn: (pgn: string) => boolean;
  onDone: () => void;
}

/**
 * The analysis board's import panel: paste FEN/PGN, open a PGN file, or pull
 * recent games from a Lichess or chess.com account. Multi-game input opens a
 * picker instead of guessing which game was meant.
 */
export function ImportPanel({ onLoadFen, onLoadPgn, onDone }: ImportPanelProps) {
  const settings = useSettings();
  const [source, setSource] = useState<Source>('paste');
  const [text, setText] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<ImportedGame[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Prefill the last username per site whenever the source changes.
  useEffect(() => {
    const saved = useSettings.getState();
    setUsername(
      source === 'lichess'
        ? saved.lichessUsername
        : source === 'chesscom'
          ? saved.chesscomUsername
          : '',
    );
    setGames(null);
    setError(null);
  }, [source]);

  const loadGame = (game: ImportedGame) => {
    if (onLoadPgn(game.pgn)) onDone();
    else setError('That game could not be loaded.');
  };

  const loadText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setError(null);
    if (isValidFen(trimmed)) {
      if (onLoadFen(trimmed)) onDone();
      else setError('That FEN could not be loaded.');
      return;
    }
    const parsed = parsePgnGames(trimmed);
    if (parsed.length === 0) {
      setError('Could not read that as a FEN or a PGN. Check the text and try again.');
      return;
    }
    if (parsed.length === 1 && parsed[0]) {
      loadGame(parsed[0]);
      return;
    }
    setGames(parsed);
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      loadText(await file.text());
    } catch {
      setError('Could not read that file.');
    }
  };

  const fetchGames = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setGames(null);
    try {
      const list =
        source === 'lichess'
          ? await fetchLichessGames(username, { max: 30, signal: controller.signal })
          : await fetchChessComGames(username, { max: 30, signal: controller.signal });
      if (controller.signal.aborted) return;
      settings.update(
        source === 'lichess'
          ? { lichessUsername: username.trim() }
          : { chesscomUsername: username.trim() },
      );
      setGames(list);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof ImportError ? err.message : 'Something went wrong while fetching games.',
      );
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  return (
    <div className="stack">
      <Segmented
        ariaLabel="Import source"
        value={source}
        onChange={setSource}
        options={[
          { value: 'paste', label: 'Paste / file' },
          { value: 'lichess', label: 'Lichess' },
          { value: 'chesscom', label: 'chess.com' },
        ]}
      />

      {source === 'paste' ? (
        <>
          <Field
            label="Paste a FEN or a PGN"
            hint="Games from Chess Trainer, Lichess or chess.com all work, including variations and comments. A file with several games opens a picker."
          >
            {(id) => (
              <textarea
                id={id}
                className="textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\n\nor\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 …'
                }
                spellCheck={false}
              />
            )}
          </Field>
          <div className="row">
            <Button variant="primary" onClick={() => loadText(text)} disabled={!text.trim()}>
              Load
            </Button>
            <Button onClick={() => fileInput.current?.click()}>Open PGN file…</Button>
            <input
              ref={fileInput}
              type="file"
              accept=".pgn,.txt,application/x-chess-pgn,text/plain"
              className="sr-only"
              aria-label="Open a PGN file"
              onChange={(e) => void openFile(e)}
            />
            <Button variant="ghost" onClick={() => setText('')} disabled={!text}>
              Clear
            </Button>
          </div>
        </>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void fetchGames();
          }}
        >
          <Field label={source === 'lichess' ? 'Lichess username' : 'chess.com username'}>
            {(id) => (
              <Input
                id={id}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!username.trim() || loading}
          >
            Fetch recent games
          </Button>
        </form>
      )}

      {source !== 'paste' ? (
        <p className="small muted" style={{ margin: 0 }}>
          Fetches your last 30 games straight from{' '}
          {source === 'lichess' ? 'lichess.org' : 'chess.com'} (needs a connection). Nothing is
          uploaded anywhere.
        </p>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {games ? (
        <div className="import__games" role="list" aria-label="Games to import">
          {games.map((game) => (
            <button
              type="button"
              key={game.id}
              className="import__game"
              onClick={() => loadGame(game)}
              role="listitem"
            >
              <span className="import__players">
                <strong>{game.white}</strong> – <strong>{game.black}</strong>
              </span>
              <span className="import__meta small muted">
                {game.result} · {Math.ceil(game.plies / 2)} moves
                {game.date ? ` · ${game.date}` : ''}
                {game.event ? ` · ${game.event}` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

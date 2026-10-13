import { useEffect, useMemo, useState } from 'react';
import { parseUci } from '@/chess/helpers';
import type { Fen, Uci } from '@/chess/types';
import type { DrawShape } from '@/components/board/Board';
import type { SearchInfo } from '@/engine/uci';
import { useEngine } from '@/engine/useEngine';
import { useSettings } from '@/store/settings';

/**
 * This device's own engine on a shared analysis board (each device in the room
 * runs its own, and may switch it off): it searches the position shown, from
 * the start through the moves that lead there (so it sees repetitions), as
 * deep and with as many lines as the analysis board's settings say.
 */
export function useRoomEngine({
  startFen,
  moves,
  chess960,
  gameOver,
}: {
  startFen: Fen;
  /** The moves from the start to the position shown, in UCI, space-separated. */
  moves: string;
  chess960: boolean;
  gameOver: boolean;
}) {
  const depth = useSettings((s) => s.analysisDepth);
  const multipv = useSettings((s) => s.analysisLines);
  const { engine, status, error, start } = useEngine({ hashMb: 32 });
  const [on, setOn] = useState(true);
  const [lines, setLines] = useState<Map<number, SearchInfo>>(new Map());
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (!on || status !== 'ready' || gameOver) {
      // Lines from another position would show the wrong sign for this one.
      setLines((before) => (before.size > 0 ? new Map() : before));
      setThinking(false);
      return;
    }
    const client = engine();
    setLines(new Map());
    setThinking(true);
    const collected = new Map<number, SearchInfo>();
    let frame = 0;
    // A stopped search can still deliver a late `info`: once this position is gone, it is ignored.
    let cancelled = false;
    const handle = client.search(
      {
        fen: startFen,
        moves: moves ? moves.split(' ') : [],
        depth,
        multipv,
        ...(chess960 ? { chess960: true } : {}),
      },
      (info) => {
        if (cancelled) return;
        collected.set(info.multipv, info);
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (!cancelled) setLines(new Map(collected));
          });
        }
      },
    );
    handle.result
      .then((result) => {
        if (!cancelled && !result.stopped) {
          setLines(new Map(result.lines));
          setThinking(false);
        }
      })
      .catch(() => {
        // The engine failed mid-search: its status (and Retry) says so.
        if (!cancelled) setThinking(false);
      });
    return () => {
      cancelled = true;
      handle.stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [on, status, startFen, moves, chess960, gameOver, depth, multipv, engine]);

  /** The engine's best move as a pale arrow, under whatever the room has drawn. */
  const best = useMemo<DrawShape[]>(() => {
    const uci: Uci | undefined = lines.get(1)?.pv[0];
    if (!uci || !on) return [];
    const { from, to } = parseUci(uci);
    return [{ orig: from, dest: to, brush: 'paleBlue' }];
  }, [lines, on]);

  return {
    on,
    setOn,
    status,
    error,
    retry: start,
    name: status === 'ready' ? engine().name : 'Stockfish 19',
    lines,
    thinking,
    depth: lines.get(1)?.depth ?? 0,
    nps: lines.get(1)?.nps,
    best,
  };
}

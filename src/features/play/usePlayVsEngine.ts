import type { Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { parseUci, START_FEN, toUci } from '@/chess/helpers';
import type { LongColor, PromotionPiece, Uci } from '@/chess/types';
import { useChess } from '@/chess/useChess';
import { type EngineLevel, getLevel, pickWeighted } from '@/engine/levels';
import { useEngine } from '@/engine/useEngine';
import { pickRandom } from '@/lib/random';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';

export interface GameOver {
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: string;
  /** From the player's perspective. */
  verdict: 'win' | 'loss' | 'draw';
}

export interface UsePlayVsEngine {
  game: ReturnType<typeof useChess>;
  playerColor: LongColor;
  level: EngineLevel;
  engineStatus: ReturnType<typeof useEngine>['status'];
  engineError: Error | null;
  thinking: boolean;
  started: boolean;
  gameOver: GameOver | null;
  hintShapes: DrawShape[];
  hinting: boolean;
  start: (color: LongColor | 'random', levelId: number) => void;
  playerMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  takeBack: () => void;
  resign: () => void;
  hint: () => void;
  flip: () => void;
  orientation: LongColor;
  pgn: () => string;
  retryEngine: () => Promise<void>;
}

const MIN_THINK_MS = 350;

export function usePlayVsEngine(): UsePlayVsEngine {
  const autoQueen = useSettings((s) => s.autoQueen);
  const settings = useSettings();
  const recordGame = useProgress((s) => s.recordGame);

  const game = useChess(START_FEN, { autoQueen });
  const { engine, status: engineStatus, error: engineError, start: startEngine } = useEngine();

  const [playerColor, setPlayerColor] = useState<LongColor>('white');
  const [orientation, setOrientation] = useState<LongColor>('white');
  const [levelId, setLevelId] = useState<number>(settings.playLevel);
  const [started, setStarted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  const [hintShapes, setHintShapes] = useState<DrawShape[]>([]);
  const [hinting, setHinting] = useState(false);

  const level = useMemo(() => getLevel(levelId), [levelId]);
  const appliedSkillRef = useRef<number | null>(null);
  const searchIdRef = useRef(0);
  const recordedRef = useRef(false);
  const gameRef = useRef(game);
  gameRef.current = game;

  const { position } = game;
  const engineColor: LongColor = playerColor === 'white' ? 'black' : 'white';

  // Detect game end.
  useEffect(() => {
    if (!started || gameOver) return;
    if (!position.status.over) return;
    const { result, reason, winner } = position.status;
    const verdict: GameOver['verdict'] = winner
      ? winner === playerColor
        ? 'win'
        : 'loss'
      : 'draw';
    setGameOver({
      result: result === '*' ? '1/2-1/2' : result,
      reason: reason ?? 'game over',
      verdict,
    });
  }, [position.status, started, gameOver, playerColor]);

  // Persist finished games once.
  useEffect(() => {
    if (!gameOver || recordedRef.current) return;
    recordedRef.current = true;
    recordGame({
      level: level.id,
      color: playerColor,
      result: gameOver.result,
      reason: gameOver.reason,
      plies: position.history.length,
      pgn: gameRef.current.pgn(pgnHeaders(playerColor, level, gameOver.result)),
    });
  }, [gameOver, level, playerColor, position.history.length, recordGame]);

  const chooseEngineMove = useCallback(
    async (fen: string, movesUci: Uci[]): Promise<Uci | null> => {
      const client = engine();
      if (appliedSkillRef.current !== level.skill) {
        await client.setOption('Skill Level', level.skill);
        appliedSkillRef.current = level.skill;
      }
      const legal = gameRef.current.position.dests;
      if (level.randomMoveChance > 0 && Math.random() < level.randomMoveChance) {
        const origins = [...legal.keys()];
        const from = pickRandom(origins);
        const to = from ? pickRandom(legal.get(from) ?? []) : undefined;
        if (from && to) {
          const piece = gameRef.current.chess().get(from);
          const promo = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : '';
          return `${from}${to}${promo}`;
        }
      }
      const handle = client.search({
        fen,
        moves: movesUci,
        depth: level.depth,
        movetime: level.movetime,
        multipv: level.multipv,
      });
      const result = await handle.result;
      if (result.stopped) return null;
      if (level.multipv > 1 && result.lines.size > 1) {
        const ranked = [...result.lines.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, info]) => info.pv[0])
          .filter((m): m is Uci => !!m);
        return pickWeighted(ranked) ?? result.bestmove.move;
      }
      return result.bestmove.move;
    },
    [engine, level],
  );

  // Engine moves whenever it is its turn.
  useEffect(() => {
    if (!started || gameOver || position.turn !== engineColor || game.pendingPromotion) return;
    if (engineStatus !== 'ready') return;
    const id = ++searchIdRef.current;
    let cancelled = false;
    setThinking(true);
    const startedAt = Date.now();
    const movesUci = position.history.map((m) => toUci(m));

    void chooseEngineMove(position.startFen, movesUci)
      .then(async (uci) => {
        if (cancelled || id !== searchIdRef.current || !uci) return;
        const wait = Math.max(0, MIN_THINK_MS - (Date.now() - startedAt));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (cancelled || id !== searchIdRef.current) return;
        gameRef.current.playNotation(uci);
      })
      .catch((err: unknown) => console.error('Engine move failed', err))
      .finally(() => {
        if (id === searchIdRef.current) setThinking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    started,
    gameOver,
    position.turn,
    position.history,
    position.startFen,
    engineColor,
    engineStatus,
    chooseEngineMove,
    game.pendingPromotion,
  ]);

  const start = useCallback(
    (color: LongColor | 'random', nextLevelId: number) => {
      engine().stop();
      searchIdRef.current++;
      const chosen: LongColor =
        color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : color;
      setPlayerColor(chosen);
      setOrientation(chosen);
      setLevelId(nextLevelId);
      setGameOver(null);
      setHintShapes([]);
      setThinking(false);
      recordedRef.current = false;
      game.reset(START_FEN);
      void engine()
        .newGame()
        .catch(() => undefined);
      setStarted(true);
      useSettings.getState().update({ playLevel: nextLevelId, playColor: color });
    },
    [engine, game],
  );

  const playerMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (!started || gameOver || position.turn !== playerColor || thinking) return;
      setHintShapes([]);
      game.playMove(from, to, promotion);
    },
    [started, gameOver, position.turn, playerColor, thinking, game],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      game.resolvePromotion(piece);
    },
    [game],
  );

  const takeBack = useCallback(() => {
    if (!started || position.history.length === 0) return;
    engine().stop();
    searchIdRef.current++;
    setThinking(false);
    setHintShapes([]);
    setGameOver(null);
    recordedRef.current = false;
    // Undo back to the player's previous turn.
    if (position.turn === playerColor) {
      game.undo();
      if (gameRef.current.position.history.length > 0) game.undo();
    } else {
      game.undo();
    }
  }, [started, position.history.length, position.turn, playerColor, engine, game]);

  const resign = useCallback(() => {
    if (!started || gameOver) return;
    engine().stop();
    searchIdRef.current++;
    setThinking(false);
    setGameOver({
      result: playerColor === 'white' ? '0-1' : '1-0',
      reason: 'resignation',
      verdict: 'loss',
    });
  }, [started, gameOver, engine, playerColor]);

  const hint = useCallback(() => {
    if (!started || gameOver || position.turn !== playerColor || engineStatus !== 'ready') return;
    setHinting(true);
    const client = engine();
    const movesUci = position.history.map((m) => toUci(m));
    const run = async () => {
      if (appliedSkillRef.current !== 20) {
        await client.setOption('Skill Level', 20);
        appliedSkillRef.current = 20;
      }
      const handle = client.search({
        fen: position.startFen,
        moves: movesUci,
        depth: 14,
        multipv: 1,
      });
      const result = await handle.result;
      if (result.bestmove.move) {
        const { from, to } = parseUci(result.bestmove.move);
        setHintShapes([{ orig: from, dest: to, brush: 'paleBlue' }]);
      }
    };
    void run().finally(() => setHinting(false));
  }, [started, gameOver, position, playerColor, engineStatus, engine]);

  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), []);

  const pgn = useCallback(
    () => game.pgn(pgnHeaders(playerColor, level, gameOver?.result ?? '*')),
    [game, playerColor, level, gameOver],
  );

  return {
    game,
    playerColor,
    level,
    engineStatus,
    engineError,
    thinking,
    started,
    gameOver,
    hintShapes,
    hinting,
    start,
    playerMove,
    resolvePromotion,
    takeBack,
    resign,
    hint,
    flip,
    orientation,
    pgn,
    retryEngine: startEngine,
  };
}

function pgnHeaders(
  playerColor: LongColor,
  level: EngineLevel,
  result: string,
): Record<string, string> {
  const engineName = `Stockfish (level ${level.id} · ${level.name})`;
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    Event: 'Chess Trainer — play vs engine',
    Site: 'Chess Trainer',
    Date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    White: playerColor === 'white' ? 'You' : engineName,
    Black: playerColor === 'black' ? 'You' : engineName,
    Result: result,
  };
}

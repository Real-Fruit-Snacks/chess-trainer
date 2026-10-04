import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { START_FEN } from './helpers';
import { useChess } from './useChess';

const moveSound = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: moveSound }));

/** White to move, a pawn on a7 ready to promote; the kings are far away. */
const PROMOTION = '8/P6k/8/8/8/8/8/K7 w - - 0 1';

describe('useChess', () => {
  it('publishes a snapshot of the starting position', () => {
    const { result } = renderHook(() => useChess());
    const { position } = result.current;
    expect(position.fen).toBe(START_FEN);
    expect(position.turn).toBe('white');
    expect(position.lastMove).toBeNull();
    expect(position.history).toEqual([]);
    expect(position.dests.get('e2')).toEqual(['e3', 'e4']);
  });

  it('plays legal moves, refuses illegal ones and keeps the snapshot in step', () => {
    const { result } = renderHook(() => useChess());
    let played: ReturnType<typeof result.current.playMove> = null;
    act(() => {
      played = result.current.playMove('e2', 'e4');
    });
    expect(played).toMatchObject({ san: 'e4' });
    expect(result.current.position.turn).toBe('black');
    expect(result.current.position.lastMove).toEqual(['e2', 'e4']);
    expect(moveSound).toHaveBeenCalledTimes(1);

    act(() => {
      played = result.current.playMove('e7', 'e2');
    });
    expect(played).toBeNull();
    expect(result.current.position.history).toHaveLength(1);
  });

  it('asks for the promotion piece, and a cancelled promotion leaves the position alone', () => {
    const { result } = renderHook(() => useChess(PROMOTION));
    let outcome: ReturnType<typeof result.current.playMove> = null;
    act(() => {
      outcome = result.current.playMove('a7', 'a8');
    });
    expect(outcome).toBe('promotion');
    expect(result.current.pendingPromotion).toEqual({ from: 'a7', to: 'a8', color: 'white' });

    act(() => {
      expect(result.current.resolvePromotion(null)).toBeNull();
    });
    expect(result.current.pendingPromotion).toBeNull();
    expect(result.current.position.fen).toBe(PROMOTION);

    act(() => {
      result.current.playMove('a7', 'a8');
    });
    act(() => {
      expect(result.current.resolvePromotion('n')).toMatchObject({ san: 'a8=N' });
    });
    expect(result.current.position.fen.split(' ')[0]).toBe('N7/7k/8/8/8/8/8/K7');
  });

  it('promotes to a queen at once with auto-queen on', () => {
    const { result } = renderHook(() => useChess(PROMOTION, { autoQueen: true }));
    act(() => {
      expect(result.current.playMove('a7', 'a8')).toMatchObject({ san: 'a8=Q' });
    });
    expect(result.current.pendingPromotion).toBeNull();
  });

  it('plays typed moves in SAN or UCI, and takes them back', () => {
    const { result } = renderHook(() => useChess());
    act(() => {
      result.current.playNotation('Nf3');
      result.current.playNotation('d7d5');
    });
    expect(result.current.position.history.map((m) => m.san)).toEqual(['Nf3', 'd5']);
    act(() => {
      expect(result.current.playNotation('Qxh7')).toBeNull();
    });
    act(() => {
      expect(result.current.undo()).toMatchObject({ san: 'd5' });
    });
    expect(result.current.position.turn).toBe('black');
  });

  it('repairs a diagram FEN on reset and keeps it as the start', () => {
    const { result } = renderHook(() => useChess());
    // A 4-field FEN from a diagram tool.
    act(() => result.current.reset('4k3/8/8/8/8/8/4P3/4K3 w - -'));
    expect(result.current.position.startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    expect(result.current.position.dests.get('e2')).toEqual(['e3', 'e4']);
  });

  it('loads a PGN, refuses a broken one, and writes PGN with headers', () => {
    const { result } = renderHook(() => useChess());
    act(() => {
      expect(result.current.loadPgn('1. e4 e5 2. Nf3 Nc6 *')).toBe(true);
    });
    expect(result.current.position.history).toHaveLength(4);
    act(() => {
      expect(result.current.loadPgn('1. e4 e5 2. Ke3 Ke6 3. Kxe5 *')).toBe(false);
    });
    expect(result.current.position.history).toHaveLength(4);
    expect(result.current.pgn({ White: 'Learner' })).toContain('[White "Learner"]');
  });
});

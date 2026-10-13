import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { chess960StartFen } from './chess960';
import { START_FEN } from './helpers';
import { useChess960 } from './useChess960';

const moveSound = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: moveSound }));

/** Position 274, BNRKNBRQ: White may castle long at once (the king and rook swap). */
const P274 = chess960StartFen(274);
/** White to move, a pawn on a7 ready to promote; the kings are far away. */
const PROMOTION = '8/P6k/8/8/8/8/8/K7 w - - 0 1';

describe('useChess960', () => {
  it('starts from the classical position', () => {
    const { result } = renderHook(() => useChess960());
    expect(result.current.position.fen).toBe(START_FEN);
    expect(result.current.position.startFen).toBe(START_FEN);
    expect(result.current.position.history).toEqual([]);
    expect(result.current.position.dests.get('e2')).toEqual(['e3', 'e4']);
  });

  it('castles when the king is dropped on its rook, and marks both squares', () => {
    const { result } = renderHook(() => useChess960());
    act(() => result.current.reset(P274));
    expect(result.current.position.dests.get('d1')).toContain('c1');
    let played: ReturnType<typeof result.current.playMove> = null;
    act(() => {
      played = result.current.playMove('d1', 'c1');
    });
    expect(played).toMatchObject({ san: 'O-O-O', uci: 'd1c1', flags: 'q' });
    expect(result.current.position.fen).toBe(
      'bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNKRNBRQ b kq - 1 1',
    );
    expect(result.current.position.lastMove).toEqual(['d1', 'c1']);
    expect(result.current.position.turn).toBe('black');
    expect(moveSound).toHaveBeenLastCalledWith(
      expect.objectContaining({ flags: 'q' }),
      expect.anything(),
    );
    // An illegal move changes nothing.
    act(() => {
      played = result.current.playMove('e8', 'e1');
    });
    expect(played).toBeNull();
    expect(result.current.position.history).toHaveLength(1);
  });

  it('plays engine moves (king takes rook) and typed ones', () => {
    const { result } = renderHook(() => useChess960());
    act(() => result.current.reset(P274));
    act(() => {
      result.current.playNotation('e2e4');
    });
    act(() => {
      result.current.playNotation('d8c8');
    });
    act(() => {
      result.current.playNotation('o-o-o');
    });
    expect(result.current.position.history.map((m) => m.san)).toEqual(['e4', 'O-O-O', 'O-O-O']);
    let refused: ReturnType<typeof result.current.playNotation> = null;
    act(() => {
      refused = result.current.playNotation('O-O');
    });
    expect(refused).toBeNull();
    expect(result.current.position.history).toHaveLength(3);
  });

  it('asks for the promotion piece; a cancelled promotion leaves the position alone', () => {
    const { result } = renderHook(() => useChess960());
    act(() => result.current.reset(PROMOTION));
    let outcome: ReturnType<typeof result.current.playMove> = null;
    act(() => {
      outcome = result.current.playMove('a7', 'a8');
    });
    expect(outcome).toBe('promotion');
    expect(result.current.pendingPromotion).toEqual({ from: 'a7', to: 'a8', color: 'white' });
    act(() => {
      result.current.resolvePromotion(null);
    });
    expect(result.current.pendingPromotion).toBeNull();
    expect(result.current.position.history).toHaveLength(0);

    act(() => {
      result.current.playMove('a7', 'a8');
    });
    let promoted: ReturnType<typeof result.current.resolvePromotion> = null;
    act(() => {
      promoted = result.current.resolvePromotion('n');
    });
    expect(promoted).toMatchObject({ san: 'a8=N', promotion: 'n' });
    expect(result.current.resolvePromotion('q')).toBeNull();
  });

  it('promotes to a queen at once with auto-queen', () => {
    const { result } = renderHook(() => useChess960({ autoQueen: true }));
    act(() => result.current.reset(PROMOTION));
    act(() => {
      result.current.playMove('a7', 'a8');
    });
    expect(result.current.pendingPromotion).toBeNull();
    expect(result.current.position.history[0]?.san).toBe('a8=Q');
    act(() => {
      result.current.playNotation('h7g6');
    });
    act(() => {
      result.current.reset(PROMOTION);
    });
    act(() => {
      result.current.playNotation('a8');
    });
    expect(result.current.position.history[0]?.san).toBe('a8=Q');
  });

  it('takes moves back, reports the end of the game and writes the PGN', () => {
    const { result } = renderHook(() => useChess960());
    act(() => result.current.reset('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'));
    act(() => {
      result.current.playNotation('Ra8');
    });
    expect(result.current.position.status).toMatchObject({ over: true, reason: 'checkmate' });
    expect(result.current.position.checkedKing).toBe('g8');
    expect(result.current.pgn({ Result: '1-0' })).toContain('[Variant "Chess960"]');
    expect(result.current.pgn({ Result: '1-0' })).toMatch(/1\. Ra8# 1-0$/);
    act(() => {
      result.current.undo();
    });
    expect(result.current.position.history).toHaveLength(0);
    expect(result.current.position.status.over).toBe(false);
    expect(result.current.game().fen()).toBe('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  });

  it('falls back to the classical start for a position that is none', () => {
    const { result } = renderHook(() => useChess960());
    act(() => result.current.reset('not a position'));
    expect(result.current.position.fen).toBe(START_FEN);
  });
});

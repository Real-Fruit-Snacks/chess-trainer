import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonStep } from './model';
import { type LessonMessage, type StepResult, useLessonStep } from './useLessonStep';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

/** White rook on d4: the task is Rh4. The step's own arrow points at the answer. */
const rookStep: LessonStep = {
  title: 'The rook',
  text: 'Rooks move along ranks and files.',
  fen: '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1',
  shapes: ['d4h4'],
  task: { prompt: 'Move the rook to h4.', moves: ['Rh4'], hint: 'Along the rank.' },
};

/** A task with a scripted reply: Qxg4+ is answered by hxg4. */
const replyStep: LessonStep = {
  text: 'Trade queens.',
  fen: '4r1k1/pb3p2/1p6/7p/N5q1/2N5/PP3PPP/3QR1K1 w - - 0 1',
  task: { prompt: 'Trade queens.', moves: ['Qxg4+'], reply: 'hxg4' },
};

/** A fork as a line: Nf6+, the king steps away, Nxd5+ collects the rook. */
const forkStep: LessonStep = {
  text: 'The knight can check and hit the rook at once.',
  fen: '4k3/p6p/8/3r4/4N3/8/P6P/4K3 w - - 0 1',
  shapes: ['e4f6'],
  task: {
    prompt: 'Fork the king and the rook.',
    moves: ['Nf6+'],
    success: 'Check, and the rook is attacked.',
    why: 'The check comes first, so the rook cannot be saved.',
    wrong: { Nc5: { text: 'That attacks nothing that matters.', refute: 'Rxc5' } },
    failure: 'Look for a knight check.',
    reply: 'Ke7',
    replyNote: 'The king steps out of check.',
    then: { prompt: 'Collect the rook.', moves: ['Nxd5+'], success: 'A whole rook up.' },
  },
};

const texts = (messages: LessonMessage[]) =>
  messages.map((m) =>
    m.kind === 'move' ? `${m.who}:${m.san}${m.wrong ? '?' : ''}` : `${m.tone}:${m.text}`,
  );

describe('useLessonStep', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens with the question, and reports a shown answer as revealed, at once', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result } = renderHook(() => useLessonStep(rookStep, onSolved));
    expect(texts(result.current.messages)).toEqual(['prompt:Move the rook to h4.']);
    expect(result.current.activePrompt).toBe(0);
    expect(result.current.canReveal).toBe(true);

    // A quiet wrong move the board says nothing about: the coach's fallback, then it is taken back.
    act(() => result.current.playMove('d4', 'a4'));
    expect(result.current.phase).toBe('wrong');
    expect(result.current.highlights.get('a4')).toBe('wrong');
    expect(texts(result.current.messages).slice(1)).toEqual([
      'you:Ra4?',
      'wrong:Not this one. Look at the position again.',
    ]);
    // While the wrong move is being taken back, "Show answer" does nothing.
    expect(result.current.canReveal).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.phase).toBe('wrong');
    expect(onSolved).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe('awaiting');
    act(() => result.current.reveal());
    // Reported in the same call, not an effect later: a caller can grade on the spot.
    expect(onSolved).toHaveBeenCalledTimes(1);
    expect(onSolved).toHaveBeenCalledWith({ revealed: true, mistakes: 1, hinted: false });
    expect(result.current.phase).toBe('revealed');
    expect(result.current.done).toBe(true);
    expect(result.current.canReveal).toBe(false);
    expect(result.current.activePrompt).toBeNull();
    expect([...result.current.highlights.keys()]).not.toContain('a4');
    expect(result.current.lastMove).toEqual(['d4', 'h4']);
    expect(texts(result.current.messages).at(-1)).toBe('answer:Here is the move: Rh4.');
  });

  it('answers a move the lesson does not list from the board, and shows the punishment', () => {
    const { result } = renderHook(() => useLessonStep(rookStep, vi.fn()));
    act(() => result.current.playMove('d4', 'd8'));
    expect(texts(result.current.messages).slice(1)).toEqual(['you:Rd8+?']);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current.phase).toBe('refuted');
    expect(result.current.canTakeBack).toBe(true);
    expect(result.current.lastMove).toEqual(['e8', 'd8']);
    expect(result.current.shapes).toContainEqual({ orig: 'e8', dest: 'd8', brush: 'red' });
    // The punishing reply, then the coach's words about it.
    expect(texts(result.current.messages).slice(1)).toEqual([
      'you:Rd8+?',
      'them:Kxd8',
      'wrong:The rook is unprotected on d8: Black simply takes it with Kxd8.',
    ]);
    // It stays until taken back.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.phase).toBe('refuted');
    act(() => result.current.takeBack());
    expect(result.current.phase).toBe('awaiting');
    expect(result.current.fen).toBe(rookStep.fen);
    expect(result.current.lastMove).toBeNull();
    expect(result.current.shapes).not.toContainEqual({ orig: 'e8', dest: 'd8', brush: 'red' });
  });

  it('walks a line: the coach on each move, then the reply and the next question when the learner goes on', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result } = renderHook(() => useLessonStep(forkStep, onSolved));
    // A tempting wrong move gets the coach's own answer, and its refutation.
    act(() => result.current.playMove('e4', 'c5'));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(texts(result.current.messages).slice(1)).toEqual([
      'you:Nc5?',
      'them:Rxc5',
      'wrong:That attacks nothing that matters.',
    ]);
    act(() => result.current.takeBack());

    act(() => result.current.playMove('e4', 'f6'));
    expect(result.current.phase).toBe('explained');
    expect(result.current.canPlayOn).toBe(true);
    expect(result.current.activePrompt).toBeNull();
    expect(texts(result.current.messages).slice(-3)).toEqual([
      'you:Nf6+',
      'good:Check, and the rook is attacked.',
      'why:The check comes first, so the rook cannot be saved.',
    ]);
    // Nothing moves on by itself: the words stay up for as long as they take to read.
    const explained = result.current.messages;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.phase).toBe('explained');
    expect(result.current.messages).toBe(explained);
    expect(result.current.lastMove).toEqual(['e4', 'f6']);
    // The board waits too.
    expect(result.current.dests.size).toBe(0);

    act(() => result.current.playOn());
    expect(result.current.phase).toBe('awaiting');
    expect(result.current.canPlayOn).toBe(false);
    expect(result.current.lastMove).toEqual(['e8', 'e7']);
    expect(texts(result.current.messages).slice(-3)).toEqual([
      'them:Ke7',
      'note:The king steps out of check.',
      'prompt:Collect the rook.',
    ]);
    const question = result.current.messages.at(-1);
    expect(result.current.activePrompt).toBe(question?.id);
    // The step's arrows belong to its diagram: gone once the line moves on.
    expect(result.current.shapes).toEqual([]);
    expect(onSolved).not.toHaveBeenCalled();

    act(() => result.current.playMove('f6', 'd5'));
    expect(result.current.phase).toBe('correct');
    expect(onSolved).toHaveBeenCalledTimes(1);
    expect(onSolved).toHaveBeenCalledWith({ revealed: false, mistakes: 1, hinted: false });
    expect(texts(result.current.messages).slice(-2)).toEqual([
      'you:Nxd5+',
      'good:A whole rook up.',
    ]);
  });

  it('numbers the turns: each move, shown answer or going on starts one, a hint joins it', () => {
    const { result } = renderHook(() => useLessonStep(forkStep, vi.fn()));
    act(() => result.current.playMove('e4', 'c5'));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    act(() => result.current.takeBack());
    act(() => result.current.playMove('e4', 'f6'));
    act(() => result.current.playOn());
    act(() => result.current.reveal());
    const turns = (messages: LessonMessage[]) => messages.map((m) => `${m.turn} ${texts([m])[0]}`);
    expect(turns(result.current.messages)).toEqual([
      '0 prompt:Fork the king and the rook.',
      // The punishing reply and the coach's words answer the wrong move: the same turn.
      '1 you:Nc5?',
      '1 them:Rxc5',
      '1 wrong:That attacks nothing that matters.',
      '2 you:Nf6+',
      '2 good:Check, and the rook is attacked.',
      '2 why:The check comes first, so the rook cannot be saved.',
      '3 them:Ke7',
      '3 note:The king steps out of check.',
      '3 prompt:Collect the rook.',
      '4 answer:Here is the move: Nxd5+.',
      '4 good:A whole rook up.',
    ]);

    const opening = renderHook(() => useLessonStep(rookStep, vi.fn())).result;
    act(() => opening.current.hint());
    expect(opening.current.messages.at(-1)).toMatchObject({ tone: 'hint', turn: 0 });

    const later = renderHook(() => useLessonStep(rookStep, vi.fn())).result;
    act(() => later.current.playMove('d4', 'a4'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => later.current.hint());
    expect(later.current.messages.at(-1)).toMatchObject({ tone: 'hint', turn: 1 });
  });

  it('shows an answer in a line and waits there too before the reply', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result } = renderHook(() => useLessonStep(forkStep, onSolved));
    act(() => result.current.reveal());
    expect(texts(result.current.messages).slice(-3)).toEqual([
      'answer:Here is the move: Nf6+.',
      'good:Check, and the rook is attacked.',
      'why:The check comes first, so the rook cannot be saved.',
    ]);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.phase).toBe('explained');
    act(() => result.current.playOn());
    expect(result.current.phase).toBe('awaiting');
    act(() => result.current.playMove('f6', 'd5'));
    expect(result.current.phase).toBe('revealed');
    expect(onSolved).toHaveBeenCalledWith({ revealed: true, mistakes: 0, hinted: false });
  });

  it('shows the hint marks on their own: the piece, then the move, with the words once', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result } = renderHook(() => useLessonStep(rookStep, onSolved));
    expect(result.current.hintShapes).toEqual([]);
    expect(result.current.shapes).toEqual([{ orig: 'd4', dest: 'h4', brush: 'green' }]);

    act(() => result.current.hint());
    expect(result.current.hintShapes).toEqual([{ orig: 'd4', brush: 'yellow' }]);
    expect(texts(result.current.messages).at(-1)).toBe('hint:Along the rank.');
    act(() => result.current.hint());
    expect(result.current.hintShapes).toEqual([{ orig: 'd4', dest: 'h4', brush: 'yellow' }]);
    expect(result.current.shapes).toHaveLength(2);
    expect(
      result.current.messages.filter((m) => m.kind === 'coach' && m.tone === 'hint'),
    ).toHaveLength(1);

    act(() => result.current.playMove('d4', 'h4'));
    expect(onSolved).toHaveBeenCalledWith({ revealed: false, mistakes: 0, hinted: true });
    expect(result.current.hintShapes).toEqual([]);
  });

  it('ends a line on a reply once the learner goes on, and only once', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result } = renderHook(() => useLessonStep(replyStep, onSolved));
    act(() => result.current.playMove('d1', 'g4'));
    expect(result.current.phase).toBe('explained');
    // Nothing to show or hint at once the right move is in.
    act(() => result.current.reveal());
    act(() => result.current.hint());
    expect(result.current.phase).toBe('explained');
    expect(onSolved).not.toHaveBeenCalled();

    // A double press plays the reply once.
    act(() => {
      result.current.playOn();
      result.current.playOn();
    });
    expect(result.current.phase).toBe('correct');
    expect(texts(result.current.messages).filter((t) => t.startsWith('them:'))).toEqual([
      'them:hxg4',
    ]);
    expect(onSolved).toHaveBeenCalledTimes(1);
    expect(onSolved).toHaveBeenCalledWith({ revealed: false, mistakes: 0, hinted: false });
    // Going on does nothing more.
    act(() => result.current.playOn());
    expect(onSolved).toHaveBeenCalledTimes(1);
  });

  it('starts the count again on Replay and on a new step', () => {
    const onSolved = vi.fn<(result: StepResult) => void>();
    const { result, rerender } = renderHook(({ step }) => useLessonStep(step, onSolved), {
      initialProps: { step: rookStep },
    });
    act(() => result.current.playMove('d4', 'a4'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => result.current.retry());
    expect(texts(result.current.messages)).toEqual(['prompt:Move the rook to h4.']);
    act(() => result.current.playMove('d4', 'h4'));
    expect(onSolved).toHaveBeenLastCalledWith({ revealed: false, mistakes: 0, hinted: false });

    rerender({ step: { ...rookStep } });
    act(() => result.current.hint());
    act(() => result.current.playMove('d4', 'h4'));
    expect(onSolved).toHaveBeenLastCalledWith({ revealed: false, mistakes: 0, hinted: true });
  });

  it('forgets a reply left waiting on Replay', () => {
    const { result } = renderHook(() => useLessonStep(forkStep, vi.fn()));
    act(() => result.current.playMove('e4', 'f6'));
    expect(result.current.canPlayOn).toBe(true);
    act(() => result.current.retry());
    expect(result.current.phase).toBe('awaiting');
    act(() => result.current.playOn());
    expect(result.current.phase).toBe('awaiting');
    expect(result.current.fen).toBe(forkStep.fen);
    expect(texts(result.current.messages)).toEqual(['prompt:Fork the king and the rook.']);
  });
});

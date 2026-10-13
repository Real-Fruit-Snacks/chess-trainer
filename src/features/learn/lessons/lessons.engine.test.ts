/**
 * Engine verification of every lesson task. Slow, so it only runs when asked:
 *
 *   VERIFY_ENGINE=1 npx vitest run src/features/learn/lessons/lessons.engine.test.ts
 *
 * For each task the accepted moves must be (close to) the engine's best move:
 * a mate task must be mate, a task in a decisively won position must keep a
 * clear win, and otherwise the accepted move may not give away more than
 * TOLERANCE_CP compared with the best move. A scripted reply may not lose more
 * than REPLY_TOLERANCE_CP against the opponent's best answer — a reply that
 * walks into a quicker loss teaches the wrong defence — unless it is listed in
 * REPLY_ALLOW_LIST and the step's text says the defence was not the best. When
 * the best defence is lost anyway (LOST_CP), only a reply that walks into a
 * forced mate the best defence avoids fails.
 *
 * Every task of a step's line is checked so, at its position. A wrong move the
 * coach answers with a refutation must deserve it: the refuting reply must be
 * (close to) the opponent's best answer, and leave the learner clearly worse
 * off (REFUTED_CP) than the move the task asks for.
 *
 * The lines quoted in the prose (legality, and "mate" claims) are replayed by the
 * structural test in lessons.test.ts, which needs no engine and runs in CI.
 */
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeEngine } from '../../../../scripts/lib/node-engine.mjs';
import { explainWrongMove } from '../explainWrongMove';
import { judgeTaskMove, wrongMoveAnswer } from '../taskCheck';
import { lessons } from './index';
import { linePositions } from './quotedLines';

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const ENABLED = !!env.VERIFY_ENGINE;
const DEPTH = Number(env.VERIFY_DEPTH ?? 18);
/**
 * `VERIFY_SHARD=2/4` checks only every fourth lesson, starting from the second: the
 * Content workflow runs the shards side by side.
 */
const [SHARD, SHARDS] = (env.VERIFY_SHARD ?? '1/1').split('/').map(Number) as [number, number];
const checked = lessons.filter((_, index) => index % SHARDS === SHARD - 1);
const TOLERANCE_CP = 80;
/** Above this the position is decisively won; any move that keeps a clear win is fine for a lesson. */
const DECISIVE_CP = 300;
/** How much worse than the best defence a scripted reply may be. */
const REPLY_TOLERANCE_CP = 300;
/**
 * At or below this (for the side replying) the game is lost whatever it plays. The
 * gap between two losing replies is noise — it swings with the depth — so then
 * only walking into a forced mate the best defence avoids counts.
 */
const LOST_CP = 600;
/** Scores at or below this, from a side's own view, are forced mates against it. */
const MATED = -9_000;
/** How much worse than the task's move a refuted wrong move must leave the learner. */
const REFUTED_CP = 100;
/** How far from the opponent's best answer a refutation may be. */
const REFUTE_TOLERANCE_CP = 150;
/**
 * Depth for the board's own answers to the moves a lesson does not list (a
 * piece left to be taken, a mate allowed): many per task, each a plain
 * material or mating point, so a shallower search serves.
 */
const AUTO_DEPTH = Math.min(DEPTH, 12);

/**
 * Scripted replies that are knowingly not the best defence, as "lessonId step N"
 * (1-based), with the reason. The step's success text must say so.
 */
const REPLY_ALLOW_LIST = new Map<string, string>([
  [
    'attacking-the-king step 2 move 2',
    'The classic Greek-gift retreat Kg8; the text names Kg6 as the toughest defence.',
  ],
  [
    'rook-endgames step 1',
    'The classic Lucena defence: the rook goes to the first rank to check from the side. Sturdier king moves exist, and the text says so, but Black is lost whatever it plays.',
  ],
  [
    'opening-traps step 2',
    'Légal’s trap: Black takes the queen with Bxd1; the replyNote names dxe5 as the safer reply.',
  ],
  [
    'opening-traps step 3',
    'The Blackburne Shilling trap: White grabs on f7; the replyNote names O-O as the calmer reply.',
  ],
  [
    'opening-traps step 3 move 3',
    'The Blackburne Shilling trap: White blocks with Be2 and is mated; the replyNote says the other block loses the queen.',
  ],
]);

interface Score {
  type: 'cp' | 'mate';
  value: number;
}

/** Score from the point of view of the side to move in the analysed position. */
function sideToMoveScore(score: Score): number {
  if (score.type === 'mate') {
    return score.value > 0 ? 10_000 - score.value : -10_000 - score.value;
  }
  return score.value;
}

/** Score from the point of view of the side that just moved into `fen`. */
function moverScore(score: Score): number {
  return -sideToMoveScore(score);
}

/** What the scripted reply gives away against the best defence, from the defender's view. */
function replyLoss(bestDefence: number, scripted: number): number {
  if (bestDefence > -LOST_CP) return bestDefence - scripted;
  return scripted <= MATED && bestDefence > MATED ? Infinity : 0;
}

describe.skipIf(!ENABLED)('lesson tasks agree with the engine', () => {
  let engine: NodeEngine;
  beforeAll(async () => {
    engine = new NodeEngine();
    await engine.init({ hashMb: 64 });
  }, 60_000);
  afterAll(() => engine?.quit());

  /** Score for the side that just moved into `fen`. */
  const evaluate = async (fen: string, depth = DEPTH) => {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) return 10_000;
    if (chess.isGameOver()) return 0;
    const { lines } = await engine.analyse(fen, { depth });
    const score = lines.get(1)?.score;
    if (!score) throw new Error(`No score for ${fen}`);
    return moverScore(score);
  };

  for (const lesson of checked) {
    for (const [index, step] of lesson.steps.entries()) {
      linePositions(step).forEach(({ task, fen }, at) => {
        const label = `${lesson.id} step ${index + 1}${at > 0 ? ` move ${at + 1}` : ''}`;
        it(`${label}: ${task.moves.join(' / ')}`, async () => {
          const scored = async (san: string) => {
            const chess = new Chess(fen);
            chess.move(san);
            return evaluate(chess.fen());
          };
          // Engine's own best move from the task position.
          const chess = new Chess(fen);
          const { bestmove } = await engine.analyse(fen, { depth: DEPTH });
          const best = chess.move({
            from: bestmove.slice(0, 2),
            to: bestmove.slice(2, 4),
            promotion: bestmove[4],
          });
          const bestScore = await evaluate(chess.fen());
          for (const san of task.moves) {
            if (task.acceptAnyMate) {
              const probe = new Chess(fen);
              probe.move(san);
              expect(probe.isCheckmate(), `${san} should be mate`).toBe(true);
              continue;
            }
            const score = await scored(san);
            const message = `${label}: ${san} scores ${score} but ${best.san} scores ${bestScore}`;
            if (bestScore >= DECISIVE_CP) {
              // Clearly winning: the accepted move must keep a clear win (lessons often teach technique, not the fastest win).
              expect(score, message).toBeGreaterThan(200);
            } else {
              expect(score, message).toBeGreaterThanOrEqual(bestScore - TOLERANCE_CP);
            }
          }
        }, 300_000);

        const reply = task.reply;
        const first = task.moves[0];
        if (reply && first) {
          it(`${label}: the scripted reply ${reply} is a fair defence`, async () => {
            const chess = new Chess(fen);
            chess.move(first);
            const before = chess.fen();
            const { lines } = await engine.analyse(before, { depth: DEPTH });
            const top = lines.get(1)?.score;
            if (!top) throw new Error(`No score for ${before}`);
            // The replier's best, from the replier's side; then what the scripted reply keeps.
            const bestDefence = sideToMoveScore(top);
            chess.move(reply);
            const scripted = await evaluate(chess.fen());
            const loss = replyLoss(bestDefence, scripted);
            if (REPLY_ALLOW_LIST.has(label)) return;
            expect(
              loss,
              `${label}: ${reply} scores ${scripted} for the defender, the best defence ${bestDefence}`,
            ).toBeLessThanOrEqual(REPLY_TOLERANCE_CP);
          }, 300_000);
        }

        if (first) {
          it(`${label}: the board's answers to the other moves hold up`, async () => {
            // The opponent's score after the move the task asks for.
            const probe = new Chess(fen);
            probe.move(first);
            const right = -(await evaluate(probe.fen(), AUTO_DEPTH));
            const failures: string[] = [];
            for (const move of new Chess(fen).moves({ verbose: true })) {
              const played = new Chess(fen);
              played.move(move.san);
              if (judgeTaskMove(task, move, played) === 'correct') continue;
              if (wrongMoveAnswer(task, move.san)) continue;
              const refute = explainWrongMove(fen, move.san)?.refute;
              if (!refute) continue;
              const { lines } = await engine.analyse(played.fen(), { depth: AUTO_DEPTH });
              const top = lines.get(1)?.score;
              if (!top) throw new Error(`No score for ${played.fen()}`);
              const best = sideToMoveScore(top);
              played.move(refute);
              const refuted = await evaluate(played.fen(), AUTO_DEPTH);
              // Near the opponent's best answer, or at least clearly better for the opponent
              // than the move the task asks for: either way the punishment shown is real.
              const nearBest = replyLoss(best, refuted) <= REFUTE_TOLERANCE_CP;
              const punishes = refuted >= right + REFUTED_CP;
              if (!nearBest && !punishes) {
                failures.push(
                  `${move.san} ${refute}: ${refuted} for the opponent, best answer ${best}, after ${first} ${right}`,
                );
              }
            }
            expect(failures, `${label}: answer these moves in the task's "wrong"`).toEqual([]);
          }, 600_000);
        }

        for (const [wrong, answer] of Object.entries(task.wrong ?? {})) {
          const refute = typeof answer === 'string' ? undefined : answer.refute;
          if (!refute || !first) continue;
          it(`${label}: ${wrong} is refuted by ${refute}`, async () => {
            const chess = new Chess(fen);
            chess.move(wrong);
            const afterWrong = chess.fen();
            const { lines } = await engine.analyse(afterWrong, { depth: DEPTH });
            const top = lines.get(1)?.score;
            if (!top) throw new Error(`No score for ${afterWrong}`);
            // The opponent's best answer to the wrong move, and what the refutation keeps of it.
            const bestAnswer = sideToMoveScore(top);
            chess.move(refute);
            const refuted = await evaluate(chess.fen());
            const answerGap = replyLoss(bestAnswer, refuted);
            expect(
              answerGap,
              `${label}: ${refute} scores ${refuted} for the opponent, the best answer ${bestAnswer}`,
            ).toBeLessThanOrEqual(REFUTE_TOLERANCE_CP);
            // From the learner's side: the wrong move, refuted, against the task's move.
            const probe = new Chess(fen);
            probe.move(first);
            const right = await evaluate(probe.fen());
            const learner = -refuted;
            expect(
              learner,
              `${label}: after ${wrong} ${refute} the learner has ${learner}, after ${first} ${right}`,
            ).toBeLessThanOrEqual(right - REFUTED_CP);
          }, 300_000);
        }
      });
    }
  }
});

describe('the scripted-reply rule', () => {
  it('measures the gap while the defence still matters', () => {
    expect(replyLoss(0, -250)).toBe(250);
    expect(replyLoss(-350, -2_000)).toBe(1_650);
    expect(replyLoss(120, 200)).toBe(-80);
  });

  it('ignores the gap between two lost replies, but not a walk into mate', () => {
    expect(replyLoss(-755, -1_182)).toBe(0);
    expect(replyLoss(-1_200, -9_993)).toBe(Infinity);
    expect(replyLoss(-9_990, -9_995)).toBe(0);
  });
});

describe('the scripted-reply allow-list', () => {
  it('names only steps that still have a scripted reply', () => {
    for (const key of REPLY_ALLOW_LIST.keys()) {
      const [id, , n] = key.split(' ');
      const step = lessons.find((l) => l.id === id)?.steps[Number(n) - 1];
      expect(step?.task?.reply, key).toBeDefined();
    }
  });
});

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
 * The lines quoted in the prose (legality, and "mate" claims) are replayed by the
 * structural test in lessons.test.ts, which needs no engine and runs in CI.
 */
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeEngine } from '../../../../scripts/lib/node-engine.mjs';
import { lessons } from './index';

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const ENABLED = !!env.VERIFY_ENGINE;
const DEPTH = Number(env.VERIFY_DEPTH ?? 18);
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

/**
 * Scripted replies that are knowingly not the best defence, as "lessonId step N"
 * (1-based), with the reason. The step's success text must say so.
 */
const REPLY_ALLOW_LIST = new Map<string, string>([
  [
    'attacking-the-king step 3',
    'The classic Greek-gift retreat Kg8; the text names Kg6 as the toughest defence.',
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
  const evaluate = async (fen: string) => {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) return 10_000;
    if (chess.isGameOver()) return 0;
    const { lines } = await engine.analyse(fen, { depth: DEPTH });
    const score = lines.get(1)?.score;
    if (!score) throw new Error(`No score for ${fen}`);
    return moverScore(score);
  };

  for (const lesson of lessons) {
    for (const [index, step] of lesson.steps.entries()) {
      const task = step.task;
      if (!task) continue;
      const label = `${lesson.id} step ${index + 1}`;
      it(`${label}: ${task.moves.join(' / ')}`, async () => {
        const scored = async (san: string) => {
          const chess = new Chess(step.fen);
          chess.move(san);
          return evaluate(chess.fen());
        };
        // Engine's own best move from the task position.
        const chess = new Chess(step.fen);
        const { bestmove } = await engine.analyse(step.fen, { depth: DEPTH });
        const best = chess.move({
          from: bestmove.slice(0, 2),
          to: bestmove.slice(2, 4),
          promotion: bestmove[4],
        });
        const bestScore = await evaluate(chess.fen());
        for (const san of task.moves) {
          if (task.acceptAnyMate) {
            const probe = new Chess(step.fen);
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
      if (!reply || !first) continue;
      it(`${label}: the scripted reply ${reply} is a fair defence`, async () => {
        const chess = new Chess(step.fen);
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

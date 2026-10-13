import type * as Ort from 'onnxruntime-web';

/**
 * Loading and running the model with ONNX Runtime Web — shared by the model's
 * worker and the tests (which run the very same code in Node).
 */

type OrtModule = Pick<typeof Ort, 'env' | 'InferenceSession' | 'Tensor'>;

export interface MaiaOutput {
  /** Scores for the 4,352-move vocabulary. */
  logits: Float32Array;
  /** Loss, draw and win scores for the side to move. */
  value: Float32Array;
}

/**
 * Creates the inference session from the model's bytes, with the runtime's
 * WebAssembly handed over as bytes too: both come from the device's own copy,
 * so nothing is fetched behind the app's back. One thread is plenty for a
 * model this size (a move in well under a tenth of a second on a laptop) and
 * needs no cross-origin isolation.
 */
export async function createMaiaSession(
  ort: OrtModule,
  model: ArrayBuffer,
  runtime: ArrayBuffer,
): Promise<Ort.InferenceSession> {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = runtime;
  ort.env.logLevel = 'error';
  return ort.InferenceSession.create(new Uint8Array(model), {
    executionProviders: ['wasm'],
    // The export's own advice: the runtime's further CPU fusions trip over its half-precision casts.
    graphOptimizationLevel: 'basic',
    logSeverityLevel: 3,
  });
}

/** Runs the model on one position (`tokens`, from `maiaTokens`) at the given ratings. */
export async function runMaia(
  ort: OrtModule,
  session: Ort.InferenceSession,
  tokens: Float32Array,
  rating: number,
  opponentRating: number,
): Promise<MaiaOutput> {
  const out = await session.run({
    tokens: new ort.Tensor('float32', tokens, [1, 64, 12]),
    elo_self: new ort.Tensor('float32', Float32Array.from([rating]), [1]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from([opponentRating]), [1]),
  });
  const move = out.logits_move;
  const value = out.logits_value;
  if (!move || !value) throw new Error('The model gave no move scores.');
  // Copies: the runtime may reuse its output buffers, and these are sent to another thread.
  return {
    logits: Float32Array.from(move.data as Float32Array),
    value: Float32Array.from(value.data as Float32Array),
  };
}

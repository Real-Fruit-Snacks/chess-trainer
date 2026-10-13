/** Messages between the page and the human-like opponent's worker. */

export type MaiaRequest =
  /** Load the runtime and the model (from the device's cache, else the network). */
  | { type: 'load'; modelUrl: string; runtimeUrl: string }
  /** Score the moves of a position (`tokens` from `maiaTokens`) at a rating. */
  | { type: 'predict'; id: number; tokens: ArrayBuffer; rating: number; opponentRating: number };

export type MaiaResponse =
  | { type: 'loaded' }
  | { type: 'load-failed'; message: string }
  | { type: 'prediction'; id: number; logits: ArrayBuffer; value: ArrayBuffer }
  | { type: 'prediction-failed'; id: number; message: string };

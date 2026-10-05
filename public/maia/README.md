# Human-like opponent

This directory holds the files behind **Play → A human-like opponent**: a neural network trained on
real games that plays like a person of a chosen rating. The files are **not committed** — they are
installed and checksum-verified by `npm run maia:setup`, which also runs automatically before
`npm run dev` and `npm run build`. The app downloads them only when the learner asks for human-like
opponents (about 25 MB), and keeps them for offline play.

| File                            | Purpose                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| `maia3-5m.fp16.onnx`            | Maia-3, 5M parameters, half-precision weights (AGPL-3.0, CSSLab, Toronto) |
| `ort-1.30.0-simd-threaded.wasm` | ONNX Runtime Web's WebAssembly build that runs the model (MIT)            |
| `version.json`                  | What is installed and where it came from, written by the setup script     |

The model comes from a pinned revision of the browser-ready export at
<https://huggingface.co/bqrio/maia3-onnx> (the original checkpoints are at
<https://huggingface.co/UofTCSSLab/Maia3-5M>); the runtime binary is copied from the installed
`onnxruntime-web` package, whose version is pinned in `package.json`. The model's licence, the GNU
Affero General Public License v3, ships with the site as `licence-agpl.txt`.

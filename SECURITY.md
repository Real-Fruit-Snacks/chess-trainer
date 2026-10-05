# Security policy

Chess Trainer is a static, client-only application: there are no accounts and no server, and
everything you do is stored in your browser, on your device. The app talks to the network only when
you ask it to — importing your games from Lichess or chess.com, and the opening explorer and tablebase
lookups, which are off by default (see [Privacy and network use](docs/FEATURES.md#privacy-and-network-use)).
The attack surface is therefore small, but not zero: the app parses user-supplied PGN/FEN, share links
and imported JSON backups, calls those four public APIs on request, and ships a service worker.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report them privately through GitHub's
private vulnerability reporting:
<https://github.com/Real-Fruit-Snacks/chess-trainer/security/advisories/new> (the repository's
**Security** tab → **Report a vulnerability**). Include steps to reproduce and the browser and
operating system you used. You will get an acknowledgement within a few days.

## Scope

In scope:

- Cross-site scripting through imported PGN, FEN, puzzle data, share links or progress backups
- A backup or share link that damages or replaces stored progress without the learner's confirmation
- Service-worker or caching behaviour that could serve tampered content
- Supply-chain issues in the build (for example the engine download checksums or the CI workflows)

Out of scope:

- Issues that require a compromised browser or device
- Denial of service by pasting extremely large PGN files into the analysis board

## Defences in place

- **Content-Security-Policy.** Every page carries a policy (a meta tag written at build time) that
  runs only the site's own scripts and its one inline theme script, by hash; allows connections only
  to the site itself, lichess.org, explorer.lichess.ovh, tablebase.lichess.ovh and api.chess.com; and
  forbids plugins, `<base>` changes and form posts elsewhere. The service worker adds
  `frame-ancestors 'none'` to the pages it serves, so the app cannot be framed by another site.
- **Cross-origin isolation.** Unless threads are switched off in Settings, the service worker serves
  every page with the `Cross-Origin-Opener-Policy` header set to `same-origin` and the
  `Cross-Origin-Embedder-Policy` header set to `require-corp`, which the multi-threaded engine needs:
  a window opened by another site cannot keep a handle on the app's, and nothing cross-origin loads
  without opting in.
- **No HTML from data.** Imported games, comments and share links are rendered as text, never as markup.

## Supply chain

The Stockfish binaries are downloaded from a pinned GitHub release and verified against SHA-256
checksums recorded in `scripts/setup-engine.mjs`; a mismatch aborts the build. Dependencies are locked
with integrity hashes and updated through Dependabot with grouped pull requests, reviewed before
merging. Every GitHub Action is pinned to a commit SHA (Dependabot moves the pins), CI and the deploy
install dependencies with `npm ci --ignore-scripts`, and the site is deployed only after CI has passed
on the exact commit being deployed.

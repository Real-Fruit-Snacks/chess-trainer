# Security policy

Chess Trainer is a static, client-only application: there is no server, no account system and no data
leaves the browser except the initial download of the site itself. The attack surface is therefore
small, but not zero — the app parses user-supplied PGN/FEN and imported JSON backups, and it ships a
service worker.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private vulnerability
reporting on this repository ("Security" tab → "Report a vulnerability"), or contact the maintainers
directly. Include steps to reproduce and the browser/OS you used. You will get an acknowledgement within
a few days.

## Scope

In scope:

- Cross-site scripting through imported PGN, FEN, puzzle data or progress backups
- Service-worker or caching behaviour that could serve tampered content
- Supply-chain issues in the build (for example the engine download checksums)

Out of scope:

- Issues that require a compromised browser or device
- Denial of service by pasting extremely large PGN files into the analysis board

## Supply chain

The Stockfish binaries are downloaded from a pinned GitHub release and verified against SHA-256
checksums recorded in `scripts/setup-engine.mjs`; a mismatch aborts the build. Dependencies are updated
through Dependabot with grouped pull requests and reviewed before merging.

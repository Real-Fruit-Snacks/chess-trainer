# Security policy

Chess Trainer is a static, client-only application: there are no accounts, and everything you do is
stored in your browser, on your device. The app talks to the network only when you ask it to —
importing your games from Lichess or chess.com, the opening explorer and tablebase lookups, which are
off by default, the Lichess account sync, sync between devices, whose relay
([`relay/`](relay/README.md)) stores only data encrypted on the device, and live games, which the
same relay referees (see [Privacy and network use](docs/FEATURES.md#privacy-and-network-use)). The
attack surface is therefore small, but not zero: the app parses user-supplied PGN/FEN, share links
and imported JSON backups, calls those public APIs on request, opens synced vaults, exchanges
messages with other players through the relay, and ships a service worker.

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
- The Lichess sign-in: anything that could leak the token, use it beyond the sync, or connect an
  account the learner did not approve
- Sync between devices: anything that lets the relay, or anyone without the recovery phrase, read,
  change, roll back or delete a learner's data unnoticed (beyond deleting a whole vault, which the
  devices report), learn the phrase, or link vaults to people; and the relay itself
  (`relay/src/`)
- Live games: anything that lets someone take a player's seat, move or act for a player, join a
  private game without its link, bend the rules or the clocks the relay keeps, or put anything a
  player typed in front of another player; and the referee (`relay/src/live/`)
- The offline copy's launcher (`launcher/`): anything that lets another computer reach it, makes it
  serve a file from outside the copy's app folder, or makes it do anything but serve that folder

Out of scope:

- Issues that require a compromised browser or device
- Denial of service by pasting extremely large PGN files into the analysis board

## Defences in place

- **Content-Security-Policy.** Every page carries a policy (a meta tag written at build time) that
  runs only the site's own scripts and its one inline theme script, by hash; allows connections only
  to the site itself, lichess.org, explorer.lichess.ovh, tablebase.lichess.ovh, api.chess.com and
  the sync relay named in `src/site.config.ts` (its WebSockets included); and
  forbids plugins, `<base>` changes and form posts elsewhere. The service worker adds
  `frame-ancestors 'none'` to the pages it serves, so the app cannot be framed by another site.
- **Cross-origin isolation.** Unless threads are switched off in Settings, the service worker serves
  every page with the `Cross-Origin-Opener-Policy` header set to `same-origin` and the
  `Cross-Origin-Embedder-Policy` header set to `require-corp`, which the multi-threaded engine needs:
  a window opened by another site cannot keep a handle on the app's, and nothing cross-origin loads
  without opting in.
- **No HTML from data.** Imported games, comments and share links are rendered as text, never as markup.
- **Lichess sign-in.** The OAuth authorization-code flow with PKCE (S256) and a random `state`: the
  verifier waits in local storage (30 minutes at most, read once, tied to the profile that started
  it — not just this tab's storage, because an installed app on Android finishes the sign-in in a
  browser tab of its own), the answer is refused unless its state matches, and the one-time code is removed from
  the address bar before it is used. The token asks only for `puzzle:read puzzle:write study:read
study:write`, and `board:play` for live games on Lichess (optional: the sync works without it); it
  is kept in the profile's local storage on this device, sent only to lichess.org, never written
  into a backup, an export or a link, and revoked on Lichess by Disconnect and by Reset everything.
  A personal token pasted instead is checked with Lichess (it must allow those four permissions)
  and kept the same way. The token plays only games the learner started from the waiting room, and
  the live board has no engine, as Lichess's rules require. Studies the sync creates are private, with chat and cloning
  off, and only their owner may share or export them.

- **Sync between devices.** The design assumes the relay may be hostile, and keeps it from learning or
  changing anything:
  - **One secret.** A 128-bit random secret, generated on the device, is the only key. It is shown
    as a 12-word recovery phrase and kept in the profile's local storage, and it never leaves the
    device: not to the relay, not into a backup or an export. Join links carry it in the URL
    fragment, which browsers do not send to servers, and the app removes it from the address at
    once.
  - **Three derived values.** HKDF-SHA-256 derives, independently, the vault's name, a write token
    and an AES-256-GCM key. The relay stores the token's SHA-256 only, so its database cannot be used
    to write a vault.
  - **Sealing.** Every write is gzipped and then encrypted with a fresh random nonce. The vault's
    name is bound in as additional data, and a generation number (one more per write) is sealed
    inside, with each device's latest write under a random id the device makes for itself (so a
    device can tell whether a write whose answer was lost went through). A changed, swapped or older
    vault fails to open or is refused, and the device keeps its data.
  - **What the relay sees.** A random-looking name, the ciphertext's size and the times of requests.
    It sees no account, email or device name. It keeps no logs, and it deletes vaults unused for a
    year. Like any server, it sees requesters' IP addresses.
  - **Abuse.** The relay reads a request body as it arrives and refuses it past 1.4 MB, whatever
    its `Content-Length` says, and takes at most one write a second per vault. An optional
    rate-limit binding caps the vaults each address can create.
  - **Limits.** A relay can refuse service or delete a vault: devices then stop syncing and keep their
    data. Anyone holding the phrase holds the data, so the app tells learners to keep it to
    themselves, and to join only with a phrase from their own devices: a device that joins with
    someone else's phrase sends its data to whoever made it.

- **Live games.** The relay is the referee, so it sees what it needs to referee and nothing more:
  - **Seats.** Pairing makes two random 256-bit seat tokens and sends each player their own; the
    game's room keeps their SHA-256 only. A socket must give a seat's token within 10 seconds, or
    it is closed. Game ids and private games' ids are random 128-bit values.
  - **Rules.** The room takes only legal moves (chess.js), on the mover's own turn and in order,
    keeps both clocks itself, and ends the game by the rules; a player's client cannot move for
    the other, stop a clock or declare a result.
  - **No typed text.** Names must be made of the two word lists the app and the relay share, and
    the relay refuses any other; messages are phrase ids from a fixed list. Nothing a player types
    reaches another player. Lichess chat is not shown.
  - **What the relay sees.** The made-up names, the ratings players choose to show, the moves, the
    phrases sent, and, like any server, each socket's IP address (used only to allow at most 10
    sockets from one address, and kept no longer than the socket). It keeps no logs; a game room
    is deleted 10 minutes after its game ends, 6 hours after it was made at most, and a posted game
    goes with its socket. Live games are not encrypted end to end: the referee has to read the moves.
  - **Abuse.** Sockets come only from the app's origins; a message is at most 2 KB, a socket may send
    20 every 10 seconds, the waiting room holds at most 100 games and 2,000 sockets, and one phrase
    every 2 seconds is passed on per player.
- **The offline copy's launcher.** It listens on the loopback addresses only (127.0.0.1 and ::1),
  so no other computer can reach it; it answers only GET and HEAD, with files from inside the
  copy's app folder (the path is cleaned first, and the folder refuses `..` and, on Windows,
  backslashes and drive letters), and with its name and version at one fixed path. It serves every
  response cross-origin isolated and its pages with `frame-ancestors 'none'`, like the live site's
  service worker. It runs nothing and writes nothing; the copy's zip has its SHA-256 next to it.

## Supply chain

The Stockfish binaries are downloaded from a pinned GitHub release and verified against SHA-256
checksums recorded in `scripts/setup-engine.mjs`; a mismatch aborts the build. Dependencies are locked
with integrity hashes and updated through Dependabot with grouped pull requests, reviewed before
merging. Every GitHub Action is pinned to a commit SHA (Dependabot moves the pins), CI and the deploy
install dependencies with `npm ci --ignore-scripts`, and the site is deployed only after CI has passed
on the exact commit being deployed. A release's offline copy is built from the tag's own code, with
the same checksum-verified engine and model, its launchers built by Go with no dependencies beyond
its standard library, and it is tried in a browser before the release is published.

# Security policy

Open File is a static, client-only application: there are no accounts, and everything you do is
stored in your browser, on your device. The app talks to the network only when you ask it to —
importing your games from Lichess or chess.com, the opening explorer and tablebase lookups, which are
off by default, the Lichess account sync, sync between devices, whose relay
([`relay/`](relay/README.md)) stores only data encrypted on the device, live games, which the
same relay referees, and notifications, which it pushes (see
[Privacy and network use](docs/FEATURES.md#privacy-and-network-use)). The attack surface is
therefore small, but not zero: the app parses user-supplied PGN/FEN, share links and imported JSON
backups, calls those public APIs on request, opens synced vaults, exchanges messages with other
players through the relay, receives pushed notices, and ships a service worker.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report them privately through GitHub's
private vulnerability reporting:
<https://github.com/Real-Fruit-Snacks/open-file/security/advisories/new> (the repository's
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
  private game or a race or analysis room without its link, watch a game without its link, see
  what a watcher must not (the phrases, an army before both are in), take a room member's place,
  seed a game's analysis room with moves that game did not have, bend the rules or the clocks the
  relay keeps, or put anything a player typed in front of another player; and the referee
  (`relay/src/live/`)
- Notifications: anything that makes the relay send a request anywhere but a browser's push
  service, read, replace or delete another device's subscription or reminder, or push a device
  what it did not ask for; and a notice that opens anything but the app's own pages
  (`relay/src/push/`, `src/sw/notifications.ts`)
- The offline copy's launcher (`launcher/`): anything that lets another computer reach it, makes it
  serve a file from outside the copy's app folder, or makes it do anything but serve that folder

Out of scope:

- Issues that require a compromised browser or device
- Denial of service by pasting extremely large PGN files into the analysis board

## Defences in place

- **Content-Security-Policy.** Every page carries a policy (a meta tag written at build time) that
  runs only the site's own scripts and its one inline theme script, by hash; allows connections only
  to the site itself, lichess.org, explorer.lichess.org, tablebase.lichess.ovh, api.chess.com and
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
  is kept in the profile's local storage on this device, sent only to lichess.org (and to its
  opening explorer, explorer.lichess.org, which asks for a signed-in account), never written
  into a backup, an export or a link, and revoked on Lichess by Disconnect and by Reset everything.
  A personal token pasted instead is checked with Lichess (it must allow those four permissions)
  and kept the same way. The token plays only games the learner started from Play, and
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
    year (one never changed after it was made, after 30 days). Like any server, it sees requesters'
    IP addresses; for its daily limits it counts the vaults each address makes under a hash of the
    address with a random salt replaced every day, and never stores the address.
  - **Abuse.** The relay reads a request body as it arrives and refuses it past 1.4 MB, whatever
    its `Content-Length` says, and takes at most one write a second, and 1,000 a day, per vault. One
    address (an IPv6 address by its /64) may make 5 vaults a day and everyone together 50, and no
    vault is made once the database reaches 400 MB, so existing vaults keep room to grow. An
    optional rate-limit binding adds a limit a minute. The free plan's daily allowances can still be
    used up by a flood of requests from many addresses; the relay then stops until midnight UTC,
    and nothing kept is lost (see `relay/README.md`, "Abuse").
  - **Limits.** A relay can refuse service or delete a vault: devices then stop syncing and keep their
    data. Anyone holding the phrase holds the data, so the app tells learners to keep it to
    themselves, and to join only with a phrase from their own devices: a device that joins with
    someone else's phrase sends its data to whoever made it.

- **Live games.** The relay is the referee, so it sees what it needs to referee and nothing more:
  - **Seats.** Pairing makes two random 256-bit seat tokens and sends each player their own; the
    game's room keeps their SHA-256 only. A socket must give a seat's token, or ask to watch,
    within 10 seconds, or it is closed. Game ids (made anew at pairing), private games' ids and
    race rooms' ids are random 128-bit values, so a game can be watched, or a room joined, only by
    someone a player gave its link to. A correspondence invitation's open seat goes to the first
    person with the game's link who asks for it, and its token to that socket alone.
  - **Watchers** get what the players may both see — the board, the clocks, the offers, who is
    there and the end — never a seat token, the players' phrases or an army before both are in,
    and can send nothing that changes the game. At most 20 watch one game.
  - **Rules.** The room takes only legal moves (chess.js, and chessops for Chess960), on the
    mover's own turn and in order, keeps both clocks itself, and ends the game by the rules; a
    player's client cannot move for the other, stop a clock or declare a result.
  - **No typed text.** Names must be made of the two word lists the app and the relay share, and
    the relay refuses any other; messages are phrase ids from a fixed list. Nothing a player types
    reaches another player. Lichess chat is not shown.
  - **What the relay sees.** The made-up names, the ratings players choose to show, the moves (and
    the clock after each, for the game's record), the phrases sent, and, like any server, each
    socket's IP address (an IPv6 address by its /64, used only for the limits per address, and kept
    no longer than the socket; the waiting room's hourly counts per address are kept under a hash
    of the address with a salt replaced every day). It keeps no logs; a game room is
    deleted 10 minutes after its game ends, 6 hours after it was made at most, and a posted game
    goes with its socket. A correspondence game's room is kept until 7 days after its end, a year
    after it was made at most, and an invitation nobody takes expires after 7 days. Live games are
    not encrypted end to end: the referee has to read the moves.
  - **Race rooms** keep their members' names and ratings, the SHA-256 of each member's 256-bit
    token, when each came and went, the last 20 phrases and the race (its options, and the last
    race's puzzles, racers, results and places), and are deleted 10 minutes after the last member
    leaves, 6 hours after they were made at most. A room holds 8 members and 20 visitors; the host's
    puzzles are checked as a duel's rounds are.
  - **Analysis rooms** keep what race rooms keep of their members, and a tree of at most 1,000
    moves with the arrows and circles drawn on it, deleted on the same terms. Every move is checked
    as legal from the room's start (chess.js, or chessops for Chess960), and the names a room is
    made with must be the app's word-list names. A finished game's room is made only by that game's
    own room, with the game's real moves, under an id derived from the game's (SHA-256), which the
    waiting room never gives out (its rooms' ids are random): anyone with the game's link — the
    players and those they sent it to — can open it, and nobody can plant other moves under it.
  - **Abuse.** Sockets come only from the app's origins (which keeps out other sites' pages, not
    scripts); a message is at most 2,048 characters, a socket may send 20 every 10 seconds and is
    closed after 10 refusals in a minute, and one phrase every 2 seconds is passed on per player.
    The waiting room holds at most 2,000 sockets (10 from one address), 100 public and 300 private
    games waiting (5 from one address), and one address may be paired into 120 games, make 5
    correspondence invitations and 10 group rooms an hour, counted whether or not its sockets stay.
    A waiting game's id is the SHA-256 of a secret only its poster's device holds, so nobody else
    can post under it, even after the relay restarts. A room takes 12 sockets from one address, 6
    on one seat and 20 that have not said who they are (one more pushes the oldest of those out, so
    they cannot keep a player out), and 30 rematches in a row. A room writes only what changed, so
    refused and repeated messages cost no storage writes.
- **Notifications.** Push goes through the browsers' own push services, and the relay learns no
  more than it needs to deliver:
  - **Subscriptions.** A browser's push subscription (its push service's address and keys) reaches
    the relay only once the learner switches on correspondence notifications or the daily reminder,
    with the browser's permission. A correspondence room keeps it with that player's seat until the
    game ends, or until the player takes it back or the push service says it is gone; the other
    player and watchers never see it. A reminder is kept under the SHA-256 of a random 256-bit
    token only its device holds, with the subscription, the time of day and time zone, when it is
    next due, the last training day, and when it was made and last heard of; it is deleted when
    switched off, or after 60 days unheard of, and the relay keeps 5,000 at most.
  - **Only push services.** The relay writes only to the browsers' push services
    (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`,
    `*.notify.windows.com`, over https with no port), never to any other address a client names,
    and forgets a subscription its service answers `404` or `410` for.
  - **Encrypted and signed.** Each message is encrypted for the browser (RFC 8291, `aes128gcm`), so
    the push service cannot read it, and signed with the relay's own key (VAPID, RFC 8292), made
    on first use and kept in its database, never sent anywhere. The push service sees a message's
    size, time to live and topic (a game's id, or `reminder`).
  - **Notices.** The service worker shows only a checked notice (a title and a line of text of
    bounded length) and opens only the app's own plain paths; anything else opens Home.
  - **Abuse.** The push endpoints take requests only from the app's origins, with bodies of 4 KB at
    most, 20 a minute from one address, and 5 new reminders a day from one address (counted as new
    vaults are); an optional rate-limit binding (`NEW_REMINDERS`) adds a limit a minute.
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

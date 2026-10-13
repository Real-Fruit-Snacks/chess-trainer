# Device-sync relay

A tiny service that lets Open File keep a learner's data in step across
their devices without accounts. Each learner's data is one encrypted file, a
**vault**, which only their devices can open. The relay stores those files and
cannot read them. The relay also lets two people play each other live, or by
correspondence, and others watch (see [Live games](#live-games)), and it pushes
notifications: a correspondence move, and a daily reminder (see
[Push](#push)).

The relay deploys to Cloudflare Workers with a D1 database and three kinds of
Durable Object (the waiting room, game rooms and group rooms), which the free
plan covers. The same code also runs as a plain Node
server for hosting it yourself.

## What the relay sees

The app makes a 12-word recovery phrase from 128 random bits. From those bits,
HKDF-SHA-256 derives three values on the device:

| Value          | Where it goes                                                |
| -------------- | ------------------------------------------------------------ |
| vault id       | the vault's name on the relay                                |
| write token    | sent with every request; the relay keeps only its SHA-256    |
| encryption key | never leaves the device (AES-256-GCM, bound to the vault id) |

So for each vault the relay holds:

- a random-looking name;
- the encrypted, compressed data;
- a version number;
- when the vault was last written and last read;
- the hash of its token.

There are no accounts, emails or device names. The relay writes no logs, and
the Worker's observability is off. Like any web server, Cloudflare (or your
own host) sees the IP address of each request. The relay counts the new vaults
and reminders each address makes a day, for its limits (see [Abuse](#abuse)),
but never stores the address: each count is under a hash of it with a random
salt that is replaced every day. A vault that nobody writes or reads for a year
is deleted, and so is one never written after it was made, once nobody has
written or read it for 30 days.

The data is a backup file, sealed:

- the header `OFS1`;
- a random 12-byte nonce;
- the AES-GCM ciphertext of the gzipped JSON.

A relay that alters a vault, or swaps one vault for another, is caught when
the app opens it. Each write also seals a generation number, one more than the
last. A device refuses a copy older than one it has already seen, so a relay
cannot roll the data back either. Sealed with them is each device's latest
write, under a random id the device makes for itself: a device whose write's
answer was lost learns from the next read whether it went through. The relay
sees none of it. See `src/lib/sync/vaultCrypto.ts` and
`src/lib/sync/deviceSync.ts`.

## API

| Request                 | Answers                                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health`        | `200 {"ok":true,"maxBytes":…,"live":…,"push":true}` (`live`: whether live games are set up; `push`: whether the push endpoints are)                                                                                                                         |
| `GET /v1/vaults/:id`    | `200` the bytes with `ETag: "<version>"`; `204` (no body) when `X-Known-Version` names the current version; `404`                                                                                                                                           |
| `PUT /v1/vaults/:id`    | `201` created (`If-None-Match: *`); `200` replaced (`If-Match: "<version>"`); `412` changed meanwhile (its `ETag` is the current version); `413` too big; `429` too soon, or a daily limit reached; `503` no more new vaults today; `507` the relay is full |
| `DELETE /v1/vaults/:id` | `204`                                                                                                                                                                                                                                                       |

Notes:

- Every vault request needs `Authorization: Bearer <token>`. A wrong token
  gets `403`, and a missing one gets `401`.
- Ids and tokens are 32 bytes in unpadded base64url (43 characters).
- A vault holds at most 1,400,000 bytes.
- A vault can be replaced at most once a second, and 1,000 times a day.
- Making a vault is limited per address and per day (see [Abuse](#abuse)). A
  `429` or `503` says how long to wait in `Retry-After`: until the next
  midnight UTC for a daily limit.
- Writes go by version, so two devices writing at once never overwrite each
  other. The second write gets `412`, and that device merges and writes again.

## Live games

Two people can play each other through the relay. One posts a game in the
waiting room: chess, a variant of it, or a duel, with its options. Another joins
it from the list, or posts the same game and is paired at once. A private game
stays out of the list: only someone with its link can join. Once paired, each
player gets a seat in a game room. The room is the referee: it takes only legal
moves, keeps both clocks itself, and ends the game by the rules.

| Game        | What it is                                                           |
| ----------- | -------------------------------------------------------------------- |
| `chess`     | a game of chess, with a time control and a colour                    |
| `blindfold` | chess with the pieces hidden; the room counts each player's peeks    |
| `army`      | Army Draft: each buys an army in secret, then they play from them    |
| `chess960`  | Chess960: chess from one of 960 start positions, drawn by the room   |
| `race`      | a puzzle race: best of three, the 15-second window, or three minutes |
| `arbiter`   | Arbiter: call the illegal move in a replay before the other does     |
| `judge`     | Who Stands Better?: judge five positions closer to the engine        |

A duel (`race`, `arbiter`, `judge`) is played in rounds. The poster's device is
its host: it sends every round's content once (puzzles, replays, positions,
checked by `src/live/duelRules.mjs`: chess only, never text). The room then runs
the rounds by its own clock (a countdown, the round, its result), takes each
player's result as their device measured it, and decides each round and the
duel.

A **Chess960** game (`chess960`, no options) is posted as a game of chess is,
with a time control and a colour, and is paired only with the same game and
time control. The room draws its start position when it makes the game: a
number from 0 to 959 in the standard numbering (518 is the classical position),
which the app numbers the same way, sent as the snapshot's `startFen`. A
rematch keeps the position, the colours swapped; a new game draws another. The
room referees it on chessops (`src/live/chess960.mjs`): moves in UCI as in
chess, with castling as the king taking its own rook (`e1h1`, as the app's
board sends it, never `e1g1`), and the same endings, offers, claims and
takebacks as chess. It can be watched, and played by correspondence.

A game of chess (and its variants) can be **watched**: anyone with its link
sees the board, the clocks, the offers, who is there and the end, as it
happens, from White's side. A watcher gets nothing private: no seat token, no
phrases, no army before both are in. At most 20 watch one game, and the players
see how many do. Duels are not watched.

A **correspondence** game (`1d`, `2d`, `3d`, `5d`, `7d` or `14d`: days for every
move) is a game of chess, or of Chess960, played over days. It is made only by
invitation: the poster's device sends `create` to the waiting room, which makes
the room at once with the poster's seat and an open one, and the poster shares
the game's link.
Whoever opens the link watches until they take the open seat with `join`; the
first to ask gets it (the room takes one message at a time), and its token
reaches them alone. Each move gives the mover's days back and starts the
other's; a deadline that passes loses on time (a draw when the other side
cannot mate), or aborts the game before both sides have moved. There is no
45-second first move and no claim against a player who is away: players come and
go. An invitation nobody takes in 7 days expires.

### What the relay sees and keeps

- Players go by names the app makes from two word lists, such as "Patient
  Bishop", with the rating the app shows. The relay refuses any other name.
- Players can send only set phrases, such as "Good luck" and "Well played".
  Nothing a player types reaches anyone.
- A game room keeps the two names and ratings, the moves, the clocks and the
  phrases sent; in Army Draft the two armies, in Chess960 the start position,
  in a duel its rounds and each player's results. A seat opens with a random
  token that only its player holds; the room keeps only the token's hash.
- A room is deleted 10 minutes after its game ends, and 6 hours after it was
  made at most; a correspondence game's room 7 days after its end, and a year
  after it was made at most. The waiting room forgets a posted game when its
  socket goes.
- A correspondence player may leave a push subscription with their seat (the
  address of their browser's push service, and its keys). The room keeps it
  until the game ends, and forgets it then, or as soon as the player takes it
  back or their push service says it is gone. Nobody else ever sees it.
- A game room keeps the clock after each move of a game at once, for the
  game's record (`[%clk]` in its PGN). Watchers see what anyone may: the moves,
  the clocks, the names.
- Nothing is logged. The waiting room and the rooms use each socket's IP
  address (an IPv6 address by its /64) for their limits per address, and keep
  it no longer than the socket. The waiting room also counts what each address
  makes in an hour (games paired, invitations, group rooms) under a hash of the
  address with a salt it replaces every day, so the counts outlive the sockets
  but never name an address. Counts from an earlier day stay only until they
  are written over, under a salt that is gone, so they match nobody. Nothing
  about a waiting game is kept once its socket goes.

### Sockets and messages

| Path                | What it is                                       |
| ------------------- | ------------------------------------------------ |
| `GET /v1/lobby`     | the waiting room (a WebSocket)                   |
| `GET /v1/games/:id` | a game room (a WebSocket; ids are 22 characters) |
| `GET /v1/rooms/:id` | a group room: a race or an analysis, up to eight |

All take sockets only from the app's origins (`ALLOWED_ORIGINS`, or `--origin`
on the Node server); others get `403`. That keeps out pages on other sites, not
scripts, which can name any origin: the limits in [Abuse](#abuse) are for those.
A message is JSON text of at most 2,048 characters (16,384 for a duel's host
sending its rounds, a race room's host starting a race, and `create-room`, which
may bring an analysis room's game), and a socket may send 20 every 10 seconds.
A socket whose messages are refused more than 10 times in a minute gets `error`
`rate` and is closed. The text `ping` is answered with `pong`.

The waiting room takes `seek` (post a game, or be paired with one waiting: the
`game`, its `opts`, and for chess and its variants the time control and colour;
and its `secret`, 32 random bytes in base64url that only the poster's device
knows; the game's id is the first 16 bytes of the secret's SHA-256 in
base64url (`seekIdOf` in `src/live/shared.mjs`), and a seek naming another `id`
is refused. So a game posted again after a reconnection, or after the relay
restarts, keeps the link shared before, the same secret from a new socket takes
it over from the old one, and nobody else can post under it; one address may
have 5 games waiting),
`cancel`, `join` (a game by its id) and `create` (a correspondence invitation:
`game` `chess` or `chess960`, `tc` such as `3d`, `color` `white`, `black` or
`random`, `name` and `rating`; 5 an hour from one address). It sends `lobby`
(the public games and how many people are there), `posted`, `cancelled`,
`paired` (the game and its kind, the player's seat token and colour, and the
opponent), `created` (the invitation's game, `kind`, `opts`, `tc`, the poster's
`seat` token and `color`), `gone` (the game to join is no longer there) and
`error` (`busy` past a limit: games waiting, games paired, invitations;
`bad-request` for a seek with no secret, or an id that is not its secret's). The list
goes out at most twice a second, and only when it has changed.

A game room takes `hello` (the seat token, within 10 seconds), `move` (in UCI),
`resign`, `abort`, `draw`, `takeback` and `rematch` (each an offer, an
acceptance or a refusal), `claim` (a win or a draw, once the opponent has been
gone 30 seconds) and `say` (a phrase); in Army Draft `army` (the army bought, in
the first two minutes), in a blindfold game `peek`; once the game is over,
`analyse` (its analysis room: see below). A rematch is refused (`error`
`limit`) after 30 in a row: the players start a new game from Play. It sends
`game` (the whole game, after
`hello`), `move`, `undo`, `offers`, `end`, `present`, `say`, `rematch`, `draft`
(an army is in), `peeks`, `watchers`, `analysis` and `error`. Clock times are
what is left when the message is sent, never the relay's clock.

The `game` snapshot also carries `startFen` (the position the moves start
from: Army Draft's armies once both are in, a Chess960 game's start; null for
chess), `watchers` (how many watch), `open` (the side whose seat is still open
in a correspondence invitation, else null) and `clocks` (the mover's time left
after each move, in milliseconds; empty in correspondence). `watchers`
(`{"t":"watchers","n":2}`) comes whenever that count changes.

To watch, a socket says `{"t":"hello","watch":true}` instead of naming a seat.
It gets the snapshot with `you` null (no armies until both are in, no phrases),
and after it every message the room sends to everyone: `move`, `undo`,
`offers`, `end`, `present`, `draft`, `peeks`, `watchers`, and `rematch` with no
seat in it; never `say`. It may send only `hello` (the snapshot again),
`analyse` once the game is over, and, in a correspondence invitation, `join`
(`{"t":"join","name":…,"rating":…}`): the
first to ask gets `seat` (`{"t":"seat","game":…,"seat":…,"color":…}`, to that
socket alone, which goes on watching: the player connects again with a `hello`
naming the seat), everyone gets the new snapshot, and anyone later gets `error`
`taken`. Anything else gets `error` `watching`. The 21st watcher gets `error`
`full` and the close code `4029`; a duel closes a watcher with `4004`.

A correspondence seat's `hello` may carry `push`: the player's browser
subscription as `PushSubscription.toJSON()` gives it, or null to take it back
(left out, the room keeps what it has). `{"t":"push","sub":…}` says the same at
any time while the game is on. The room then pushes that player, while they
have no socket in the room, their turn ("Your move against …"), the invitation
taken, and the end. A game that ends with nobody taking the invitation ends
`expired`.

A duel's room takes `hello`, `content` (the host's rounds), `result` (a round's
result, or one puzzle of a timed race), `abort` (before it starts), `resign`,
`rematch` and `say`. It sends `game`, `content`, `round` (a countdown or a
round starting, and how long it lasts), `reported` (a player's result: a
judgement only once the round is over), `round-end` (both results, the winner
and the score), `progress` (a timed race), `end`, `present`, `say`, `offers`,
`rematch` and `error`. A rematch swaps the colours, or the host.

A socket closed by the relay gets a code: `1003` a message that is not text,
`1008` too many messages, or too many refused, `1009` a message too big, `4004`
no such game or seat (or a duel to watch; for a game that is not there, at once
on connecting), `4008` no `hello` in time, `4010` the game was deleted (or the
Node server is stopping), `4029` full: the waiting room, a game's watchers, 12
sockets from one address in one room, or a seat with 6 sockets on it already
(the newest is refused, and the app tries again later). A room keeps at most 20
sockets that have not said `hello` yet: one more, and the oldest of them is
closed with `4008`, so sockets that never say who they are cannot keep a
player out. The limits are in `src/live/shared.mjs`, which the app imports too.

### Adding to the rooms

`src/live/room.mjs` and `src/live/lobby.mjs` know nothing of the platform: each
is given its sockets, storage, one timer and a way to make a game
(`RoomPlatform`), and the Node hub and the Durable Objects give them those. To
add a kind of room or a message:

- Who hears it: `tell(make)` reaches each player (their own message, so it may
  hold what is theirs), `show(message)` the watchers, `announce(message)` both.
  A message for everyone must hold nothing private.
- Deadlines: `nextDeadline(now)` gathers every time something must happen; the
  platform keeps one timer (on Cloudflare, the object's one alarm) at the
  earliest, and `timer()` does what is due. Add the new deadline there.
- Saving: every change goes through `save(now)`, which stores the state, sets the
  timer, then delivers the push messages queued with `nudge` (only to players
  away, and only once the change is stored). It writes the state only when it
  differs from what was last written, and moves the timer only when the
  deadline moved, so a refusal or a repeated offer writes nothing; an object
  woken from hibernation reads its alarm rather than setting it again. A
  `timer()` that cannot store its change fails, and Cloudflare tries the alarm
  again.
- A duel is `src/live/duel.mjs`, run by the room through a small context; a new
  kind of room of rounds can follow it.

### Group rooms for up to eight: race rooms and analysis rooms

A **group room** is a room of up to 8 members who came by its link, doing one
thing together: its kind. The kinds are `race`, a puzzle race
(`src/live/raceRoom.mjs`), and `analysis`, a game analysed together
(`src/live/analysisRoom.mjs`, below); `src/live/group.mjs` runs the room itself
(its members, who is here, the host, the phrases) whatever its kind.

A room is made through the waiting room:
`{"t":"create-room","kind":"race","opts":{"format":"rounds","level":1500},"name":…,"rating":…}`
makes it at once, with its maker as host, and answers `room-created` (`room`,
the room's id; `kind`; `opts`; `token`, the maker's member token). One address
may make 10 rooms an hour (then `error` `busy`), counted by the waiting room
whether or not its sockets stay.

A room's socket is `GET /v1/rooms/:id`. Within 10 seconds it says `hello`: with
`token`, as that member (a reconnection keeps their place); without, as a
visitor, who sees the room and may `join` (`{"t":"join","name":…,"rating":…}`).
The joiner alone gets `joined` (`room`, `member`: their id in the room, `token`:
their own). A token the room no longer knows gets `error` `not-member` and the
room as a visitor sees it. A room takes 20 visitors at once (the next gets
`error` `full` and the close code `4029`) and 8 members: a ninth gets `error`
`full`, unless a member has been gone 5 minutes, whose place goes to whoever
joins. A member may `leave` for good (each of their sockets gets `left`, and
goes on as a visitor's) and `say` a phrase, which members hear
(`{"t":"say","by":<member id>,"phrase":…}`). Anything else a member sends is
the kind's.

The room sends `room`, its snapshot (`id`, `kind`; `you`, the socket's member
id or null; `host`; `members`, each with `id`, `name`, `rating` and `here`;
`max`; `chat`, to members only; `state`, the kind's own), after `hello`, `join`,
`leave` and any refusal (`error`); and `members` (`host`, `members`) whenever
someone comes, goes, joins or leaves, or the host changes. The maker is the
host; a host gone 30 seconds hands the room to the member who has been here
longest, and a host who leaves hands it over at once.

A race room's `state`: `opts` (the next race's: `format` `rounds` or `timed`,
`level` a puzzle rating as for duels), `count` (races so far) and `race` (the
one on, or the last: `number`, `format`, `level`, `status` `playing` or `over`,
`racers` (`id`, `name`, `rating`: the members here when it started), `items`
(its puzzles: only in the snapshot and when it starts), `round`, `phase`
(`countdown`, `live`, `reveal`), `phaseIn` and `liveFor` (milliseconds),
`results` (the round on's, by member: `ok` and `ms`), `rounds` (each played:
`results` and `points`), `scores`, `progress` (the timed race's, by member) and,
at the end, `places`). The host sends `options` (`opts`, between races) and
`start` (`opts`, and `items`: the puzzles their device dealt, checked as a
duel's, in up to 16 KB; at least two members must be here); racers send
`result` (`round`, `ok`, `ms`; in the timed race `index`, `ok`, `ms`). Every
change goes to everyone as `{"t":"race","state":…}`.

Rounds: each puzzle's round starts for everyone after a 3-second countdown, and
ends once every racer here has reported, or after 90 seconds; the clean solves
score 5, 4, 3 and 2 points by their times, as each device measured them, and 1
for any other; the result shows for 4 seconds; after five puzzles the most
points win. Timed: one three-minute round of the same puzzles, each at their own
pace, three wrong answers out, over early once every racer here is through; the
most solved win, then the fewer wrong answers. Racers who tie share a place.
Members who join during a race watch it, and race in the next.

### Analysis rooms: a game analysed together

An `analysis` room keeps a tree of moves for up to eight people analysing a
game together, each move checked by the rules of the room's variant (standard
chess on chess.js; Chess960 on chessops, castling as the king taking its own
rook), and the **shared position**: the node the members who follow it are on.
Arrows and circles drawn on a position are kept with it, for everyone. Each
device runs its own engine: the relay analyses nothing.

It is made in one of two ways:

- From the analysis board, through the waiting room:
  `{"t":"create-room","kind":"analysis","opts":{"variant":"standard","fen":…,"moves":"e2e4 e7e5 ( c7c5 ) g1f3","result":"*"},"name":…,"rating":…}`.
  `variant` is `standard` or `chess960`, `fen` the start, `moves` UCI moves
  with variations in brackets as in a PGN (each an alternative to the move
  before it), `result` one of `1-0`, `0-1`, `1/2-1/2` and `*`, and `white` and
  `black` may name the players, only with names the app gives (a stranger's
  text never reaches the others). Every move is played through as the room is
  made: one that is not legal there, or brackets that do not match, and it is
  not made (`error` `failed`). This `create-room` may be up to 16 KB.
- From a game that has ended: a player or a watcher sends `{"t":"analyse"}` to
  the game's room, which makes the analysis room itself, with the game's start,
  moves, players and result, and no members (the first to join is its host),
  under an id derived from the game's: the first 16 bytes of the SHA-256 of
  `analysis-room:<game id>`, in base64url (`analysisRoomId` in
  `src/live/shared.mjs`). Everyone in the game's room hears
  `{"t":"analysis","room":…,"by":…}` (`by` the side that asked, or null for a
  watcher). Asking again finds the same room, or makes it again once it has
  gone. Only a game's own room makes a room under such an id (the waiting room
  gives every room it makes a random one, and rooms are made only between the
  relay's own objects), so nobody can put another game there. A duel has no
  game to analyse (`error` `bad-request`), and a game still on is refused
  (`error` `not-now`).

An analysis room's `state`, in its snapshot: `variant`, `fen`, `white` and
`black` (names, or null), `result`, `nodes` (every move in the tree as
`[id, parent, uci]`, every parent before its children and each node's children
in order, the main line first; the start is node 0 and is not listed), `at`
(the shared position, a node id) and `shapes` (the drawings, by node id: each
`{orig, dest, brush}`, a circle without `dest`, `brush` one of `green`, `red`,
`blue` and `yellow`). Members send:

- `{"t":"move","node":…,"uci":…,"go":true}`: plays a move from any node (legal
  there; a promotion's piece only for a promotion). A move new to the node
  joins it as its last child; the shared position goes there too unless `go`
  is `false` (a member browsing alone). Everyone gets
  `{"t":"added","node":[id,parent,uci],"at":true,"by":…}` (`at`: whether the
  shared position went there), or, for a move there already, `at`.
- `{"t":"at","node":…}`: moves the shared position. Everyone:
  `{"t":"at","node":…,"by":…}`.
- `{"t":"delete","node":…}`: deletes a move and every move after it (not the
  start). Everyone: `{"t":"deleted","node":…,"at":…,"by":…}`, `at` the shared
  position after it (the deleted move's parent, if it was in what went).
- `{"t":"promote","node":…}`: makes a move's line the main line, each move on
  it first among its parent's. Everyone: `{"t":"promoted","node":…,"by":…}`.
- `{"t":"shapes","node":…,"shapes":[…]}`: sets a node's arrows and circles (an
  empty list clears them). Everyone: `{"t":"shapes","node":…,"shapes":[…],"by":…}`.

A refusal is an `error`, with the room again: `illegal` (a move that is not
legal there), `limit` (the tree is full, the line as long as a line can be, or
too much drawn) or `bad-request` (a node no longer there, a drawing that is not
one). The tree holds 1,000 moves, its lines 600 half-moves, a position 16
arrows and circles and the tree 256 (`ANALYSIS_ROOM` in `src/live/shared.mjs`).
Messages are limited as a game's: the app sends a run of steps through the
moves no faster than they allow, the last one always.

What a group room keeps: its members' names and ratings, the hash of each
member's token (never the token), when each came and went, the last 20 phrases,
and its kind's state (a race room: the options, and the last race's puzzles,
racers, results and places; an analysis room: the variant, the start, the moves
of its tree, each with its parent and children, the shared position, the
drawings, the players' names and the result; the positions themselves are
worked out from the moves when needed, and kept in memory only). It is deleted
10 minutes after its last member left (a game's analysis room nobody joins, 10
minutes after it was made), and 6 hours after it was made at most. Close codes
are those of games: `4004` no such room, `4008` no `hello` in time, `4010` the
room was deleted, `4029` too many visitors, 12 sockets from one address, or 6
on one member's token.

To add a kind of group room: a module like `src/live/raceRoom.mjs` or
`src/live/analysisRoom.mjs`
(`GroupKindModule` in `src/live/group.mjs`: `options`, `create`, `view`,
`deadline`, `big`, `message`, `timer`, `presence`), its name in
`src/live/groupKinds.mjs` and in `GROUP_KINDS`, and its options in
`groupOptions` (both in `src/live/shared.mjs`). The room gives the module a
context (`announce`, `tell`, `refuse`, `members`, `here`, `host`); the module's
state is plain data kept with the room's, changed in place, and saved by the
room after each call (written only when it changed), which also keeps the one
timer on the earliest of its own deadlines and the module's.

### On Cloudflare's free plan

The waiting room is one Durable Object, and each game another. The free plan
offers only SQLite-backed Durable Objects, and these are. Their sockets use the
WebSocket Hibernation API: an object whose sockets are quiet leaves memory
without dropping them, so it is billed for time only while it handles a message
or an alarm. The runtime answers `ping` itself, without waking the object.

A socket that connects is a request to the Worker and one to its object. After
that, every 20 messages a socket sends count as one more request; messages to
the players are free. A room's alarms (a first move that never came, a fallen
flag, a draft's or a duel round's end, the room's end) are requests too. On the
free plan, Durable Objects get 100,000 requests and 100,000 written rows a day
of their own. A room writes only what changed:

| What happens                                       | Rows written                      |
| -------------------------------------------------- | --------------------------------- |
| a move                                             | 2 (the game and its next alarm)   |
| an offer, a phrase, a player's last socket going   | 1                                 |
| a step, a move or a drawing in an analysis room    | 1                                 |
| a socket connecting and saying `hello`             | 2 (its deadline set, then lifted) |
| a refusal, a repeated offer, a step to where it is | none                              |
| a socket to a game or room that is not there       | none                              |

The waiting room writes a row for each invitation or group room made, one or
two for each game paired (its counts per address), and one a day for its salt. It
sends its list after a short wait (half a second), which keeps it awake that
long.

A correspondence game's room keeps one alarm, days away: the earliest of the
side to move's deadline, the invitation's expiry and the room's end. It sleeps
in between. A push to a player away is one request of the room's own to their
push service (and, once per object, a read of the relay's push keys in D1).

Each group room is a Durable Object of its own too (`LiveGroup`, the
`LIVE_GROUPS` binding), its state kept under `group`. A race writes a row for
each result, each round's step (countdown, round, result) and each change of
who is here, and its alarm wakes it for each step; a room nobody is in sleeps
until its alarm deletes it. An analysis room writes a row for each change (a
move, a step, a drawing), its tree with it, and nothing for a message that
changes nothing; it has no alarm but its end; a
game's room asking for its analysis room is one request of its own to the
group room's object.

## Push

The relay sends Web Push messages itself, on WebCrypto, with no package: the
message encrypted for the browser (RFC 8291, `aes128gcm`) and signed for its
push service with the relay's own key (VAPID, RFC 8292: an ES256 token for the
push service's origin, good for 12 hours, naming a contact). The key pair is
made on first use and kept: in D1 on Cloudflare, in the SQLite file on the Node
server, in memory for `relay:dev`.

A message is JSON: `{"title":…,"body":…,"url":…,"tag":…}`; `url` is a page of
the app from its root (`play/online/<id>`), and the app's service worker shows
it and opens that page when it is clicked. The relay writes only to the
browsers' push services (`fcm.googleapis.com`, `*.push.services.mozilla.com`,
`*.push.apple.com`, `*.notify.windows.com`; https, no port), never to an
address a client names elsewhere. A push service that answers `404` or `410`
has dropped the subscription: the relay forgets it.

| Kind                         | Sent                                                     | `TTL`  | `Topic`     |
| ---------------------------- | -------------------------------------------------------- | ------ | ----------- |
| a correspondence game's news | by its room, to a player with no socket in it            | 2 days | the game id |
| the daily reminder           | by the cron, at the time chosen, unless trained that day | 1 hour | `reminder`  |

`Urgency` is `normal`. A newer message with the same topic replaces one the push
service has not delivered yet.

| Request                    | Body                                                | Answers                                                       |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `GET /v1/push/key`         |                                                     | `200 {"key":…}`: the relay's public key (65 bytes, base64url) |
| `POST /v1/push/reminder`   | `{"token","subscription","minute","tz","trained"?}` | `201` made / `200` changed, `{"next":<ms>}`; `503` full       |
| `DELETE /v1/push/reminder` | `{"token"}`                                         | `204`                                                         |
| `POST /v1/push/trained`    | `{"token","day","tz"?}`                             | `204`; `404` no such reminder                                 |

- `token` is the device's own: 32 random bytes, base64url. The relay keeps
  its SHA-256 only, as for vaults.
- `subscription` is `PushSubscription.toJSON()`; `minute` the time of day in
  quarter hours (0 to 1,425); `tz` an IANA time zone (`Europe/London`);
  `trained` and `day` a date there (`2026-10-11`): no reminder that day.
- Requests come from the app's origins only (`403` otherwise), with a body of
  4 KB at most (`413`), 20 a minute from one address (`429`). One address may
  make 5 new reminders a day (`429`, `Retry-After` until midnight UTC). The
  relay keeps 5,000 reminders at most.
- A reminder nothing has been heard of for 60 days is deleted: the app keeps it
  again each time it starts.

What the relay keeps of a reminder: the token's hash, the subscription, the
time and time zone, when the next one is due, the last training day, and when
it was made and last heard of. D1 and SQLite keep them in two tables the relay
makes itself on first use (no migration step):

| Table            | Rows                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `push_keys`      | one: `id` 1, `public_key` (base64url), `private_key` (JWK)                                                                |
| `push_reminders` | one per device: `key`, `endpoint`, `p256dh`, `auth`, `minute`, `tz`, `next_at`, `trained_day`, `created_at`, `touched_at` |

## Abuse

Anyone can reach the relay: there are no accounts, and a script can name any
origin. Nobody can read or change someone else's vault, take a seat in someone
else's game, or send text to a stranger; what is left to guard is the relay
itself, and the free plan's daily allowances it shares with everyone. These
limits keep one connection, or one address, from using them up:

| What                                   | Limit                                                                                 | Past it                         |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| new vaults from one address            | 5 a day                                                                               | `429` until midnight UTC        |
| new vaults from everyone               | 50 a day                                                                              | `503` until midnight UTC        |
| the database's size                    | no new vaults past 400 MB (D1's free plan holds 500 MB)                               | `507`                           |
| writes to one vault                    | one a second, 1,000 a day                                                             | `429`                           |
| new reminders from one address         | 5 a day; 5,000 kept in all                                                            | `429` until midnight UTC; `503` |
| sockets in the waiting room            | 10 from one address, 2,000 in all                                                     | closed, `4029`                  |
| games waiting                          | 5 from one address; 100 public and 300 private in all                                 | `error` `busy`                  |
| games paired, invitations, group rooms | 120, 5 and 10 an hour from one address                                                | `error` `busy`                  |
| sockets in a room                      | 6 on one seat or member; 12 from one address; 20 yet to say `hello` (the oldest goes) | closed, `4029` (`4008`)         |
| rematches in a row                     | 30                                                                                    | `error` `limit`                 |
| messages from one socket               | 20 every 10 seconds; 10 refused in a minute                                           | closed, `1008`                  |

An IPv6 address counts by its /64, the smallest block a home or phone is given,
so changing the low bits of an address does not make a new one
(`src/address.mjs`). A home given a larger block (a /56 or a /48) has more
addresses to count by, which the counts for everyone (new vaults a day) still
bound. A network many people share behind one IPv4 address, such as a school's,
shares one allowance.
Days are UTC days. The daily counts are kept in D1 (`quotas`, with the day's
salt in `relay_meta`), and the waiting room's hourly ones in its own storage, so
reconnecting, or reaching another of Cloudflare's locations, does not start
them again. Neither keeps an address: each count is under a hash of the address
with a random salt replaced every day, and D1's counts and salts are deleted
within two days. A room writes only what changed (see [On Cloudflare's free
plan](#on-cloudflares-free-plan)), so a refusal costs no row written.

The limits are in `src/handler.mjs` (`DEFAULT_LIMITS`), `src/push/reminders.mjs`
and `src/live/shared.mjs` (`LIMITS`, `GROUP_LIMITS`, `ABUSE_LIMITS`); the daily
ones can be changed in `wrangler.jsonc` (see the variables below).

What they do not cover: Cloudflare counts every request against the Worker's
100,000 a day, refused ones too, and a busy game still writes for each move.
Someone with many addresses, or a plain flood of requests, can still use up a
day's allowance, and the relay then stops answering until midnight UTC. Nothing
kept is lost, and on the free plan nothing is billed; on Workers Paid the same
flood would be, so put the relay behind a firewall first.

### Behind Cloudflare's firewall

Requests that Cloudflare's firewall blocks never reach the Worker, so they do
not count against its allowance. A `workers.dev` address has no firewall
settings; a domain of your own on Cloudflare does:

1. Give the Worker the domain, and turn off its `workers.dev` address, in
   `wrangler.jsonc`:

   ```jsonc
   "workers_dev": false,
   "routes": [{ "pattern": "sync.example.com", "custom_domain": true }]
   ```

2. In the domain's dashboard, under Security, add a rate-limiting rule for that
   hostname: for example, block an IP address that makes more than 60 requests
   in 10 seconds. The free plan includes one such rule.
3. Deploy the relay, set `syncRelay` in `src/site.config.ts` to
   `https://sync.example.com`, and deploy the app.

## Deploy on Cloudflare

You need a Cloudflare account; the free plan is enough. On the first deploy,
Wrangler may ask you to pick a `workers.dev` subdomain for your account, and to
create the D1 database (Wrangler 4.45 or later does that itself). It then writes
the database's id back into `wrangler.jsonc`: commit that change.

The Worker takes the rules of chess from chess.js, and Chess960's from chessops,
the relay's two packages (`package.json` here), so install them before
deploying:

```sh
cd relay
npm ci
npx wrangler@latest login
npx wrangler@latest deploy
```

From the repository root, `npm run relay:deploy` installs the packages and
deploys.

The first deploy with the `live-v1` migration in `wrangler.jsonc` creates the
two Durable Object classes; later deploys keep them and their games. A deploy drops
every socket for a moment. Games in progress carry on when the players
reconnect, and the app posts a waiting game again, with the same id, when it
reconnects to the waiting room.

The `live-v2` migration creates the group rooms' class (`LiveGroup`, bound as
`LIVE_GROUPS`) on the first deploy that has it; nothing else is needed. A relay
without that binding refuses `/v1/rooms/:id` with `404`. Race rooms in progress
carry on through a deploy as games do: their members' devices reconnect with
their tokens.

Wrangler prints the Worker's address, `https://open-file-sync.<your-subdomain>.workers.dev`.
Put it in `syncRelay` in `src/site.config.ts`, and put the app's origin in
`ALLOWED_ORIGINS` in `wrangler.jsonc`. Pages on other origins then cannot read
the relay's answers. The page's Content Security Policy takes the relay's origin
from `syncRelay` at build time. The offline copy a release carries is served at
`http://localhost:8064` by its launcher: list that origin too, and the copy
syncs and plays live games whenever the computer is online.

Settings in `wrangler.jsonc` (`vars`):

| Variable                    | Meaning                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `ALLOWED_ORIGINS`           | the app's origins, comma-separated (`*` allows any origin); live games take sockets from these only |
| `MAX_BYTES`                 | the largest vault accepted (at most 1,400,000 on D1)                                                |
| `PUSH_CONTACT`              | optional: the contact in push messages' tokens, `mailto:` or `https:`                               |
| `REMINDERS_PER_RUN`         | optional: the most reminders one cron run sends (25)                                                |
| `NEW_VAULTS_PER_ADDRESS`    | optional: new vaults one address may make a day (5)                                                 |
| `NEW_VAULTS_PER_DAY`        | optional: new vaults the relay makes a day, from everyone (50)                                      |
| `MAX_DB_BYTES`              | optional: no new vaults once the database is this big (400,000,000)                                 |
| `MAX_VAULTS`                | optional: no new vaults once there are this many, should D1 not say how big the database is (250)   |
| `VAULT_WRITES_PER_DAY`      | optional: writes one vault takes a day (1,000)                                                      |
| `NEW_REMINDERS_PER_ADDRESS` | optional: new reminders one address may make a day (5)                                              |

Without `PUSH_CONTACT`, push messages name the first `https` origin of
`ALLOWED_ORIGINS`, or `mailto:relay@example.invalid` when there is none. Push
services may write to it about a relay that misbehaves: set one you read.

Two crons run (`triggers` in `wrangler.jsonc`, told apart by their schedule):
once a day (`17 3 * * *`) vaults unused for a year (or, never written after
they were made, for 30 days), reminders unheard of for 60 days, and the counts
per address from before yesterday are deleted; every 15 minutes (`*/15 * * * *`) the reminders due are
sent. A Worker on the free plan makes 50 requests of its own per run, so each
run sends 25 at most and leaves the rest to the next; a reminder found more than
an hour late waits for the next day. The push tables are made in the same D1
database by the Worker itself.

The Worker turns on the `nodejs_compat` flag for Node's `Buffer`. D1 keeps a
vault as base64 text, and native base64 turns a full vault around in about
2 ms, well inside the free plan's 10 ms of CPU per request.

The free plan allows 100,000 requests a day, and D1 100,000 written rows. A
device makes a request when the app opens, a few seconds after each change, and
every 5 minutes while the app is on screen, so a device in use all day makes a
few hundred. If the relay outgrows the free plan, devices see a "could not be
reached" or server error and try again later; Workers Paid lifts the limits.
Each vault write is one row written (the table has no index but its key), and
making a vault about four.

To check it works:

```sh
curl https://open-file-sync.<your-subdomain>.workers.dev/v1/health
```

### Optional: a limit a minute as well

The relay counts new vaults and reminders per address a day itself (see
[Abuse](#abuse)). To limit them a minute too, before anything is counted in D1,
add a rate-limiting binding called `NEW_VAULTS` to `wrangler.jsonc`, then deploy
again:

```jsonc
"ratelimits": [
  { "name": "NEW_VAULTS", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } }
]
```

Each address may then create 10 vaults a minute (Wrangler 4.36 or later reads
the binding). Reading and writing existing vaults is not limited, and Cloudflare
counts at each of its locations separately. Cloudflare does not say which plans
include the binding, so it is not in the default config. A binding called
`NEW_REMINDERS` limits new reminders the same way.

## Host it yourself

The Node server keeps vaults, its push keys and the reminders in a SQLite file
(`node:sqlite`, Node 22.22 or later). It runs live games too, in memory: a
restart ends the games in progress, correspondence games included (for those,
the Cloudflare relay keeps each game in its Durable Object). It sends the
reminders due every minute, and deletes what is long unused once a day. It
needs two packages for the rules, chess.js and chessops; a checkout with the
app's packages installed has them already.

```sh
npm ci --prefix relay
node relay/src/server.mjs --port 8787 --db relay.db --origin https://you.github.io
```

| Option                        | Default                  | Meaning                                              |
| ----------------------------- | ------------------------ | ---------------------------------------------------- |
| `--host`                      | `127.0.0.1`              | the address to listen on                             |
| `--port`                      | `8787`                   |                                                      |
| `--db`                        | `relay.db`               | the SQLite file (`:memory:` keeps nothing)           |
| `--origin`                    | any                      | the app's origin; repeat it, or separate with commas |
| `--max-bytes`                 | 1,400,000                | the largest vault accepted                           |
| `--push-contact`              | the first `https` origin | the contact in push messages, `mailto:` or `https:`  |
| `--new-vaults-per-address`    | 5                        | new vaults one address may make a day                |
| `--new-vaults-per-day`        | 50                       | new vaults the relay makes a day, from everyone      |
| `--max-db-bytes`              | 400,000,000              | no new vaults once the SQLite file is this big       |
| `--vault-writes-per-day`      | 1,000                    | writes one vault takes a day                         |
| `--new-reminders-per-address` | 5                        | new reminders one address may make a day             |

A request body is kept only up to the vault limit, and the rest is dropped as it
arrives, so an endless upload cannot fill the memory.

Put it behind HTTPS (a reverse proxy such as Caddy or nginx). An app served over
HTTPS can only reach an HTTPS relay; `localhost` is the one exception. Then
set `syncRelay` in `src/site.config.ts` to its address.

The proxy must pass WebSocket upgrades on, for live games. Caddy does so by
default; nginx needs `proxy_http_version 1.1` and the `Upgrade` and `Connection`
headers set. Behind a proxy on the same machine, every request seems to come from
that machine, so the relay counts each client by the last address in the
`X-Forwarded-For` header, for every limit per address. Caddy adds it; nginx needs
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. A request from
the machine itself with no such header is not counted against any address.

To try the app against a local relay while developing:

1. Run `npm run relay:dev` (an in-memory relay on port 8787).
2. Set `syncRelay` to `http://localhost:8787`.

## Turning sync off for a fork

Set `syncRelay` to an empty string. Settings then does not offer device sync,
and the page's Content Security Policy names no relay.

## Code

| File                                                                     | What it is                                                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `src/handler.mjs`                                                        | the HTTP API as a Fetch API handler, over any vault store, and the vaults' limits                               |
| `src/address.mjs`                                                        | the address a limit counts by: IPv4 as it is, IPv6 by its /64                                                   |
| `src/quota.mjs`                                                          | the daily counts per address, under a salted hash, in D1, SQLite or memory                                      |
| `src/vaultSchema.mjs`                                                    | the vaults' table, its migration and its queries, the same in D1 and SQLite                                     |
| `src/worker.mjs`                                                         | the Cloudflare Worker: the handler and push endpoints over D1, the two crons, and live games' sockets passed on |
| `src/d1Store.mjs`                                                        | vaults in D1 (base64 text, so a vault fits D1's 2 MB row)                                                       |
| `src/server.mjs`                                                         | the Node server, live games and push included                                                                   |
| `src/sqliteStore.mjs`                                                    | vaults in a SQLite file                                                                                         |
| `src/memoryStore.mjs`                                                    | vaults in memory (tests and `relay:dev`)                                                                        |
| `src/live/shared.mjs`                                                    | what the relay and the app agree on: the games and their options, time controls, names, phrases, limits         |
| `src/live/rules.mjs`                                                     | the rules of a game, on chess.js (Chess960's through `chess960.mjs`)                                            |
| `src/live/chess960.mjs`                                                  | Chess960: the 960 start positions by number, and the game the room referees, on chessops                        |
| `src/live/army.mjs`                                                      | Army Draft's rules: what an army may be, and the position it makes (the app's too)                              |
| `src/live/duelRules.mjs`                                                 | the duels' rules: what a round may hold, what a player may report, who wins (the app's too)                     |
| `src/live/lobby.mjs`                                                     | the waiting room, on any platform                                                                               |
| `src/live/room.mjs`                                                      | a game room, on any platform: the referee and the clocks                                                        |
| `src/live/duel.mjs`                                                      | a duel's rounds, run by its game room                                                                           |
| `src/live/group.mjs`                                                     | a group room of up to eight, on any platform: its members, the host, the phrases                                |
| `src/live/raceRoom.mjs`                                                  | the race room, a kind of group room: its races of rounds or three minutes, and places                           |
| `src/live/analysisRoom.mjs`                                              | the analysis room, a kind of group room: a tree of moves checked by the rules, the shared position, drawings    |
| `src/live/groupKinds.mjs`                                                | the kinds of group room, each with its module                                                                   |
| `src/live/hub.mjs`                                                       | the waiting room and every game room in one process, in memory (the Node server)                                |
| `src/live/websocket.mjs`                                                 | a small WebSocket server for Node                                                                               |
| `src/live/cloudflare.mjs`                                                | the waiting room and the game rooms as Durable Objects                                                          |
| `src/push/webpush.mjs`                                                   | Web Push on WebCrypto: the encryption (RFC 8291), VAPID (RFC 8292), the push services written to                |
| `src/push/reminders.mjs`                                                 | the push endpoints, the daily reminders and their cron, and the rooms' sender                                   |
| `src/push/pushSchema.mjs`                                                | the push tables, the same in D1 and SQLite                                                                      |
| `src/push/d1PushStore.mjs`, `sqlitePushStore.mjs`, `memoryPushStore.mjs` | the push keys and reminders in D1, SQLite or memory                                                             |
| `src/**/*.d.mts`                                                         | types for TypeScript callers (the tests, and the app for `shared.mjs`, `army.mjs` and `duelRules.mjs`)          |
| `package.json`                                                           | the relay's two packages, chess.js and chessops (`npm ci` installs them)                                        |
| `relay.test.ts`                                                          | the vault API's tests                                                                                           |
| `limits.test.ts`, `address.test.ts`                                      | the limits on vaults and reminders, the migration, the counts kept; the address a limit counts by               |
| `live-lobby-limits.test.ts`, `live-room-limits.test.ts`                  | the waiting room's and the rooms' limits, and the rows they write                                               |
| `live.test.ts`                                                           | live games' tests: the rules, the waiting room and the rooms                                                    |
| `live-games.test.ts`                                                     | the variants' and the duels' tests                                                                              |
| `testWorld.ts`                                                           | the live tests' world: a hub on a clock the tests move                                                          |
| `live-transport.test.ts`                                                 | live games' tests: the WebSocket server, the Node server and the Durable Objects                                |
| `live-watch.test.ts`                                                     | watching a game                                                                                                 |
| `live-correspondence.test.ts`                                            | correspondence games, and the rooms' pushes                                                                     |
| `live-chess960.test.ts`                                                  | Chess960: the start positions, the referee, and its games in the rooms                                          |
| `live-groups.test.ts`                                                    | group rooms and race rooms: joining, places kept, the host, expiry, the races                                   |
| `live-analysis.test.ts`                                                  | analysis rooms: legal moves, variations, deletion, the shared position, drawings, bounds, a game's own room     |
| `push.test.ts`                                                           | Web Push (against RFC 8291's own example), VAPID, the reminders, the endpoints, the stores and the cron         |
| `fakeD1.ts`                                                              | a stand-in for D1 over `node:sqlite`, for the tests                                                             |

`npx vitest run relay` runs all the tests.
